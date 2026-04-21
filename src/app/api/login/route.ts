import { NextResponse } from 'next/server'
import { z } from 'zod'
import { env } from '@/lib/env'
import { ADMIN_COOKIE } from '@/lib/admin-auth'

const Body = z.object({ password: z.string().min(1) })

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 })

  if (parsed.data.password !== env().ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: env().ADMIN_PASSWORD,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  })
  return res
}
