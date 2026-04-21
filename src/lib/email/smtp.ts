import nodemailer from 'nodemailer'
import { env } from '@/lib/env'

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

  const subject = `Pickup: Job #${input.jobId} — ${input.customer}`
  const text = [
    `Job #${input.jobId} has been picked up by the customer.`,
    ``,
    `Customer: ${input.customer}`,
    `Order: ${input.description || '(no description)'}`,
    `Picked up: ${when}`,
    ``,
    `A "CG-PICKUP::" entry has been added to the Syncore Job Log.`
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height:1.5; color:#111;">
      <h2 style="margin:0 0 12px; color:#111;">Pickup confirmed</h2>
      <p style="margin:0 0 16px;">Job <strong>#${input.jobId}</strong> has been picked up by the customer.</p>
      <table style="border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:4px 12px 4px 0; color:#666;">Customer</td><td style="padding:4px 0;"><strong>${escapeHtml(input.customer)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0; color:#666;">Order</td><td style="padding:4px 0;">${escapeHtml(input.description || '(no description)')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0; color:#666;">Picked up</td><td style="padding:4px 0;">${escapeHtml(when)}</td></tr>
      </table>
      <p style="margin:16px 0 0; color:#666; font-size:12px;">A <code>CG-PICKUP::</code> entry has been added to the Syncore Job Log for this job.</p>
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
