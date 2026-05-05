import { NextResponse } from 'next/server'
import { isAdminFromRequest } from '@/lib/admin-auth'
import { getPickupByKey } from '@/lib/pickup-store'
import { performPickup } from '@/lib/pickup-flow'

/**
 * Staff "Mark picked up" — same end state as a customer scan, but
 * triggered from /admin/pickups or the outstanding-sticker rows on
 * the home page. Stops the weekly reminder cron from firing for that
 * sticker (because pickedUpAt is now set) and posts a distinct red
 * tracker entry noting the pickup was logged manually.
 */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!isAdminFromRequest(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { key } = await params
  if (!key.startsWith('sticker-')) {
    return NextResponse.json({ ok: false, error: 'invalid key' }, { status: 400 })
  }

  const record = await getPickupByKey(key)
  if (!record) {
    return NextResponse.json({ ok: false, error: 'sticker record not found' }, { status: 404 })
  }
  if (record.pickedUpAt) {
    return NextResponse.json({ ok: true, alreadyPickedUp: true, at: record.pickedUpAt })
  }

  try {
    const result = await performPickup({
      blobKey: key,
      jobId: record.jobId,
      soNumbers: record.soNumbers,
      manual: true
    })
    return NextResponse.json({
      ok: true,
      alreadyPickedUp: false,
      at: result.at,
      email: result.email
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[manual-confirm] error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
