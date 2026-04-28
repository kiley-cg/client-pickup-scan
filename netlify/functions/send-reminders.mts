import type { Config } from '@netlify/functions'

/**
 * Scheduled function that triggers weekly customer-pickup reminders.
 *
 * Runs once a day at 15:00 UTC (= 8 AM PDT in summer, 7 AM PST in winter).
 * The actual reminder logic lives in the Next.js route at
 * /api/cron/send-reminders so it can use the same pickup-store / Syncore
 * / email helpers as the rest of the app. Each pending sticker decides
 * for itself whether 7+ days have passed since the last reminder, so
 * running this daily yields per-record weekly cadence.
 */
export default async () => {
  const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ?? ''
  const secret = process.env.CRON_SECRET ?? ''
  if (!baseUrl || !secret) {
    console.error('[cron] PUBLIC_BASE_URL or CRON_SECRET missing — skipping reminder run.')
    return new Response('missing config', { status: 500 })
  }

  let res: Response
  try {
    res = await fetch(`${baseUrl}/api/cron/send-reminders`, {
      method: 'POST',
      headers: { 'x-cron-secret': secret }
    })
  } catch (err) {
    console.error('[cron] reminder fetch failed:', err)
    return new Response('fetch failed', { status: 502 })
  }

  const body = await res.text()
  console.log(`[cron] /api/cron/send-reminders → ${res.status}`, body.slice(0, 500))
  return new Response(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'text/plain' }
  })
}

export const config: Config = {
  schedule: '0 15 * * *'
}
