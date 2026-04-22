import { getStore } from '@netlify/blobs'

export interface PickupRecord {
  jobId: number
  soNumbers: number[]
  boxes: number
  customer: string
  description: string
  printedAt: string
  readyAt: string | null
  pickedUpAt: string | null
}

export interface SalesOrderPickup {
  jobId: number
  soNumber: number
  pickedUpAt: string
  stickerKey: string
}

function store() {
  return getStore({ name: 'pickups', consistency: 'strong' })
}

function soKey(jobId: number, soNumber: number): string {
  return `so-${jobId}-${soNumber}`
}

// ─── Sticker lifecycle (keyed by a hash of the token) ─────────────────────────

export async function getPickupByKey(key: string): Promise<PickupRecord | null> {
  const data = await store().get(key, { type: 'json' })
  return (data as PickupRecord | null) ?? null
}

export async function recordPickupByKey(key: string, record: PickupRecord): Promise<void> {
  await store().setJSON(key, record)
}

export async function mergePickupByKey(key: string, patch: Partial<PickupRecord>): Promise<PickupRecord | null> {
  const existing = await getPickupByKey(key)
  if (!existing) return null
  const merged: PickupRecord = { ...existing, ...patch }
  await store().setJSON(key, merged)
  return merged
}

export async function deletePickupByKey(key: string): Promise<void> {
  await store().delete(key)
}

// ─── Per-sales-order markers (for availability checks on the admin page) ──────

export async function getSalesOrderPickup(jobId: number, soNumber: number): Promise<SalesOrderPickup | null> {
  const data = await store().get(soKey(jobId, soNumber), { type: 'json' })
  return (data as SalesOrderPickup | null) ?? null
}

export async function recordSalesOrderPickup(record: SalesOrderPickup): Promise<void> {
  await store().setJSON(soKey(record.jobId, record.soNumber), record)
}

export async function deleteSalesOrderPickup(jobId: number, soNumber: number): Promise<void> {
  await store().delete(soKey(jobId, soNumber))
}

// ─── Listings ─────────────────────────────────────────────────────────────────

export interface StickerEntry {
  key: string
  record: PickupRecord
}

async function listAllStickers(): Promise<StickerEntry[]> {
  const { blobs } = await store().list({ prefix: 'sticker-' })
  const results = await Promise.all(
    blobs.map(async b => {
      const data = (await store().get(b.key, { type: 'json' })) as PickupRecord | null
      if (!data) return null
      return { key: b.key, record: data }
    })
  )
  return results.filter(Boolean) as StickerEntry[]
}

export async function listRecentStickers(sinceIso: string): Promise<StickerEntry[]> {
  const all = await listAllStickers()
  return all
    .filter(s => (s.record.printedAt || '') >= sinceIso)
    .sort((a, b) => (b.record.printedAt || '').localeCompare(a.record.printedAt || ''))
}

export async function listStickersForJob(jobId: number): Promise<StickerEntry[]> {
  const all = await listAllStickers()
  return all
    .filter(s => s.record.jobId === jobId)
    .sort((a, b) => (b.record.printedAt || '').localeCompare(a.record.printedAt || ''))
}
