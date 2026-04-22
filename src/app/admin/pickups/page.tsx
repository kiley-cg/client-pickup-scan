import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { isAdmin } from '@/lib/admin-auth'
import { listRecentStickers } from '@/lib/pickup-store'
import PickupRow from './PickupRow'

export const dynamic = 'force-dynamic'

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function formatWhen(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export default async function AdminPickupsPage() {
  if (!(await isAdmin())) {
    redirect('/login?next=/admin/pickups')
  }

  const stickers = await listRecentStickers(daysAgoIso(15))

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Image src="/cg-logo.png" alt="Color Graphics" width={220} height={64} style={{ height: 52, width: 'auto' }} priority />
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Recent stickers</h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
            Last 15 days. Clearing removes the record so the sticker can be scanned again.
          </p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Link href="/" className="btn-secondary">← Back to print</Link>
        </div>
      </header>

      {stickers.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
          No stickers in the last 15 days.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1.4fr 1.2fr 60px 110px 140px 140px 110px', gap: 12, padding: '12px 20px', background: 'var(--paper)', fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
            <div>Job</div>
            <div>Customer</div>
            <div>Sales Orders</div>
            <div>Boxes</div>
            <div>Printed</div>
            <div>Ready</div>
            <div>Picked up</div>
            <div style={{ textAlign: 'right' }}>Action</div>
          </div>
          {stickers.map(p => (
            <PickupRow
              key={p.key}
              pickupKey={p.key}
              jobId={p.record.jobId}
              customer={p.record.customer}
              soNumbers={p.record.soNumbers}
              boxes={p.record.boxes}
              printedAt={formatWhen(p.record.printedAt)}
              readyAt={p.record.readyAt ? formatWhen(p.record.readyAt) : null}
              pickedUpAt={p.record.pickedUpAt ? formatWhen(p.record.pickedUpAt) : null}
            />
          ))}
        </div>
      )}
    </main>
  )
}
