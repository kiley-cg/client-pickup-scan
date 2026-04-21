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
 * Fetch a job by ID and normalise to the fields we show on a pickup sticker.
 * Returns `description`, `client.business_name`, `primary_rep.name`, and
 * `customer_service_rep_name` from the /v2/orders/jobs/{id} endpoint.
 *
 * Note: Syncore's job response does not include a rep email — resolution
 * happens downstream via REP_EMAIL_MAP (see src/lib/email/smtp.ts).
 */
export async function getJob(jobId: number): Promise<JobSummary> {
  const res = await fetch(`${BASE}/orders/jobs/${jobId}`, {
    headers: headers(),
    cache: 'no-store'
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Syncore job ${jobId} lookup failed: HTTP ${res.status} ${body.slice(0, 200)}`)
  }
  const job = (await res.json()) as Record<string, unknown>
  const client = job.client as Record<string, unknown> | undefined
  const primaryRep = job.primary_rep as Record<string, unknown> | undefined

  return {
    jobId,
    customer: pickString(client, 'business_name', 'name', 'company') ?? `Job ${jobId}`,
    description: pickString(job, 'description', 'name', 'title') ?? '',
    repName: pickString(primaryRep, 'name', 'full_name') ?? pickString(job, 'customer_service_rep_name'),
    repEmail: pickString(primaryRep, 'email', 'email_address'),
    raw: job
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
