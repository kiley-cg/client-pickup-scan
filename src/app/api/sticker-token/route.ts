import { NextResponse } from 'next/server'
import { z } from 'zod'
import { signToken } from '@/lib/token/hmac'
import { isAdminFromRequest } from '@/lib/admin-auth'

const Body = z.object({ jobId: z.number().int().positive() })

export async function POST(req: Request) {
  if (!isAdminFromRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad body' }, { status: 400 })
  }
  return NextResponse.json({ token: signToken(parsed.data.jobId) })
}
