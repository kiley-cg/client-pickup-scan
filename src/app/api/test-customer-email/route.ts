import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdminFromRequest } from '@/lib/admin-auth'
import { sendCustomerReadyEmail } from '@/lib/email/smtp'
import { getJob } from '@/lib/syncore/client'
import { env } from '@/lib/env'

const Body = z.object({
  to: z.string().email(),
  jobId: z.number().int().positive().optional(),
  customer: z.string().optional(),
  description: z.string().optional(),
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

  const { to, reminder } = parsed.data
  let { jobId, customer, description } = parsed.data

  // Live-pull from Syncore so the preview matches what a real send will
  // produce. If jobId is missing or Syncore lookup fails, fall back to
  // placeholders so staff can still preview the layout.
  if (jobId) {
    try {
      const job = await getJob(jobId)
      customer = customer ?? job.customer
      description = description ?? job.description
    } catch (err) {
      console.warn(`[test-customer-email] Syncore lookup failed for job ${jobId}:`, err)
    }
  }

  jobId = jobId ?? 99999
  customer = customer ?? 'Test Customer'
  description = description ?? 'Embroidered Polos × 24 — Sample Order'

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
    description,
    readyAt,
    scanUrl,
    reminder
  })

  return NextResponse.json({ ok: result.sent, ...result })
}
