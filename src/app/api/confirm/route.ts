import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyToken, tokenKey } from '@/lib/token/hmac'
import { getJob } from '@/lib/syncore/client'
import { addTrackerEntry } from '@/lib/syncore/webui'
import { getPickupByKey, recordPickupByKey } from '@/lib/pickup-store'
import { sendPickupEmail } from '@/lib/email/smtp'

const Body = z.object({ token: z.string().min(1) })

function formatWhen(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

function formatSOs(jobId: number, soNumbers: number[]): string {
  const list = [...soNumbers].sort((a, b) => a - b).map(n => `${jobId}-${n}`).join(', ')
  return soNumbers.length === 1 ? `Sales Order ${list}` : `Sales Orders ${list}`
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'bad body' }, { status: 400 })
  }

  const token = parsed.data.token
  let jobId: number
  let soNumbers: number[]
  try {
    ;({ jobId, soNumbers } = verifyToken(token))
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid or expired token' }, { status: 401 })
  }

  const blobKey = tokenKey(token)

  try {
    const existing = await getPickupByKey(blobKey)
    if (existing) {
      return NextResponse.json({ ok: true, alreadyPickedUp: true, at: existing.pickedUpAt })
    }

    const job = await getJob(jobId)
    const pickedUpAt = new Date()
    const description = `Picked up by customer on ${formatWhen(pickedUpAt)} — ${formatSOs(jobId, soNumbers)}`

    await addTrackerEntry(jobId, description, { textColor: 1 })
    await recordPickupByKey(blobKey, {
      jobId,
      soNumbers,
      pickedUpAt: pickedUpAt.toISOString()
    })

    const emailResult = await sendPickupEmail({
      jobId,
      customer: job.customer,
      description: job.description,
      soNumbers,
      pickedUpAt
    })

    return NextResponse.json({
      ok: true,
      alreadyPickedUp: false,
      at: pickedUpAt.toISOString(),
      email: emailResult
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[confirm] error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
