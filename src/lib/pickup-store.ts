import { getStore } from '@netlify/blobs'

export interface PickupRecord {
  jobId: number
  soNumbers: number[]
  pickedUpAt: string
  customer: string
  description: string
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

// Sticker-keyed record (one per physical sticker)
export async function getPickupByKey(key: string): Promise<PickupRecord | null> {
  const data = await store().get(key, { type: 'json' })
  return (data as PickupRecord | null) ?? null
}

export async function recordPickupByKey(key: string, record: PickupRecord): Promise<void> {
  await store().setJSON(key, record)
}

export async function deletePickupByKey(key: string): Promise<void> {
  await store().delete(key)
}

// Per-sales-order markers (for availability checks on the admin page)
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

// Listing — used by /admin/pickups to show recent stickers
export interface RecentPickup {
  key: string
  record: PickupRecord
}

export async function listRecentStickers(sinceIso: string): Promise<RecentPickup[]> {
  const { blobs } = await store().list({ prefix: 'sticker-' })
  const results = await Promise.all(
    blobs.map(async b => {
      const data = (await store().get(b.key, { type: 'json' })) as PickupRecord | null
      if (!data) return null
      if (data.pickedUpAt < sinceIso) return null
      return { key: b.key, record: data }
    })
  )
  return (results.filter(Boolean) as RecentPickup[]).sort((a, b) =>
    b.record.pickedUpAt.localeCompare(a.record.pickedUpAt)
  )
}
