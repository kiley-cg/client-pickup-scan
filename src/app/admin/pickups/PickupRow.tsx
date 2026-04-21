'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function PickupRow({
  pickupKey,
  jobId,
  customer,
  soNumbers,
  pickedUpAt
}: {
  pickupKey: string
  jobId: number
  customer: string
  soNumbers: number[]
  pickedUpAt: string
}) {
  const router = useRouter()
  const [cleared, setCleared] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const sortedSOs = [...soNumbers].sort((a, b) => a - b)
  const soLabel = sortedSOs.map(n => `${jobId}-${n}`).join(', ')

  function clear() {
    if (cleared) return
    if (!confirm(`Clear pickup for job #${jobId} (${soLabel})? The sticker will be scannable again.`)) return
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

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.6fr 1.2fr 1fr 120px',
        gap: 12,
        padding: '14px 20px',
        borderTop: '1px solid var(--line)',
        alignItems: 'center',
        fontSize: 14,
        opacity: cleared ? 0.5 : 1
      }}
    >
      <div style={{ fontWeight: 800 }}>#{jobId}</div>
      <div>{customer || '—'}</div>
      <div style={{ color: 'var(--muted)' }}>{soLabel}</div>
      <div style={{ color: 'var(--muted)' }}>{pickedUpAt}</div>
      <div style={{ textAlign: 'right' }}>
        {cleared ? (
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>Cleared</span>
        ) : (
          <button className="btn-secondary" onClick={clear} disabled={pending} style={{ padding: '6px 14px', fontSize: 13 }}>
            {pending ? 'Clearing…' : 'Clear'}
          </button>
        )}
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  )
}
