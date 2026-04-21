import { getStore } from '@netlify/blobs'

export interface PickupRecord {
  jobId: number
  soNumbers: number[]
  pickedUpAt: string
}

function store() {
  return getStore({ name: 'pickups', consistency: 'strong' })
}

export async function getPickupByKey(key: string): Promise<PickupRecord | null> {
  const data = await store().get(key, { type: 'json' })
  return (data as PickupRecord | null) ?? null
}

export async function recordPickupByKey(key: string, record: PickupRecord): Promise<void> {
  await store().setJSON(key, record)
}
