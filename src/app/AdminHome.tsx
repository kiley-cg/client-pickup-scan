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

interface OutstandingSticker {
  key: string
  soNumbers: number[]
  boxes: number
  printedAt: string
  readyAt: string | null
}

interface JobInfo {
  jobId: number
  customer: string
  description: string
  repName: string | null
  clientEmail: string | null
  salesOrders: SalesOrder[]
  outstandingStickers: OutstandingSticker[]
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
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

  async function refreshJob(jobId: number) {
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
    setSelectedSOs(new Set(data.salesOrders.filter(so => !so.pickedUpAt).map(so => so.number)))
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    const jobId = parseInt(jobNumInput.trim(), 10)
    if (!Number.isInteger(jobId) || jobId <= 0) {
      setError('Enter a numeric job ID.')
      return
    }
    setError(null)
    startTransition(() => refreshJob(jobId))
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
      body: JSON.stringify({
        jobId: job.jobId,
        soNumbers,
        boxes,
        customer,
        description
      })
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
    // Reload so the new sticker shows up in "Outstanding"
    startTransition(() => refreshJob(job.jobId))
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

      {job && job.outstandingStickers.length > 0 && (
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 24, marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Outstanding pickup stickers</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 16px' }}>
            Stickers printed but not yet scanned by the customer. Click <strong>Mark ready for pickup</strong> once the order is finished so the sales rep and CSR know it&apos;s in self-pickup.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {job.outstandingStickers.map(s => (
              <OutstandingStickerRow
                key={s.key}
                jobId={job.jobId}
                sticker={s}
                clientEmail={job.clientEmail}
                onDone={() => startTransition(() => refreshJob(job.jobId))}
              />
            ))}
          </div>
        </section>
      )}

      {job && (
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>New sticker</h2>

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
                        Picked up {so.pickedUpAt ? formatWhen(so.pickedUpAt) : ''}
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

function OutstandingStickerRow({
  jobId,
  sticker,
  clientEmail,
  onDone
}: {
  jobId: number
  sticker: OutstandingSticker
  clientEmail: string | null
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [emailCustomer, setEmailCustomer] = useState(true)
  const [customerEmail, setCustomerEmail] = useState(clientEmail ?? '')
  const sos = [...sticker.soNumbers].sort((a, b) => a - b).map(n => `${jobId}-${n}`).join(', ')
  const isReady = !!sticker.readyAt
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())

  const [testStatus, setTestStatus] = useState<string | null>(null)

  async function markReady() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/mark-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: sticker.key,
          emailCustomer,
          customerEmail: emailCustomer ? customerEmail.trim() : ''
        })
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        setErr(`Failed (${res.status}) ${body.slice(0, 160)}`)
        return
      }
      onDone()
    } finally {
      setBusy(false)
    }
  }

  async function sendTest(reminder: boolean) {
    // Tests ALWAYS prompt for a destination, separate from the customer-email
    // field, so a test never accidentally goes to a real customer.
    const remembered = typeof window !== 'undefined' ? window.localStorage.getItem('cg-test-email') ?? '' : ''
    const dest = window.prompt(
      `Send the ${reminder ? 'weekly reminder' : 'initial'} test email to which address?\n\n(This is for previewing only — the email will NOT go to the customer.)`,
      remembered
    )
    if (dest == null) return
    const trimmed = dest.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setTestStatus('Test cancelled: not a valid email')
      return
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('cg-test-email', trimmed)
    }

    setTestStatus(`Sending test to ${trimmed}…`)
    try {
      const res = await fetch('/api/test-customer-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: trimmed,
          jobId,
          customer: 'Preview Recipient',
          reminder
        })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setTestStatus(`Test failed: ${body.reason ?? body.error ?? `HTTP ${res.status}`}`)
        return
      }
      setTestStatus(`Test sent to ${body.to ?? trimmed}`)
    } catch (e) {
      setTestStatus(`Test failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px 16px',
        border: `1px solid ${isReady ? '#B7E7C5' : 'var(--line)'}`,
        background: isReady ? '#F0FAF3' : '#FFF',
        borderRadius: 10,
        fontSize: 14
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 140 }}>
          <strong>{sos}</strong>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            {sticker.boxes} {sticker.boxes === 1 ? 'box' : 'boxes'} · Printed {formatWhen(sticker.printedAt)}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {isReady ? (
            <span style={{ color: '#1D7A3C', fontWeight: 600 }}>
              Marked ready {sticker.readyAt ? formatWhen(sticker.readyAt) : ''}
            </span>
          ) : (
            <span style={{ color: 'var(--muted)' }}>Not yet marked ready</span>
          )}
        </div>
        {!isReady && (
          <button
            className="btn-primary"
            onClick={markReady}
            disabled={busy || (emailCustomer && !validEmail)}
            style={{ padding: '8px 16px', fontSize: 13 }}
          >
            {busy ? 'Posting…' : 'Mark ready for pickup'}
          </button>
        )}
      </div>

      {!isReady && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={emailCustomer}
              onChange={e => setEmailCustomer(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--red)' }}
            />
            Email customer
          </label>
          <input
            type="email"
            value={customerEmail}
            disabled={!emailCustomer}
            onChange={e => setCustomerEmail(e.target.value)}
            placeholder={clientEmail ? '' : 'No email on file — type one'}
            style={{
              flex: 1,
              minWidth: 220,
              padding: '6px 10px',
              fontSize: 13,
              border: `1px solid ${emailCustomer && !validEmail ? 'var(--red)' : 'var(--line)'}`,
              borderRadius: 8,
              opacity: emailCustomer ? 1 : 0.6
            }}
          />
          {emailCustomer && !validEmail && (
            <span style={{ color: 'var(--red)', fontSize: 12 }}>Enter a valid email</span>
          )}
        </div>
      )}

      {!isReady && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
          <span>Preview email design (sent only to the address you type):</span>
          <button
            type="button"
            onClick={() => sendTest(false)}
            style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
          >
            Send test (initial)
          </button>
          <button
            type="button"
            onClick={() => sendTest(true)}
            style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
          >
            Send test (weekly reminder)
          </button>
          {testStatus && <span style={{ color: testStatus.startsWith('Test sent') ? '#1D7A3C' : 'var(--red)' }}>{testStatus}</span>}
        </div>
      )}

      {err && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}
    </div>
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
