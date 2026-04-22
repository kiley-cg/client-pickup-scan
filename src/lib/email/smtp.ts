import nodemailer from 'nodemailer'
import { env, lookupRepEmail } from '@/lib/env'

let cachedTransporter: nodemailer.Transporter | null = null

function transporter() {
  if (cachedTransporter) return cachedTransporter
  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: env().GMAIL_USER,
      pass: env().GMAIL_APP_PASSWORD
    }
  })
  return cachedTransporter
}

export interface PickupEmailInput {
  jobId: number
  customer: string
  description: string
  soNumbers: number[]
  pickedUpAt: Date
}

export async function sendPickupEmail(input: PickupEmailInput): Promise<{ sent: boolean; to: string | null; reason?: string }> {
  if (!env().GMAIL_APP_PASSWORD) {
    return { sent: false, to: null, reason: 'GMAIL_APP_PASSWORD not configured — skipping email.' }
  }
  const to = env().PICKUP_EMAIL_TO.trim()
  if (!to) {
    return { sent: false, to: null, reason: 'PICKUP_EMAIL_TO not configured.' }
  }

  const when = input.pickedUpAt.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })

  const sos = [...input.soNumbers].sort((a, b) => a - b)
  const soLabel = sos.length === 1 ? `Sales Order ${input.jobId}-${sos[0]}` : `Sales Orders ${sos.map(n => `${input.jobId}-${n}`).join(', ')}`

  const subject = `Pickup: Job #${input.jobId} — ${input.customer}`
  const text = [
    `Job #${input.jobId} has been picked up by the customer.`,
    ``,
    `Customer: ${input.customer}`,
    `Order: ${input.description || '(no description)'}`,
    `${soLabel}`,
    `Picked up: ${when}`,
    ``,
    `A red entry has been added to the Syncore Job Tracker for this pickup.`
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height:1.5; color:#111;">
      <h2 style="margin:0 0 12px; color:#111;">Pickup confirmed</h2>
      <p style="margin:0 0 16px;">Job <strong>#${input.jobId}</strong> has been picked up by the customer.</p>
      <table style="border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:4px 12px 4px 0; color:#666;">Customer</td><td style="padding:4px 0;"><strong>${escapeHtml(input.customer)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0; color:#666;">Order</td><td style="padding:4px 0;">${escapeHtml(input.description || '(no description)')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0; color:#666;">${escapeHtml(sos.length === 1 ? 'Sales Order' : 'Sales Orders')}</td><td style="padding:4px 0;">${escapeHtml(sos.map(n => `${input.jobId}-${n}`).join(', '))}</td></tr>
        <tr><td style="padding:4px 12px 4px 0; color:#666;">Picked up</td><td style="padding:4px 0;">${escapeHtml(when)}</td></tr>
      </table>
      <p style="margin:16px 0 0; color:#666; font-size:12px;">A red entry has been added to the Syncore Job Tracker for this pickup.</p>
    </div>
  `.trim()

  try {
    await transporter().sendMail({
      from: env().GMAIL_USER,
      to,
      replyTo: env().GMAIL_USER,
      subject,
      text,
      html
    })
    return { sent: true, to }
  } catch (err) {
    console.error('[pickup-email] send failed:', err)
    return { sent: false, to, reason: err instanceof Error ? err.message : String(err) }
  }
}

export interface ReadyEmailInput {
  jobId: number
  customer: string
  description: string
  soNumbers: number[]
  boxes: number
  repName: string | null
  csrName: string | null
  readyAt: Date
}

export async function sendReadyEmail(input: ReadyEmailInput): Promise<{ sent: boolean; to: string[]; missing: string[]; reason?: string }> {
  if (!env().GMAIL_APP_PASSWORD) {
    return { sent: false, to: [], missing: [], reason: 'GMAIL_APP_PASSWORD not configured — skipping email.' }
  }

  const to: string[] = []
  const missing: string[] = []
  for (const name of [input.repName, input.csrName]) {
    if (!name) continue
    const email = lookupRepEmail(name)
    if (email) {
      if (!to.includes(email)) to.push(email)
    } else {
      missing.push(name)
    }
  }

  if (to.length === 0) {
    return {
      sent: false,
      to: [],
      missing,
      reason: missing.length
        ? `No REP_EMAIL_MAP entries for: ${missing.join(', ')}`
        : 'No rep or CSR on the job'
    }
  }

  const sos = [...input.soNumbers].sort((a, b) => a - b)
  const soLabel = sos.length === 1 ? `Sales Order ${input.jobId}-${sos[0]}` : `Sales Orders ${sos.map(n => `${input.jobId}-${n}`).join(', ')}`
  const readyWhen = input.readyAt.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
  const boxLabel = `${input.boxes} ${input.boxes === 1 ? 'box' : 'boxes'}`

  const subject = `Ready for pickup: Job #${input.jobId} — ${input.customer}`
  const text = [
    `${soLabel} is ready in self-pickup.`,
    ``,
    `Customer: ${input.customer}`,
    `Order: ${input.description || '(no description)'}`,
    `Boxes: ${boxLabel}`,
    `Marked ready: ${readyWhen}`,
    ``,
    `A red Job Tracker entry has been added in Syncore. The customer will scan the QR on the sticker when they pick up, which will trigger a separate "picked up" notification.`
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height:1.5; color:#111;">
      <h2 style="margin:0 0 12px; color:#E01B2B;">Ready for pickup</h2>
      <p style="margin:0 0 16px;"><strong>${escapeHtml(soLabel)}</strong> is ready in self-pickup.</p>
      <table style="border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:4px 12px 4px 0; color:#666;">Customer</td><td style="padding:4px 0;"><strong>${escapeHtml(input.customer)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0; color:#666;">Order</td><td style="padding:4px 0;">${escapeHtml(input.description || '(no description)')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0; color:#666;">Boxes</td><td style="padding:4px 0;">${escapeHtml(boxLabel)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0; color:#666;">Marked ready</td><td style="padding:4px 0;">${escapeHtml(readyWhen)}</td></tr>
      </table>
      <p style="margin:16px 0 0; color:#666; font-size:12px;">A red Job Tracker entry has been added in Syncore. When the customer scans the sticker QR to confirm pickup, a separate notification will go to the CSR inbox.</p>
    </div>
  `.trim()

  try {
    await transporter().sendMail({
      from: env().GMAIL_USER,
      to: to.join(', '),
      replyTo: env().GMAIL_USER,
      subject,
      text,
      html
    })
    return { sent: true, to, missing }
  } catch (err) {
    console.error('[ready-email] send failed:', err)
    return { sent: false, to, missing, reason: err instanceof Error ? err.message : String(err) }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
