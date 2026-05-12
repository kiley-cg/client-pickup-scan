# CG Pickup

Self-pickup workflow for finished Color Graphics orders. Staff print a QR-coded
sticker for each order box; customers scan it when they arrive and tap
**Confirm pickup**. Behind the scenes the app posts red Job Tracker entries to
Syncore, emails the right people at every stage, and chases down customers
who haven't picked up after a week.

Standalone Next.js 16 app on Netlify, written in TypeScript.

---

## Features

- **Sticker printing** — DYMO LabelWriter 2.25 × 4 in. Multi-box stickers labeled
  *1 of N*, *2 of N*, …
- **Multi-SO selection** — when a job has several sales orders, staff pick which
  ones go on this pickup. Each printed sticker is independent, so back-ordered
  SOs can ship on later stickers.
- **Mark ready for pickup** — shipping coordinator clicks one button when the
  order is ready. Posts a red Syncore Job Tracker entry, emails the salesperson
  and CSR, and (optionally) emails the customer a branded "your order is ready"
  message.
- **Customer self-confirm** — scanning the QR posts a red tracker entry, stops
  reminders, and shows "Thanks for your business!"
- **Manual mark picked up** — when a customer forgets to scan, staff can mark
  the sticker picked up themselves. Same downstream effects (tracker entry,
  CSR email, reminders stop) but the tracker line is labeled "Manually marked
  picked up by staff".
- **Weekly reminders** — if a customer hasn't picked up after 7 days, the cron
  re-emails them. Continues weekly until they pick up or staff clears the
  sticker.
- **/admin/pickups** — last 100 stickers with their full lifecycle (printed →
  ready → picked up). **Clear** removes the record so the sticker can be
  scanned again; **Mark picked up** logs the pickup manually.

---

## Architecture at a glance

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) on Node 20 |
| Hosting | Netlify (Next.js plugin) |
| Persistence | Netlify Blobs (`pickups` store) |
| Email | Resend.com |
| QR codes | `qrcode` (data-URL PNG, error-correction M) |
| Syncore reads | REST API `/v2/orders/jobs/{id}` |
| Syncore writes | Web-UI session scrape (`/Job/AddTrackerEntryAsync`) |
| Scheduled jobs | Netlify Scheduled Functions (`netlify/functions/send-reminders.mts`) |
| Token | HMAC-SHA-256 signed JSON, base64url-encoded |

---

## Local setup

```bash
npm install
cp .env.local.example .env.local
# fill in the values below
npm run dev
```

Open <http://localhost:3000> — you'll be redirected to `/login`.

### Required env vars

| Key | Notes |
|---|---|
| `SYNCORE_API_KEY` | REST API key — used for job lookup. |
| `SYNCORE_USERNAME` | Web-UI login for writing Job Tracker entries (no REST endpoint exposed). Account **must not have MFA enabled** or the scraper will silently fail. |
| `SYNCORE_PASSWORD` | Password for the Syncore web login. |
| `PICKUP_HMAC_SECRET` | 32+ random bytes — generate with `openssl rand -base64 32`. Signs sticker tokens. |
| `PUBLIC_BASE_URL` | Origin the QR code points to. `http://localhost:3000` in dev, `https://pickup.colorgraphicswa.com` in prod. |
| `ADMIN_PASSWORD` | Shared staff password protecting `/`, `/sticker/*`, and `/admin/*`. |
| `RESEND_API_KEY` | `re_...` from <https://resend.com/api-keys>. |
| `EMAIL_FROM` | From address used by all outgoing emails. Must be on a domain verified in Resend. Example: `Color Graphics <alerts@updates.colorgraphicswa.com>`. |
| `EMAIL_REPLY_TO` | Reply-to address. Example: `alerts@colorgraphicswa.com`. |
| `PICKUP_EMAIL_TO` | Where pickup-confirmation emails are sent (CSR distribution list). Comma-separate for multiple recipients. |
| `REP_EMAIL_MAP` | Comma-separated `Name=email` pairs for routing the ready-for-pickup email to a job's specific salesperson + CSR. Example: `Heidi Lopez-Mix=heidilm@colorgraphicswa.com, Valerie Ross=valerier@colorgraphicswa.com`. Missing entries are logged. |
| `CRON_SECRET` | Random bytes — shared between the Netlify scheduled function and `/api/cron/send-reminders` so only the cron can trigger reminder emails. |

---

## End-to-end flows

### Staff: print a sticker

1. Go to `/` on the Windows PC attached to the DYMO LabelWriter.
2. Enter a job number (e.g. `32255`) and click **Look up**.
3. The app fetches the job from Syncore and pre-fills customer + description.
   Sales orders show as checkboxes — uncheck any that *aren't* part of this
   pickup. Already-picked-up SOs are greyed and disabled.
4. Set the box count (1 by default).
5. Click **Print sticker** — a new tab opens at 2.25 × 4 in with `N` stickers
   stacked (one per box), each numbered "1 of N", "2 of N", etc.

The sticker is a bearer token — whoever holds it can mark the order picked up.
Acceptable since stickers only get applied to orders already sitting in the
pickup area.

### Staff: mark ready for pickup

When the order is finished and placed in self-pickup:

1. Pull the job up in `/`.
2. In **Outstanding pickup stickers**, find the sticker that matches what's
   ready.
3. The customer email pre-fills from Syncore's `client.email`. Edit it or
   uncheck **Email customer** if it looks wrong.
4. Click **Mark ready for pickup**. This:
   - Posts a red tracker entry to the Syncore Job Log:
     `Sales Order 32255-1 ready in self-pickup. 2 boxes`
   - Emails the assigned salesperson + CSR (resolved via `REP_EMAIL_MAP`).
   - If the customer-email box is checked, sends the customer a branded
     "Your order is ready for pickup" email with the pickup address, hours,
     driving directions link, phone, and CG social links.
   - Starts the weekly reminder timer for this sticker.

### Customer: scan + confirm

1. Customer scans the QR with their phone camera → opens
   `${PUBLIC_BASE_URL}/scan/<token>`.
2. Page shows job number, customer, description.
3. Customer taps **Confirm pickup**. The `/api/confirm` route:
   - Verifies the HMAC token.
   - Returns "Already picked up" if the sticker has been confirmed before.
   - Otherwise posts a red tracker entry
     (`Picked up by customer on Apr 28, 2026 at 10:30 AM — Sales Order 32255-1`),
     flips `pickedUpAt`, records per-SO markers, and emails `PICKUP_EMAIL_TO`.
4. Page now shows **Thanks for your business!**

### Customer: weekly reminder

Daily at **15:00 UTC** (8 AM PDT / 7 AM PST) the Netlify scheduled function
fires `/api/cron/send-reminders`. For every sticker where:

- `readyAt` is set
- `pickedUpAt` is empty
- The customer email is on file
- 7+ days have passed since `readyAt` or `lastReminderAt`

… it sends a reminder. The reminder is the same template as the initial
"ready" email but includes a black **"Already picked up? Confirm here →"**
CTA that opens the same `/scan/<token>` page — useful for customers who
took their order but forgot to scan.

A pickup (scan or manual) flips `pickedUpAt` and immediately drops the
sticker out of the reminder rotation.

### Staff: manual "Mark picked up"

For when a customer takes their order and forgets to scan:

- On `/` (Outstanding pickup stickers) — black **Mark picked up** button next
  to *Mark ready for pickup*.
- On `/admin/pickups` — black **Mark picked up** button on every row that
  hasn't been picked up.

Both confirm with a prompt, then post a red tracker entry labeled
"Manually marked picked up by staff on …" so the audit trail makes clear it
was a staff action, not a customer scan. Otherwise identical to a scan
(email to `PICKUP_EMAIL_TO`, reminders stop).

### Staff: clear a sticker

On `/admin/pickups`, the **Clear** button deletes the sticker blob and all
per-SO markers. The sticker becomes scannable again. Useful for testing or
to undo an accidental confirmation. Does **not** delete the Syncore tracker
entry — that's a manual cleanup in Syncore if needed.

---

## Syncore integration

Two surfaces:

**REST API** (`src/lib/syncore/client.ts`) — read-only. Base URL
`https://api.syncore.app/v2`, `x-api-key` header.

| Purpose | Method | Path |
|---|---|---|
| Fetch job (customer, description, primary rep, CSR, client email, sales orders) | `GET` | `/orders/jobs/{id}` |

**Web-UI session** (`src/lib/syncore/webui.ts`) — for writing Job Tracker
entries (Syncore does not expose a REST endpoint for this). Logs in at
`https://www.ateasesystems.net/Account/Login`, scrapes the
`__RequestVerificationToken`, then POSTs to `/Job/AddTrackerEntryAsync`
with `{ JobId, TextColor: 1, Description }`. `TextColor: 1` renders red.

Session cookies are cached in-process for 20 minutes — function cold starts
re-log in, warm invocations reuse the session. On a 401 / HTML response the
cache is invalidated and one fresh login is attempted before failing.

---

## Email

Sent via [Resend](https://resend.com). Three send paths share a single
`sendViaResend()` helper:

| Function | Recipient | When |
|---|---|---|
| `sendReadyEmail` | Salesperson + CSR (via `REP_EMAIL_MAP`) | Mark ready for pickup |
| `sendCustomerReadyEmail` | Customer (or override) | Mark ready (optional) + weekly reminder |
| `sendPickupEmail` | `PICKUP_EMAIL_TO` | Confirm pickup (scan or manual) |

All three use the same `EMAIL_FROM` / `EMAIL_REPLY_TO` env vars so the
sending identity can move without code changes.

---

## Netlify Blobs schema

Store name: `pickups`.

| Key prefix | Shape | Purpose |
|---|---|---|
| `sticker-<hash>` | `PickupRecord` (full sticker lifecycle: jobId, soNumbers, boxes, customer, description, token, customerEmail, printedAt, readyAt, pickedUpAt, lastReminderAt, reminderCount) | One record per physical sticker. Hash = first 20 hex chars of HMAC-SHA-256(token). |
| `so-<jobId>-<soNumber>` | `SalesOrderPickup` (jobId, soNumber, pickedUpAt, stickerKey) | Per-SO pickup marker. Lets `/api/job/{id}` mark already-picked-up SOs as greyed in the admin UI. Cleared along with the parent sticker. |

---

## Scheduled function

`netlify/functions/send-reminders.mts` runs daily at `0 15 * * *` UTC (= 8 AM
PDT in summer, 7 AM PST in winter). It fetches
`${PUBLIC_BASE_URL}/api/cron/send-reminders` with the `x-cron-secret` header
set to `CRON_SECRET`. The Next.js route walks the Blobs store, picks the
stickers that are due, and re-uses `sendCustomerReadyEmail` with
`reminder: true` to send weekly follow-ups.

Cron schedules can't follow DST automatically — if you want strict
"8 AM Pacific year-round" you'd need to bump to `0 16 * * *` in November
and back to `0 15 * * *` in March.

---

## Operational caveats

- **Don't enable MFA on the Syncore login user.** The web-UI scraper has no
  way past MFA — tracker writes will silently start failing. If MFA gets
  enforced organisation-wide, the integration would need to switch to a
  service account or wait for Syncore to expose a Job Tracker REST endpoint.
- **Add new staff to `REP_EMAIL_MAP`** as they join. Without their entry, the
  staff "Ready for pickup" email skips them (tracker still posts; the email
  log notes the missing name).
- **`EMAIL_FROM` must be on a verified Resend domain.** Update the SPF and
  DKIM records in DNS when you change the sending domain.
- **Tokens have a 180-day TTL.** Reprint stickers that have been sitting in
  the pickup area longer than that — they'll still scan but won't verify.

---

## Deploying to Netlify

1. Push to GitHub.
2. Netlify → **Add new site** → import the repo.
3. Build command `npm run build`, publish dir `.next`, Node 20 (already pinned
   in `netlify.toml`).
4. Add every env var from `.env.local.example` to **Project → Environment
   variables**.
   - **Do NOT mark them "Secret values"** — Netlify's secret flag blocks the
     vars from the Next.js function runtime (see
     `memory/feedback_netlify_secret_envvars.md`). Sensitive values stay
     out of build logs anyway.
   - `PUBLIC_BASE_URL` should match the deployed origin
     (`https://pickup.colorgraphicswa.com`).
5. Assign the custom domain.
6. The scheduled function `send-reminders` registers automatically on first
   deploy. Confirm at **Logs → Functions** that both
   `___netlify-server-handler` and `send-reminders` show up, with
   `send-reminders` showing `cron: 0 15 * * *`.

---

## End-to-end test checklist

- [ ] `/` lookups a real job — customer + description + sales orders populate.
- [ ] **Print sticker** opens a 2.25 × 4 in PDF and the DYMO prints `N` labels.
- [ ] Scanning a printed QR opens the scan page on a phone.
- [ ] **Mark ready for pickup** posts a red tracker entry to Syncore *and*
      emails the assigned salesperson + CSR *and* the customer.
- [ ] Customer **Confirm pickup** posts a second red tracker entry, emails
      `PICKUP_EMAIL_TO`, and the scan page now shows "Thanks for your business!"
- [ ] Re-scanning the same sticker shows "Already picked up" without
      duplicate side-effects.
- [ ] `/admin/pickups` shows the sticker with all three timestamps
      (Printed, Ready, Picked up).
- [ ] **Mark picked up** (manual) on an outstanding sticker produces a
      tracker entry labeled "Manually marked picked up by staff" and clears
      the reminder timer.
- [ ] **Clear** removes the sticker so the same QR can be scanned again.
- [ ] In Netlify → Logs → Functions, fire `send-reminders` manually. With
      no eligible stickers it should report `sent: 0, skipped: 0` — proves
      the cron path is wired.
