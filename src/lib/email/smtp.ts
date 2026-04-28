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

// ─── Customer-facing "your order is ready for pickup" email ────────────────

const CG_ADDRESS = '2540 Crites St. SW, Tumwater, WA 98512'
const CG_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('2540 Crites St SW, Tumwater, WA 98512')}`
const CG_PHONE = '(800) 456-8288'
const CG_HOURS_WEEK_LABEL = 'Mon–Thu'
const CG_HOURS_WEEK_VALUE = '8 AM – 5 PM'
const CG_HOURS_FRI_LABEL = 'Friday'
const CG_HOURS_FRI_VALUE = '8 AM – Noon'
const CG_WEBSITE = 'https://www.colorgraphicswa.com'
const CG_FACEBOOK = 'https://www.facebook.com/color.graphics.1'
const CG_LINKEDIN = 'https://www.linkedin.com/company-beta/4388443/'
const CG_INSTAGRAM = 'https://www.instagram.com/color_graphics_wa/'

function formatDayDate(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
}

function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000)))
}

export interface CustomerReadyEmailInput {
  to: string
  jobId: number
  customer: string
  description: string     // human-readable order description (shown to customer)
  readyAt: Date
  scanUrl: string         // /scan/<token> — for the "I already picked it up" link
  reminder?: boolean      // false (default) for the first email, true for weekly follow-ups
}

function isLikelyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

export async function sendCustomerReadyEmail(input: CustomerReadyEmailInput): Promise<{ sent: boolean; to: string | null; reason?: string }> {
  if (!env().GMAIL_APP_PASSWORD) {
    return { sent: false, to: null, reason: 'GMAIL_APP_PASSWORD not configured — skipping email.' }
  }
  const to = input.to.trim()
  if (!to) {
    return { sent: false, to: null, reason: 'No customer email on file.' }
  }
  if (!isLikelyEmail(to)) {
    return { sent: false, to: null, reason: `Customer email looks invalid: ${to}` }
  }

  const logoUrl = `${env().PUBLIC_BASE_URL.replace(/\/$/, '')}/cg-logo.png`
  const isReminder = !!input.reminder
  const days = daysSince(input.readyAt)
  const readyDayLabel = formatDayDate(input.readyAt)

  const subject = isReminder
    ? `Reminder: Your Color Graphics order is still ready for pickup`
    : `Your Color Graphics order is ready for pickup`

  const headline = isReminder
    ? `Friendly reminder — your order is still waiting`
    : `Your order is ready for pickup`

  const descSnippet = input.description ? ` — <em>${escapeHtml(input.description)}</em>` : ''
  const descSnippetText = input.description ? ` — ${input.description}` : ''

  const lead = isReminder
    ? `Just a friendly reminder that your order (<strong>Job #${input.jobId}</strong>${descSnippet}) has been ready in our self-pickup area since <strong>${escapeHtml(readyDayLabel)}</strong>${days ? ` (${days} day${days === 1 ? '' : 's'} ago)` : ''}. Come grab it whenever it's convenient.`
    : `Your order (<strong>Job #${input.jobId}</strong>) is ready and waiting in our self-pickup area. Come grab it whenever it's convenient.`

  const leadText = isReminder
    ? `Just a friendly reminder that your order (Job #${input.jobId}${descSnippetText}) has been ready in our self-pickup area since ${readyDayLabel}${days ? ` (${days} day${days === 1 ? '' : 's'} ago)` : ''}.`
    : `Your order (Job #${input.jobId}) is ready for pickup at Color Graphics.`

  const text = [
    `Hi ${input.customer || 'there'},`,
    ``,
    leadText,
    ``,
    `Order: ${input.description || '(no description)'}`,
    ``,
    `Pickup Location:`,
    `  ${CG_ADDRESS}`,
    `  Driving directions: ${CG_DIRECTIONS_URL}`,
    ``,
    `Hours:`,
    `  ${CG_HOURS_WEEK_LABEL}: ${CG_HOURS_WEEK_VALUE}`,
    `  ${CG_HOURS_FRI_LABEL}: ${CG_HOURS_FRI_VALUE}`,
    ``,
    `When you arrive, go to the marked self-pickup area. Use the labels on the boxes to find your order, then scan the QR code on the sticker to let us know it's been picked up.`,
    ``,
    isReminder
      ? `Already picked it up? Confirm here so we stop sending reminders:\n  ${input.scanUrl}\n`
      : '',
    `Questions? Call ${CG_PHONE}.`,
    ``,
    `Thanks for choosing Color Graphics — we'll see you soon!`,
    ``,
    `Website: ${CG_WEBSITE}`,
    `Facebook: ${CG_FACEBOOK}`,
    CG_INSTAGRAM ? `Instagram: ${CG_INSTAGRAM}` : '',
    `LinkedIn: ${CG_LINKEDIN}`
  ].filter(Boolean).join('\n')

  const socialLinks = [
    { label: 'Website', url: CG_WEBSITE },
    { label: 'Facebook', url: CG_FACEBOOK },
    CG_INSTAGRAM ? { label: 'Instagram', url: CG_INSTAGRAM } : null,
    { label: 'LinkedIn', url: CG_LINKEDIN }
  ].filter(Boolean) as { label: string; url: string }[]

  const socialHtml = socialLinks
    .map(
      l =>
        `<a href="${l.url}" style="color:#E01B2B; text-decoration:none; font-weight:600; margin:0 10px;">${l.label}</a>`
    )
    .join('<span style="color:#CCCCCC;">|</span>')

  const html = `
<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#F7F7F7;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F7F7F7; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF; border-radius:12px; overflow:hidden; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#111111;">
            <tr>
              <td style="background:#FFFFFF; padding:24px 32px; border-bottom:4px solid #E01B2B;">
                <img src="${logoUrl}" alt="Color Graphics" height="44" style="display:block; height:44px; width:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px; font-size:24px; line-height:1.25; color:#111111; font-weight:800;">${escapeHtml(headline)}</h1>
                <p style="margin:0 0 18px; font-size:16px; line-height:1.55; color:#111111;">
                  Hi ${escapeHtml(input.customer || 'there')},
                </p>
                <p style="margin:0 0 24px; font-size:16px; line-height:1.55; color:#111111;">
                  ${lead}
                </p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F7F7F7; border-radius:8px; padding:18px; margin:0 0 24px;">
                  <tr>
                    <td style="padding:0 0 14px;">
                      <div style="font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#666666; font-weight:600; margin:0 0 4px;">Order</div>
                      <div style="font-size:15px; color:#111111;"><strong>Job #${input.jobId}</strong>${input.description ? ` &middot; ${escapeHtml(input.description)}` : ''}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 14px;">
                      <div style="font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#666666; font-weight:600; margin:0 0 4px;">Pickup Location</div>
                      <div style="font-size:15px; color:#111111; font-weight:600;">
                        <a href="${CG_DIRECTIONS_URL}" style="color:#111111; text-decoration:none;">${escapeHtml(CG_ADDRESS)}</a>
                      </div>
                      <div style="margin-top:4px;">
                        <a href="${CG_DIRECTIONS_URL}" style="color:#E01B2B; text-decoration:none; font-size:13px; font-weight:600;">Get driving directions →</a>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0;">
                      <div style="font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#666666; font-weight:600; margin:0 0 4px;">Hours</div>
                      <div style="font-size:15px; color:#111111;"><strong>${escapeHtml(CG_HOURS_WEEK_LABEL)}: ${escapeHtml(CG_HOURS_WEEK_VALUE)}</strong></div>
                      <div style="font-size:15px; color:#E01B2B; margin-top:2px;"><strong>${escapeHtml(CG_HOURS_FRI_LABEL)}: ${escapeHtml(CG_HOURS_FRI_VALUE)}</strong></div>
                    </td>
                  </tr>
                </table>

                ${isReminder ? `
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;">
                  <tr>
                    <td align="center">
                      <a href="${input.scanUrl}" style="display:inline-block; background:#111111; color:#FFFFFF; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:15px; font-weight:700;">
                        Already picked up? Confirm here →
                      </a>
                      <div style="margin-top:8px; font-size:12px; color:#666666;">If you already grabbed your order and forgot to scan the QR.</div>
                    </td>
                  </tr>
                </table>
                ` : ''}

                <p style="margin:0 0 18px; font-size:14px; line-height:1.55; color:#333333;">
                  When you arrive, go to the marked self-pickup area. Use the labels on the boxes to find your order, then scan the QR code on the sticker to let us know it's been picked up.
                </p>

                <p style="margin:0 0 8px; font-size:14px; color:#666666;">
                  Questions? Call <a href="tel:${CG_PHONE.replace(/[^0-9+]/g, '')}" style="color:#E01B2B; text-decoration:none; font-weight:600;">${escapeHtml(CG_PHONE)}</a>.
                </p>
                <p style="margin:24px 0 18px; font-size:15px; color:#111111;">
                  Thanks for choosing <strong>Color Graphics</strong> &mdash; we'll see you soon!
                </p>

                <div style="border-top:1px solid #E5E5E5; padding-top:16px; text-align:center; font-size:13px;">
                  ${socialHtml}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim()

  try {
    await transporter().sendMail({
      from: `Color Graphics <${env().GMAIL_USER}>`,
      to,
      replyTo: env().GMAIL_USER,
      subject,
      text,
      html
    })
    return { sent: true, to }
  } catch (err) {
    console.error('[customer-ready-email] send failed:', err)
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
