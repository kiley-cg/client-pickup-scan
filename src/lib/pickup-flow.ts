/**
 * Shared pickup-confirmation flow used by both the customer scan
 * (/api/confirm) and the staff "Mark picked up" admin action
 * (/api/pickups/[key]/confirm).
 *
 * Posts the red Job Tracker entry to Syncore, sets pickedUpAt + per-SO
 * markers in Netlify Blobs, and emails the CSR inbox. Returns enough
 * detail for the caller to build a JSON response.
 */
import { getJob } from '@/lib/syncore/client'
import { addTrackerEntry } from '@/lib/syncore/webui'
import {
  type PickupRecord,
  getPickupByKey,
  mergePickupByKey,
  recordPickupByKey,
  recordSalesOrderPickup
} from '@/lib/pickup-store'
import { sendPickupEmail } from '@/lib/email/smtp'

function formatWhen(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

function formatSOs(jobId: number, soNumbers: number[]): string {
  const list = [...soNumbers].sort((a, b) => a - b).map(n => `${jobId}-${n}`).join(', ')
  return soNumbers.length === 1 ? `Sales Order ${list}` : `Sales Orders ${list}`
}

export interface PerformPickupInput {
  blobKey: string
  jobId: number
  soNumbers: number[]
  /** true when staff clicked "Mark picked up" instead of the customer scanning */
  manual: boolean
}

export interface PerformPickupResult {
  ok: true
  at: string
  alreadyPickedUp: boolean
  email: Awaited<ReturnType<typeof sendPickupEmail>> | null
  record: PickupRecord
}

export async function performPickup(input: PerformPickupInput): Promise<PerformPickupResult> {
  const { blobKey, jobId, soNumbers, manual } = input

  const existing = await getPickupByKey(blobKey)
  if (existing?.pickedUpAt) {
    return { ok: true, at: existing.pickedUpAt, alreadyPickedUp: true, email: null, record: existing }
  }

  const job = await getJob(jobId)
  const pickedUpAt = new Date()
  const pickedUpAtIso = pickedUpAt.toISOString()
  const action = manual
    ? `Manually marked picked up by staff on ${formatWhen(pickedUpAt)}`
    : `Picked up by customer on ${formatWhen(pickedUpAt)}`
  const trackerText = `${action} — ${formatSOs(jobId, soNumbers)}`

  await addTrackerEntry(jobId, trackerText, { textColor: 1 })

  let updatedRecord: PickupRecord
  if (existing) {
    const merged = await mergePickupByKey(blobKey, { pickedUpAt: pickedUpAtIso })
    updatedRecord = merged ?? { ...existing, pickedUpAt: pickedUpAtIso }
  } else {
    // No sticker record on file — write a minimal one. Happens when the
    // customer scan lands on a token that was signed out-of-band, or when
    // an admin confirms a sticker that pre-dates the v3 schema.
    const minimal: PickupRecord = {
      jobId,
      soNumbers,
      boxes: 1,
      customer: job.customer,
      description: job.description,
      printedAt: pickedUpAtIso,
      readyAt: null,
      pickedUpAt: pickedUpAtIso
    }
    await recordPickupByKey(blobKey, minimal)
    updatedRecord = minimal
  }

  await Promise.all(
    soNumbers.map(soNumber =>
      recordSalesOrderPickup({ jobId, soNumber, pickedUpAt: pickedUpAtIso, stickerKey: blobKey })
    )
  )

  const emailResult = await sendPickupEmail({
    jobId,
    customer: updatedRecord.customer || job.customer,
    description: updatedRecord.description || job.description,
    soNumbers,
    pickedUpAt
  })

  return {
    ok: true,
    at: pickedUpAtIso,
    alreadyPickedUp: false,
    email: emailResult,
    record: updatedRecord
  }
}
