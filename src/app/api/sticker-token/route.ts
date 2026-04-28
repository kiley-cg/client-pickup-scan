import { NextResponse } from 'next/server'
import { z } from 'zod'
import { signToken, tokenKey } from '@/lib/token/hmac'
import { isAdminFromRequest } from '@/lib/admin-auth'
import { recordPickupByKey } from '@/lib/pickup-store'

const Body = z.object({
  jobId: z.number().int().positive(),
  soNumbers: z.array(z.number().int().positive()).min(1),
  boxes: z.number().int().min(1).max(99),
  customer: z.string().default(''),
  description: z.string().default('')
})

export async function POST(req: Request) {
  if (!isAdminFromRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad body' }, { status: 400 })
  }

  const { jobId, soNumbers, boxes, customer, description } = parsed.data
  const token = signToken({ jobId, soNumbers })
  const key = tokenKey(token)

  await recordPickupByKey(key, {
    jobId,
    soNumbers,
    boxes,
    customer,
    description,
    printedAt: new Date().toISOString(),
    readyAt: null,
    pickedUpAt: null,
    token,
    customerEmail: null,
    lastReminderAt: null,
    reminderCount: 0
  })

  return NextResponse.json({ token })
}
