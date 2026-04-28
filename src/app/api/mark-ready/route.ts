import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdminFromRequest } from '@/lib/admin-auth'
import { getPickupByKey, mergePickupByKey } from '@/lib/pickup-store'
import { addTrackerEntry } from '@/lib/syncore/webui'
import { getJob } from '@/lib/syncore/client'
import { sendReadyEmail, sendCustomerReadyEmail } from '@/lib/email/smtp'

const Body = z.object({
  key: z.string().min(1),
  emailCustomer: z.boolean().optional().default(false),
  customerEmail: z.string().optional().default('')
})

function formatSOs(jobId: number, soNumbers: number[]): string {
  const list = [...soNumbers].sort((a, b) => a - b).map(n => `${jobId}-${n}`).join(', ')
  return soNumbers.length === 1 ? `Sales Order ${list}` : `Sales Orders ${list}`
}

export async function POST(req: Request) {
  if (!isAdminFromRequest(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'bad body' }, { status: 400 })
  }

  const { key, emailCustomer, customerEmail } = parsed.data
  if (!key.startsWith('sticker-')) {
    return NextResponse.json({ ok: false, error: 'invalid key' }, { status: 400 })
  }

  const record = await getPickupByKey(key)
  if (!record) {
    return NextResponse.json({ ok: false, error: 'sticker record not found' }, { status: 404 })
  }
  if (record.pickedUpAt) {
    return NextResponse.json({ ok: false, error: 'already picked up' }, { status: 409 })
  }
  if (record.readyAt) {
    return NextResponse.json({ ok: true, alreadyReady: true, at: record.readyAt })
  }

  const boxLabel = `${record.boxes} ${record.boxes === 1 ? 'box' : 'boxes'}`
  const trackerText = `${formatSOs(record.jobId, record.soNumbers)} ready in self-pickup. ${boxLabel}`

  try {
    await addTrackerEntry(record.jobId, trackerText, { textColor: 1 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[mark-ready] tracker entry failed:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  const readyAt = new Date()
  const resolvedCustomerEmail = emailCustomer
    ? (customerEmail || '').trim() || null
    : null
  await mergePickupByKey(key, {
    readyAt: readyAt.toISOString(),
    customerEmail: resolvedCustomerEmail,
    lastReminderAt: null,
    reminderCount: 0
  })

  // Email the assigned salesperson + CSR. Best-effort — don't fail the request.
  let staffEmail: Awaited<ReturnType<typeof sendReadyEmail>> | null = null
  let customerEmailResult: Awaited<ReturnType<typeof sendCustomerReadyEmail>> | null = null
  try {
    const job = await getJob(record.jobId)
    // Prefer live Syncore values so any post-print edits (description rename,
    // company name change, etc.) reach the recipient. Stored snapshot is only
    // a fallback for the rare case Syncore returns an empty string.
    const liveCustomer = job.customer || record.customer
    const liveDescription = job.description || record.description

    staffEmail = await sendReadyEmail({
      jobId: record.jobId,
      customer: liveCustomer,
      description: liveDescription,
      soNumbers: record.soNumbers,
      boxes: record.boxes,
      repName: job.repName,
      csrName: job.csrName,
      readyAt
    })

    if (emailCustomer) {
      const to = (customerEmail || job.clientEmail || '').trim()
      if (to && record.token) {
        const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ?? ''
        customerEmailResult = await sendCustomerReadyEmail({
          to,
          jobId: record.jobId,
          customer: liveCustomer,
          description: liveDescription,
          readyAt,
          scanUrl: `${baseUrl}/scan/${record.token}`,
          reminder: false
        })
      } else if (!record.token) {
        customerEmailResult = { sent: false, to, reason: 'Sticker record missing token (printed before v3).' }
      } else {
        customerEmailResult = { sent: false, to: null, reason: 'No customer email provided.' }
      }
    }
  } catch (err) {
    console.error('[mark-ready] email step failed:', err)
  }

  return NextResponse.json({
    ok: true,
    at: readyAt.toISOString(),
    staffEmail,
    customerEmail: customerEmailResult
  })
}
