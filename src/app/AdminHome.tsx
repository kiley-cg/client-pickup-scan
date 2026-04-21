'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'

interface JobInfo {
  jobId: number
  customer: string
  description: string
  repName: string | null
  repEmail: string | null
}

export default function AdminHome() {
  const [jobNumInput, setJobNumInput] = useState('')
  const [job, setJob] = useState<JobInfo | null>(null)
  const [customer, setCustomer] = useState('')
  const [description, setDescription] = useState('')
  const [boxes, setBoxes] = useState(1)
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
    })
  }

  async function printSticker() {
    if (!job) return
    const tokenRes = await fetch('/api/sticker-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.jobId })
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

          <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', margin: '16px 0 6px' }}>Boxes</label>
          <input
            type="number"
            min={1}
            max={99}
            value={boxes}
            onChange={e => setBoxes(parseInt(e.target.value || '1', 10))}
            style={{ maxWidth: 120 }}
          />

          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '16px 0 0' }}>
            Assigned rep: <strong style={{ color: 'var(--ink)' }}>{job.repName ?? '—'}</strong>
            {job.repEmail ? ` (${job.repEmail})` : ''}
          </p>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button className="btn-primary" onClick={printSticker}>Print sticker</button>
            <button className="btn-secondary" onClick={() => { setJob(null); setJobNumInput(''); setCustomer(''); setDescription(''); setBoxes(1) }}>
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
