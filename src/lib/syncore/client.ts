import { env } from '@/lib/env'

const BASE = 'https://api.syncore.app/v2'

function headers() {
  return {
    'x-api-key': env().SYNCORE_API_KEY,
    'Content-Type': 'application/json'
  }
}

export interface SalesOrderSummary {
  id: number
  number: number
  status: string
  total: number
}

export interface JobSummary {
  jobId: number
  customer: string
  description: string
  repName: string | null
  csrName: string | null
  clientEmail: string | null
  salesOrders: SalesOrderSummary[]
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

  const salesOrders: SalesOrderSummary[] = []
  const rawSOs = job.sales_orders
  if (Array.isArray(rawSOs)) {
    for (const so of rawSOs as Record<string, unknown>[]) {
      const id = typeof so.id === 'number' ? so.id : NaN
      const number = typeof so.number === 'number' ? so.number : NaN
      if (!Number.isInteger(id) || !Number.isInteger(number)) continue
      salesOrders.push({
        id,
        number,
        status: typeof so.status === 'string' ? so.status : '',
        total: typeof so.total_value === 'number' ? so.total_value : 0
      })
    }
  }

  return {
    jobId,
    customer: pickString(client, 'business_name', 'name', 'company') ?? `Job ${jobId}`,
    description: pickString(job, 'description', 'name', 'title') ?? '',
    repName: pickString(primaryRep, 'name', 'full_name'),
    csrName: pickString(job, 'customer_service_rep_name'),
    clientEmail: pickString(client, 'email', 'email_address'),
    salesOrders,
    raw: job
  }
}
