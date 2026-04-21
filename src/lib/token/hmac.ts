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

export function signToken(jobId: number, ttlMs: number = DEFAULT_TTL_MS): string {
  const exp = Date.now() + ttlMs
  const jobPart = b64url(String(jobId))
  const expPart = b64url(String(exp))
  const sig = b64url(sign(`${jobPart}.${expPart}`).subarray(0, 16))
  return `${jobPart}.${expPart}.${sig}`
}

export interface TokenPayload {
  jobId: number
}

export function verifyToken(token: string): TokenPayload {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed token')
  const [jobPart, expPart, sigPart] = parts

  const expectedSig = sign(`${jobPart}.${expPart}`).subarray(0, 16)
  const actualSig = fromB64url(sigPart)
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
    throw new Error('Bad signature')
  }

  const exp = Number(fromB64url(expPart).toString('utf8'))
  if (!Number.isFinite(exp) || Date.now() > exp) throw new Error('Token expired')

  const jobId = Number(fromB64url(jobPart).toString('utf8'))
  if (!Number.isInteger(jobId) || jobId <= 0) throw new Error('Bad jobId')

  return { jobId }
}
