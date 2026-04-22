import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdminFromRequest } from '@/lib/admin-auth'
import { getPickupByKey, mergePickupByKey } from '@/lib/pickup-store'
import { addTrackerEntry } from '@/lib/syncore/webui'

const Body = z.object({ key: z.string().min(1) })

function formatSOs(jobId: number, soNumbers: number[]): string {
  const list = [...soNumbers].sort((a, b) => a - b).map(n => `${jobId}-${n}`).join(', ')
  return soNumbers.length === 1 ? `Sales Order ${list}` : `Sales Orders ${list}`
}

export async function POST(req: Request) {
  if (!isAdminFromRequest(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'bad body' }, { status: 400 })
  }

  const { key } = parsed.data
  if (!key.startsWith('sticker-')) {
    return NextResponse.json({ ok: false, error: 'invalid key' }, { status: 400 })
  }

  const record = await getPickupByKey(key)
  if (!record) {
    return NextResponse.json({ ok: false, error: 'sticker record not found' }, { status: 404 })
  }
  if (record.pickedUpAt) {
    return NextResponse.json({ ok: false, error: 'already picked up' }, { status: 409 })
  }
  if (record.readyAt) {
    return NextResponse.json({ ok: true, alreadyReady: true, at: record.readyAt })
  }

  const description = `${formatSOs(record.jobId, record.soNumbers)} ready in self-pickup. ${record.boxes} ${record.boxes === 1 ? 'box' : 'boxes'}`

  try {
    await addTrackerEntry(record.jobId, description, { textColor: 1 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[mark-ready] tracker entry failed:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  const readyAt = new Date().toISOString()
  await mergePickupByKey(key, { readyAt })

  return NextResponse.json({ ok: true, at: readyAt })
}
