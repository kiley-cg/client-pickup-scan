import { env } from '@/lib/env'

/**
 * Syncore's Job Tracker (Job Log) does not have an exposed REST API.
 * All writes go through the authenticated web UI at ateasesystems.net,
 * matching the pattern used by UPS-Shipping-Import.
 */
const WEB_BASE = 'https://www.ateasesystems.net'

interface Session {
  cookie: string
  expiresAt: number
}

let cachedSession: Session | null = null
const SESSION_TTL_MS = 20 * 60 * 1000

function mergeSetCookies(headers: Headers, jar: Map<string, string>) {
  for (const raw of headers.getSetCookie()) {
    const [pair] = raw.split(';')
    const idx = pair.indexOf('=')
    if (idx <= 0) continue
    const name = pair.slice(0, idx).trim()
    const value = pair.slice(idx + 1).trim()
    if (name) jar.set(name, value)
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return Array.from(jar.entries()).map(([n, v]) => `${n}=${v}`).join('; ')
}

async function login(): Promise<Session> {
  const { SYNCORE_USERNAME, SYNCORE_PASSWORD } = env()
  if (!SYNCORE_USERNAME || !SYNCORE_PASSWORD) {
    throw new Error('SYNCORE_USERNAME / SYNCORE_PASSWORD not configured')
  }

  const loginUrl = `${WEB_BASE}/Account/Login`
  const jar = new Map<string, string>()

  const getRes = await fetch(loginUrl, { redirect: 'manual' })
  mergeSetCookies(getRes.headers, jar)
  const html = await getRes.text()

  const tokenMatch =
    html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/) ||
    html.match(/<input[^>]+name="__RequestVerificationToken"[^>]+value="([^"]+)"/)
  if (!tokenMatch) {
    throw new Error('Could not find CSRF token on Syncore login page')
  }
  const csrfToken = tokenMatch[1]

  const body = new URLSearchParams({
    Email: SYNCORE_USERNAME,
    Password: SYNCORE_PASSWORD,
    __RequestVerificationToken: csrfToken
  })

  const postRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(jar)
    },
    body: body.toString(),
    redirect: 'manual'
  })
  mergeSetCookies(postRes.headers, jar)

  const location = postRes.headers.get('location') ?? ''
  if (postRes.status === 200 && (await postRes.text()).includes('Account/Login')) {
    throw new Error('Syncore login rejected — check SYNCORE_USERNAME / SYNCORE_PASSWORD')
  }
  if (location.includes('/Account/Login') || location.includes('/Account/Two') || location.includes('/Account/Verify')) {
    throw new Error('Syncore login blocked (bad creds or MFA)')
  }

  return { cookie: cookieHeader(jar), expiresAt: Date.now() + SESSION_TTL_MS }
}

async function getSession(forceFresh = false): Promise<Session> {
  if (!forceFresh && cachedSession && cachedSession.expiresAt > Date.now() + 60_000) {
    return cachedSession
  }
  cachedSession = await login()
  return cachedSession
}

export interface TrackerEntryOptions {
  /** 1 = red, higher values = other colors (see Syncore UI) */
  textColor?: number
}

export async function addTrackerEntry(
  jobId: number,
  description: string,
  { textColor = 1 }: TrackerEntryOptions = {}
): Promise<void> {
  const post = async (session: Session) => {
    const body = new URLSearchParams({
      JobId: String(jobId),
      TextColor: String(textColor),
      Description: description
    })
    const res = await fetch(`${WEB_BASE}/Job/AddTrackerEntryAsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: session.cookie
      },
      body: body.toString(),
      redirect: 'manual'
    })
    return res
  }

  let session = await getSession()
  let res = await post(session)

  // HTML response usually means the session was invalidated — retry once with a fresh login
  const ct = res.headers.get('content-type') ?? ''
  if (!res.ok || ct.includes('text/html')) {
    cachedSession = null
    session = await getSession(true)
    res = await post(session)
    const ct2 = res.headers.get('content-type') ?? ''
    if (!res.ok || ct2.includes('text/html')) {
      const txt = await res.text().catch(() => '')
      throw new Error(`addTrackerEntry failed: HTTP ${res.status} ${txt.slice(0, 160)}`)
    }
  }
}
