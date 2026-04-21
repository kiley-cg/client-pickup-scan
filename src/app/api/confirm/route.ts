import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyToken } from '@/lib/token/hmac'
import { addJobLog, checkPickupState, getJob, PICKUP_SENTINEL } from '@/lib/syncore/client'
import { sendPickupEmail } from '@/lib/email/smtp'

const Body = z.object({ token: z.string().min(1) })

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
    const existing = await checkPickupState(jobId)
    if (existing.alreadyPickedUp) {
      return NextResponse.json({ ok: true, alreadyPickedUp: true, at: existing.at })
    }

    const job = await getJob(jobId)
    const pickedUpAt = new Date()
    const when = pickedUpAt.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'medium',
      timeStyle: 'short'
    })

    const logDescription = [
      `${PICKUP_SENTINEL} Picked up by customer on ${when}`,
      `ISO: ${pickedUpAt.toISOString()}`
    ].join('\n')

    await addJobLog(jobId, logDescription)

    const emailResult = await sendPickupEmail({
      jobId,
      customer: job.customer,
      description: job.description,
      repName: job.repName,
      repEmail: job.repEmail,
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
