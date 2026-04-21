import Image from 'next/image'
import { verifyToken } from '@/lib/token/hmac'
import { getJob, checkPickupState } from '@/lib/syncore/client'
import ConfirmButton from './ConfirmButton'

export const dynamic = 'force-dynamic'

function formatWhen(iso: string | null): string {
  if (!iso) return 'earlier'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'earlier'
  return d.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export default async function ScanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let jobId: number
  try {
    ;({ jobId } = verifyToken(token))
  } catch {
    return <ScanShell>
      <ErrorBlock title="Invalid or expired code">
        This pickup code can&apos;t be read. Please see a Color Graphics staff member.
      </ErrorBlock>
    </ScanShell>
  }

  let customer = ''
  let description = ''
  try {
    const job = await getJob(jobId)
    customer = job.customer
    description = job.description
  } catch {
    return <ScanShell>
      <ErrorBlock title="Order not found">
        We couldn&apos;t load the order for this code. Please see a Color Graphics staff member.
      </ErrorBlock>
    </ScanShell>
  }

  const state = await checkPickupState(jobId).catch(() => null)

  if (state?.alreadyPickedUp) {
    return <ScanShell>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>✅</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>Already picked up</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 4px', fontSize: 15 }}>
          This order was confirmed picked up on <strong style={{ color: 'var(--ink)' }}>{formatWhen(state.at)}</strong>.
        </p>
        <JobCard jobId={jobId} customer={customer} description={description} />
      </div>
    </ScanShell>
  }

  return (
    <ScanShell>
      <h1 style={{ margin: '0 0 6px', fontSize: 22 }}>Confirm pickup</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 20px', fontSize: 14 }}>
        Please confirm you&apos;re picking up this order.
      </p>
      <JobCard jobId={jobId} customer={customer} description={description} />
      <ConfirmButton token={token} />
      <p style={{ color: 'var(--muted)', fontSize: 12, margin: '20px 0 0', textAlign: 'center' }}>
        Tapping below notifies our team and logs the pickup.
      </p>
    </ScanShell>
  )
}

function ScanShell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', padding: 24, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <Image src="/cg-logo.png" alt="Color Graphics" width={220} height={64} style={{ height: 48, width: 'auto' }} priority />
      </div>
      <div style={{ maxWidth: 440, width: '100%', margin: '0 auto', background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 24 }}>
        {children}
      </div>
    </main>
  )
}

function JobCard({ jobId, customer, description }: { jobId: number; customer: string; description: string }) {
  return (
    <div style={{ background: 'var(--paper)', borderRadius: 12, padding: 16, margin: '16px 0' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Job</div>
      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }}>#{jobId}</div>
      {customer && <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{customer}</div>}
      {description && <div style={{ fontSize: 14, color: 'var(--muted)' }}>{description}</div>}
    </div>
  )
}

function ErrorBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>⚠️</div>
      <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>{title}</h1>
      <p style={{ color: 'var(--muted)', margin: 0, fontSize: 14 }}>{children}</p>
    </div>
  )
}
