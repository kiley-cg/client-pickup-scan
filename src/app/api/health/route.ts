import { NextResponse } from 'next/server'

export async function GET() {
  const keys = [
    'SYNCORE_API_KEY',
    'PICKUP_HMAC_SECRET',
    'GMAIL_USER',
    'GMAIL_APP_PASSWORD',
    'PUBLIC_BASE_URL',
    'ADMIN_PASSWORD',
    'REP_EMAIL_MAP',
    'CSR_FALLBACK_EMAIL'
  ]
  const present: Record<string, { set: boolean; length: number; preview: string | null }> = {}
  for (const k of keys) {
    const v = process.env[k]
    present[k] = {
      set: !!v && v.length > 0,
      length: v?.length ?? 0,
      preview: v ? (v.length > 8 ? `${v.slice(0, 2)}…${v.slice(-2)}` : '***') : null
    }
  }
  return NextResponse.json({ runtime: 'ok', env: present, nodeEnv: process.env.NODE_ENV })
}
