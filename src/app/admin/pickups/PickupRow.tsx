'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function PickupRow({
  pickupKey,
  jobId,
  customer,
  soNumbers,
  boxes,
  printedAt,
  readyAt,
  pickedUpAt
}: {
  pickupKey: string
  jobId: number
  customer: string
  soNumbers: number[]
  boxes: number
  printedAt: string
  readyAt: string | null
  pickedUpAt: string | null
}) {
  const router = useRouter()
  const [cleared, setCleared] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [confirmPending, startConfirm] = useTransition()

  const sortedSOs = [...soNumbers].sort((a, b) => a - b)
  const soLabel = sortedSOs.map(n => `${jobId}-${n}`).join(', ')
  const isPickedUp = !!pickedUpAt

  function clear() {
    if (cleared) return
    if (!confirm(`Clear sticker record for job #${jobId} (${soLabel})? The sticker will be scannable again.`)) return
    startTransition(async () => {
      const res = await fetch(`/api/pickups/${encodeURIComponent(pickupKey)}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        setError(`Failed (${res.status}) ${body.slice(0, 140)}`)
        return
      }
      setCleared(true)
      router.refresh()
    })
  }

  function markPickedUp() {
    if (isPickedUp || cleared) return
    if (!confirm(`Mark job #${jobId} (${soLabel}) as picked up?\n\nThis will post a red entry to the Syncore Job Tracker, email csr@colorgraphicswa.com, and stop any further reminders to the customer.`)) return
    setError(null)
    startConfirm(async () => {
      const res = await fetch(`/api/pickups/${encodeURIComponent(pickupKey)}/confirm`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        setError(`Failed (${res.status}) ${body.slice(0, 140)}`)
        return
      }
      router.refresh()
    })
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 1.4fr 1.2fr 60px 110px 140px 140px 140px',
        gap: 12,
        padding: '14px 20px',
        borderTop: '1px solid var(--line)',
        alignItems: 'center',
        fontSize: 13,
        opacity: cleared ? 0.5 : 1
      }}
    >
      <div style={{ fontWeight: 800 }}>#{jobId}</div>
      <div>{customer || '—'}</div>
      <div style={{ color: 'var(--muted)' }}>{soLabel}</div>
      <div>{boxes}</div>
      <div style={{ color: 'var(--muted)' }}>{printedAt}</div>
      <div style={readyAt ? { color: '#1D7A3C', fontWeight: 600 } : { color: 'var(--muted)' }}>
        {readyAt ?? '—'}
      </div>
      <div style={pickedUpAt ? { color: 'var(--red)', fontWeight: 600 } : { color: 'var(--muted)' }}>
        {pickedUpAt ?? '—'}
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        {cleared ? (
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>Cleared</span>
        ) : (
          <>
            {!isPickedUp && (
              <button
                onClick={markPickedUp}
                disabled={confirmPending || pending}
                style={{ padding: '6px 12px', fontSize: 12, background: '#111', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', minWidth: 110 }}
              >
                {confirmPending ? 'Marking…' : 'Mark picked up'}
              </button>
            )}
            <button
              className="btn-secondary"
              onClick={clear}
              disabled={pending || confirmPending}
              style={{ padding: '6px 14px', fontSize: 12, minWidth: 110 }}
            >
              {pending ? 'Clearing…' : 'Clear'}
            </button>
          </>
        )}
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  )
}
