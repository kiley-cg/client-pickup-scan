import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyToken } from '@/lib/token/hmac'
import { getJob } from '@/lib/syncore/client'
import { addTrackerEntry } from '@/lib/syncore/webui'
import { getPickup, recordPickup } from '@/lib/pickup-store'
import { sendPickupEmail } from '@/lib/email/smtp'

const Body = z.object({ token: z.string().min(1) })

function formatWhen(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'bad body' }, { status: 400 })
  }

  let jobId: number
  try {
    ;({ jobId } = verifyToken(parsed.data.token))
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid or expired token' }, { status: 401 })
  }

  try {
    const existing = await getPickup(jobId)
    if (existing) {
      return NextResponse.json({ ok: true, alreadyPickedUp: true, at: existing.pickedUpAt })
    }

    const job = await getJob(jobId)
    const pickedUpAt = new Date()
    const description = `Picked up by customer on ${formatWhen(pickedUpAt)}`

    await addTrackerEntry(jobId, description, { textColor: 1 })
    await recordPickup(jobId, pickedUpAt)

    const emailResult = await sendPickupEmail({
      jobId,
      customer: job.customer,
      description: job.description,
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
