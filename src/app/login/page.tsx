'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'

function LoginForm() {
  const router = useRouter()
  const next = useSearchParams().get('next') || '/'
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    })
    if (res.ok) {
      router.replace(next)
    } else {
      setErr('Incorrect password.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ width: '100%', maxWidth: 360, background: '#fff', padding: 32, borderRadius: 16, border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <Image src="/cg-logo.png" alt="Color Graphics" width={200} height={60} style={{ height: 48, width: 'auto' }} priority />
      </div>
      <h1 style={{ textAlign: 'center', margin: '0 0 6px', fontSize: 20 }}>Pickup Stickers</h1>
      <p style={{ textAlign: 'center', margin: '0 0 24px', color: 'var(--muted)', fontSize: 14 }}>Staff access</p>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Password</label>
      <input type="password" autoFocus value={pw} onChange={e => setPw(e.target.value)} />
      {err && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{err}</p>}
      <button className="btn-primary" type="submit" disabled={busy || !pw} style={{ width: '100%', marginTop: 20 }}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
