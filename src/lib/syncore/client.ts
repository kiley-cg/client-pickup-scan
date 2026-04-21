import { env } from '@/lib/env'

const BASE = 'https://api.syncore.app/v2'

function headers() {
  return {
    'x-api-key': env().SYNCORE_API_KEY,
    'Content-Type': 'application/json'
  }
}

export interface JobSummary {
  jobId: number
  customer: string
  description: string
  repName: string | null
  repEmail: string | null
  raw: unknown
}

export interface JobLogEntry {
  id?: number
  description: string
  created_at?: string
  createdAt?: string
  [key: string]: unknown
}

function extractArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const key of ['results', 'data', 'items', 'logs', 'salesorders', 'orders']) {
      if (Array.isArray(d[key])) return d[key] as Record<string, unknown>[]
    }
  }
  return []
}

function pickString(obj: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!obj) return null
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/**
 * Fetch the first sales order for a job and normalise to the fields we show on
 * a pickup sticker. Mirrors the lookup pattern from CG-Dashboard/src/lib/syncore/client.ts.
 */
export async function getJob(jobId: number): Promise<JobSummary> {
  const res = await fetch(`${BASE}/orders/jobs/${jobId}/salesorders`, {
    headers: headers(),
    cache: 'no-store'
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Syncore job ${jobId} lookup failed: HTTP ${res.status} ${body.slice(0, 200)}`)
  }
  const arr = extractArray(await res.json())
  if (arr.length === 0) throw new Error(`Job ${jobId} has no sales orders`)

  const so = arr[0]
  const client = so.client as Record<string, unknown> | undefined
  const rep =
    (so.sales_rep as Record<string, unknown> | undefined) ||
    (so.rep as Record<string, unknown> | undefined) ||
    (so.assigned_to as Record<string, unknown> | undefined) ||
    (so.user as Record<string, unknown> | undefined)

  return {
    jobId,
    customer: pickString(client, 'business_name', 'name', 'company') ?? `Job ${jobId}`,
    description: pickString(so, 'name', 'description', 'title') ?? '',
    repName: pickString(rep, 'name', 'full_name', 'display_name'),
    repEmail: pickString(rep, 'email', 'email_address'),
    raw: so
  }
}

export async function getJobLogs(jobId: number): Promise<JobLogEntry[]> {
  const res = await fetch(`${BASE}/orders/jobs/${jobId}/logs`, {
    headers: headers(),
    cache: 'no-store'
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Syncore logs fetch for job ${jobId} failed: HTTP ${res.status} ${body.slice(0, 200)}`)
  }
  const arr = extractArray(await res.json())
  return arr.map(e => ({
    ...e,
    description: typeof e.description === 'string' ? e.description : ''
  })) as JobLogEntry[]
}

export async function addJobLog(jobId: number, description: string): Promise<JobLogEntry> {
  const res = await fetch(`${BASE}/orders/jobs/${jobId}/logs`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ description })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Syncore add-log for job ${jobId} failed: HTTP ${res.status} ${body.slice(0, 200)}`)
  }
  return (await res.json()) as JobLogEntry
}

/**
 * Idempotency sentinel — every pickup log entry starts with this.
 * Detect prior pickups by scanning the job log for this prefix.
 */
export const PICKUP_SENTINEL = 'CG-PICKUP::'

export interface PickupState {
  alreadyPickedUp: boolean
  at: string | null
}

export async function checkPickupState(jobId: number): Promise<PickupState> {
  const logs = await getJobLogs(jobId)
  const existing = logs.find(l => l.description?.startsWith(PICKUP_SENTINEL))
  if (!existing) return { alreadyPickedUp: false, at: null }
  const at =
    (typeof existing.created_at === 'string' && existing.created_at) ||
    (typeof existing.createdAt === 'string' && existing.createdAt) ||
    null
  return { alreadyPickedUp: true, at }
}
