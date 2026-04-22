import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdminFromRequest } from '@/lib/admin-auth'
import { getPickupByKey, mergePickupByKey } from '@/lib/pickup-store'
import { addTrackerEntry } from '@/lib/syncore/webui'
import { getJob } from '@/lib/syncore/client'
import { sendReadyEmail } from '@/lib/email/smtp'

const Body = z.object({ key: z.string().min(1) })

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

  const { key } = parsed.data
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
  await mergePickupByKey(key, { readyAt: readyAt.toISOString() })

  // Email the assigned salesperson + CSR. Best-effort — don't fail the request.
  let emailResult: Awaited<ReturnType<typeof sendReadyEmail>> | null = null
  try {
    const job = await getJob(record.jobId)
    emailResult = await sendReadyEmail({
      jobId: record.jobId,
      customer: record.customer || job.customer,
      description: record.description || job.description,
      soNumbers: record.soNumbers,
      boxes: record.boxes,
      repName: job.repName,
      csrName: job.csrName,
      readyAt
    })
  } catch (err) {
    console.error('[mark-ready] ready email failed:', err)
  }

  return NextResponse.json({ ok: true, at: readyAt.toISOString(), email: emailResult })
}
