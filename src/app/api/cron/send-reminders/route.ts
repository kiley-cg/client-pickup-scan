import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import {
  type PickupRecord,
  type StickerEntry,
  listRecentStickers,
  mergePickupByKey
} from '@/lib/pickup-store'
import { sendCustomerReadyEmail } from '@/lib/email/smtp'

export const dynamic = 'force-dynamic'

const REMINDER_INTERVAL_DAYS = 7
const REMINDER_INTERVAL_MS = REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000

interface ReminderOutcome {
  key: string
  jobId: number
  to: string | null
  sent: boolean
  reason?: string
  reminderCount?: number
}

function isDue(record: PickupRecord, nowMs: number): boolean {
  if (!record.readyAt) return false
  if (record.pickedUpAt) return false
  if (!record.customerEmail) return false
  if (!record.token) return false

  const lastEventIso = record.lastReminderAt ?? record.readyAt
  const lastEventMs = new Date(lastEventIso).getTime()
  if (Number.isNaN(lastEventMs)) return false
  return nowMs - lastEventMs >= REMINDER_INTERVAL_MS
}

export async function POST(req: Request) {
  const expected = env().CRON_SECRET
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const got = req.headers.get('x-cron-secret') ?? ''
  if (got !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  // Pull a generous window — there shouldn't be hundreds of pending stickers.
  const stickers: StickerEntry[] = await listRecentStickers(500)
  const nowMs = Date.now()
  const baseUrl = env().PUBLIC_BASE_URL.replace(/\/$/, '')
  const outcomes: ReminderOutcome[] = []

  for (const { key, record } of stickers) {
    if (!isDue(record, nowMs)) continue

    const result = await sendCustomerReadyEmail({
      to: record.customerEmail!,
      jobId: record.jobId,
      customer: record.customer,
      readyAt: new Date(record.readyAt!),
      scanUrl: `${baseUrl}/scan/${record.token!}`,
      reminder: true
    })

    if (result.sent) {
      const merged = await mergePickupByKey(key, {
        lastReminderAt: new Date().toISOString(),
        reminderCount: (record.reminderCount ?? 0) + 1
      })
      outcomes.push({
        key,
        jobId: record.jobId,
        to: result.to,
        sent: true,
        reminderCount: merged?.reminderCount
      })
    } else {
      outcomes.push({
        key,
        jobId: record.jobId,
        to: result.to,
        sent: false,
        reason: result.reason
      })
    }
  }

  return NextResponse.json({
    ok: true,
    checked: stickers.length,
    sent: outcomes.filter(o => o.sent).length,
    skipped: outcomes.filter(o => !o.sent).length,
    outcomes
  })
}
