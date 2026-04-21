import { NextResponse } from 'next/server'
import { isAdminFromRequest } from '@/lib/admin-auth'
import {
  getPickupByKey,
  deletePickupByKey,
  deleteSalesOrderPickup
} from '@/lib/pickup-store'

export async function DELETE(req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!isAdminFromRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { key } = await params
  if (!key.startsWith('sticker-')) {
    return NextResponse.json({ error: 'invalid key' }, { status: 400 })
  }

  const record = await getPickupByKey(key)
  if (!record) {
    // Nothing to clear — treat as success so the UI is idempotent.
    return NextResponse.json({ ok: true, alreadyCleared: true })
  }

  await Promise.all(
    record.soNumbers.map(soNumber => deleteSalesOrderPickup(record.jobId, soNumber))
  )
  await deletePickupByKey(key)

  return NextResponse.json({ ok: true })
}
