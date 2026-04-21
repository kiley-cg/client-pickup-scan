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
  raw: unknown
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
    raw: job
  }
}
