import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

const DEFAULT_TTL_MS = 180 * 24 * 60 * 60 * 1000

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'utf8')
  return b.toString('base64url')
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, 'base64url')
}

function sign(payload: string): Buffer {
  return createHmac('sha256', env().PICKUP_HMAC_SECRET).update(payload).digest()
}

export interface TokenPayload {
  jobId: number
  soNumbers: number[]
}

interface SignedBody {
  j: number
  s: number[]
  e: number
}

export function signToken(
  payload: TokenPayload,
  ttlMs: number = DEFAULT_TTL_MS
): string {
  const body: SignedBody = {
    j: payload.jobId,
    s: payload.soNumbers,
    e: Date.now() + ttlMs
  }
  const json = b64url(JSON.stringify(body))
  const sig = b64url(sign(json).subarray(0, 16))
  return `${json}.${sig}`
}

export function verifyToken(token: string): TokenPayload {
  const [json, sigPart] = token.split('.')
  if (!json || !sigPart) throw new Error('Malformed token')

  const expectedSig = sign(json).subarray(0, 16)
  const actualSig = fromB64url(sigPart)
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
    throw new Error('Bad signature')
  }

  let body: SignedBody
  try {
    body = JSON.parse(fromB64url(json).toString('utf8')) as SignedBody
  } catch {
    throw new Error('Malformed token body')
  }

  if (!Number.isInteger(body.j) || body.j <= 0) throw new Error('Bad jobId')
  if (!Array.isArray(body.s) || body.s.length === 0) throw new Error('Bad soNumbers')
  if (!Number.isFinite(body.e) || Date.now() > body.e) throw new Error('Token expired')

  return { jobId: body.j, soNumbers: body.s.map(Number) }
}

/**
 * Deterministic short hash of a token, used as the Netlify Blobs key for
 * pickup idempotency. Different physical stickers produce different tokens,
 * so they get independent pickup state — letting multi-SO jobs be picked up
 * across several visits.
 */
export function tokenKey(token: string): string {
  const hash = createHmac('sha256', env().PICKUP_HMAC_SECRET).update(token).digest('hex').slice(0, 20)
  return `sticker-${hash}`
}
