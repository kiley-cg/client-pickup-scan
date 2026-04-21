import { getStore } from '@netlify/blobs'

export interface PickupRecord {
  jobId: number
  pickedUpAt: string
}

function store() {
  return getStore({ name: 'pickups', consistency: 'strong' })
}

export async function getPickup(jobId: number): Promise<PickupRecord | null> {
  const data = await store().get(`job-${jobId}`, { type: 'json' })
  return (data as PickupRecord | null) ?? null
}

export async function recordPickup(jobId: number, pickedUpAt: Date): Promise<void> {
  await store().setJSON(`job-${jobId}`, {
    jobId,
    pickedUpAt: pickedUpAt.toISOString()
  })
}
