'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface SalesOrder {
  id: number
  number: number
  status: string
  total: number
  pickedUpAt: string | null
}

function formatPickupDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

interface JobInfo {
  jobId: number
  customer: string
  description: string
  repName: string | null
  salesOrders: SalesOrder[]
}

export default function AdminHome() {
  const [jobNumInput, setJobNumInput] = useState('')
  const [job, setJob] = useState<JobInfo | null>(null)
  const [customer, setCustomer] = useState('')
  const [description, setDescription] = useState('')
  const [boxes, setBoxes] = useState(1)
  const [selectedSOs, setSelectedSOs] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    const jobId = parseInt(jobNumInput.trim(), 10)
    if (!Number.isInteger(jobId) || jobId <= 0) {
      setError('Enter a numeric job ID.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/job/${jobId}`)
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        setError(`Lookup failed (${res.status}). ${body.slice(0, 160)}`)
        setJob(null)
        return
      }
      const data = (await res.json()) as JobInfo
      setJob(data)
      setCustomer(data.customer)
      setDescription(data.description)
      // Default-select only SOs not yet picked up
      setSelectedSOs(new Set(data.salesOrders.filter(so => !so.pickedUpAt).map(so => so.number)))
    })
  }

  function toggleSO(number: number, disabled: boolean) {
    if (disabled) return
    setSelectedSOs(prev => {
      const next = new Set(prev)
      if (next.has(number)) next.delete(number)
      else next.add(number)
      return next
    })
  }

  async function printSticker() {
    if (!job || selectedSOs.size === 0) return
    const soNumbers = Array.from(selectedSOs).sort((a, b) => a - b)
    const tokenRes = await fetch('/api/sticker-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.jobId, soNumbers })
    })
    if (!tokenRes.ok) {
      setError('Could not mint sticker token.')
      return
    }
    const { token } = (await tokenRes.json()) as { token: string }
    const params = new URLSearchParams({
      t: token,
      c: customer,
      d: description,
      b: String(Math.max(1, boxes))
    })
    window.open(`/sticker/${job.jobId}?${params.toString()}`, '_blank', 'noopener')
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <Image src="/cg-logo.png" alt="Color Graphics" width={220} height={64} style={{ height: 52, width: 'auto' }} priority />
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Pickup Stickers</h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>Enter a job number to print a pickup sticker.</p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Link href="/admin/pickups" className="btn-secondary">Recent pickups</Link>
        </div>
      </header>

      <form onSubmit={lookup} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Job #"
          value={jobNumInput}
          onChange={e => setJobNumInput(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn-primary" type="submit" disabled={pending || !jobNumInput.trim()}>
          {pending ? 'Looking up…' : 'Look up'}
        </button>
      </form>

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: '#FEECEE', color: 'var(--red)', marginBottom: 24, fontSize: 14 }}>
          {error}
        </div>
      )}

      {job && (
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Sticker details</h2>

          <Field label="Job #" value={String(job.jobId)} readOnly />

          <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', margin: '16px 0 6px' }}>Customer</label>
          <input type="text" value={customer} onChange={e => setCustomer(e.target.value)} />

          <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', margin: '16px 0 6px' }}>Order description</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} />

          <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', margin: '20px 0 10px' }}>
            Sales orders on this pickup
          </label>
          {job.salesOrders.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>No sales orders found for this job.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {job.salesOrders.map(so => {
                const disabled = !!so.pickedUpAt
                const checked = selectedSOs.has(so.number) && !disabled
                return (
                  <label
                    key={so.number}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      border: `1px solid ${checked ? 'var(--red)' : 'var(--line)'}`,
                      borderRadius: 10,
                      background: disabled ? '#F3F3F3' : checked ? '#FEECEE' : '#fff',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      opacity: disabled ? 0.6 : 1
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleSO(so.number, disabled)}
                      style={{ width: 18, height: 18, accentColor: 'var(--red)' }}
                    />
                    <strong style={{ minWidth: 80 }}>#{job.jobId}-{so.number}</strong>
                    {disabled ? (
                      <span style={{ color: 'var(--muted)', flex: 1, fontSize: 13 }}>
                        Picked up {so.pickedUpAt ? formatPickupDate(so.pickedUpAt) : ''}
                      </span>
                    ) : (
                      <>
                        <span style={{ color: 'var(--muted)', flex: 1 }}>{so.status}</span>
                        <span style={{ color: 'var(--muted)' }}>${so.total.toFixed(2)}</span>
                      </>
                    )}
                  </label>
                )
              })}
            </div>
          )}

          <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', margin: '20px 0 6px' }}>Boxes</label>
          <input
            type="number"
            min={1}
            max={99}
            value={boxes}
            onChange={e => setBoxes(Math.max(1, parseInt(e.target.value || '1', 10)))}
            style={{ maxWidth: 120 }}
          />
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>
            Prints {boxes} sticker{boxes === 1 ? '' : 's'}, labeled <em>1 of {boxes}</em>, <em>2 of {boxes}</em>, …
          </p>

          {job.repName && (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '16px 0 0' }}>
              Assigned rep: <strong style={{ color: 'var(--ink)' }}>{job.repName}</strong>
            </p>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button className="btn-primary" onClick={printSticker} disabled={selectedSOs.size === 0}>
              Print sticker{boxes === 1 ? '' : 's'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setJob(null); setJobNumInput(''); setCustomer(''); setDescription(''); setBoxes(1); setSelectedSOs(new Set())
              }}
            >
              Start over
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

function Field({ label, value, readOnly }: { label: string; value: string; readOnly?: boolean }) {
  return (
    <>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{label}</label>
      <input type="text" value={value} readOnly={readOnly} style={readOnly ? { background: 'var(--paper)' } : undefined} />
    </>
  )
}
