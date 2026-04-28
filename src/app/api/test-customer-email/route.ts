import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdminFromRequest } from '@/lib/admin-auth'
import { sendCustomerReadyEmail } from '@/lib/email/smtp'
import { env } from '@/lib/env'

const Body = z.object({
  to: z.string().email(),
  jobId: z.number().int().positive().optional(),
  customer: z.string().optional(),
  reminder: z.boolean().optional().default(false)
})

export async function POST(req: Request) {
  if (!isAdminFromRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad body', details: parsed.error.format() }, { status: 400 })
  }

  const { to, jobId = 99999, customer = 'Test Customer', reminder } = parsed.data

  // Build a fake "ready since" timestamp so reminder copy reads naturally.
  const readyAt = reminder
    ? new Date(Date.now() - 9 * 24 * 60 * 60 * 1000) // 9 days ago
    : new Date()

  const baseUrl = env().PUBLIC_BASE_URL.replace(/\/$/, '')
  const scanUrl = `${baseUrl}/scan/example-test-token`

  const result = await sendCustomerReadyEmail({
    to,
    jobId,
    customer,
    readyAt,
    scanUrl,
    reminder
  })

  return NextResponse.json({ ok: result.sent, ...result })
}
