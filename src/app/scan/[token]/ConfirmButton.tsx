'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface ConfirmResponse {
  ok: boolean
  alreadyPickedUp?: boolean
  at?: string | null
  error?: string
}

export default function ConfirmButton({ token }: { token: string }) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        })
        const data = (await res.json()) as ConfirmResponse
        if (!res.ok || !data.ok) {
          setStatus('error')
          setMessage(data.error ?? 'Something went wrong.')
          return
        }
        setStatus('done')
        setMessage(data.alreadyPickedUp ? 'This order was already marked picked up.' : 'Pickup confirmed — thanks!')
        setTimeout(() => router.refresh(), 800)
      } catch {
        setStatus('error')
        setMessage('Network error. Please try again.')
      }
    })
  }

  if (status === 'done') {
    return (
      <div style={{ marginTop: 16, padding: 16, background: '#E8F7EE', color: '#11753A', borderRadius: 12, textAlign: 'center', fontWeight: 600 }}>
        ✅ {message}
      </div>
    )
  }

  return (
    <>
      <button
        className="btn-primary"
        onClick={onClick}
        disabled={pending}
        style={{ width: '100%', marginTop: 8, padding: '18px 24px', fontSize: 16 }}
      >
        {pending ? 'Confirming…' : 'Confirm pickup'}
      </button>
      {status === 'error' && message && (
        <div style={{ marginTop: 12, padding: 12, background: '#FEECEE', color: 'var(--red)', borderRadius: 8, fontSize: 14, textAlign: 'center' }}>
          {message}
        </div>
      )}
    </>
  )
}
