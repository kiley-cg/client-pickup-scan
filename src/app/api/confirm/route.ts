import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyToken, tokenKey } from '@/lib/token/hmac'
import { performPickup } from '@/lib/pickup-flow'

const Body = z.object({ token: z.string().min(1) })

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

  try {
    const result = await performPickup({
      blobKey: tokenKey(token),
      jobId,
      soNumbers,
      manual: false
    })
    return NextResponse.json({
      ok: true,
      alreadyPickedUp: result.alreadyPickedUp,
      at: result.at,
      email: result.email
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[confirm] error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
