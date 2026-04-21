# CG Pickup

Staff print a pickup sticker for each finished order. The customer scans the QR
with their phone, taps **Confirm pickup**, and the app:

1. Appends a `CG-PICKUP::` entry to the Syncore Job Log for that job.
2. Emails the assigned sales rep that the order was picked up.
3. Shows "Already picked up" on any later scan (first scan wins — idempotent).

Built as a standalone Next.js 16 app on Netlify.

---

## Local setup

```bash
npm install
cp .env.local.example .env.local
# fill in the values below
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

### Required env vars

| Key | Notes |
|---|---|
| `SYNCORE_API_KEY` | REST API key — used for job lookup. Same value as CG-Dashboard / UPS-Shipping-Import |
| `SYNCORE_USERNAME` | Web-UI login for writing Job Tracker entries (no REST API exposed). Same creds UPS-Shipping-Import uses |
| `SYNCORE_PASSWORD` | Password for the Syncore web login |
| `PICKUP_HMAC_SECRET` | 32+ random bytes — generate with `openssl rand -base64 32` |
| `GMAIL_USER` | `kiley@colorgraphicswa.com` |
| `GMAIL_APP_PASSWORD` | Google app password (reuse the one from UPS-Shipping-Import or generate new at myaccount.google.com → Security → App passwords) |
| `PUBLIC_BASE_URL` | URL the QR code will point to — `http://localhost:3000` for dev, `https://pickup.colorgraphicswa.com` in prod |
| `ADMIN_PASSWORD` | Shared staff password protecting `/` and `/sticker/*` |
| `PICKUP_EMAIL_TO` | Where pickup-confirmation emails are sent (e.g. `csr@colorgraphicswa.com`). Comma-separate for multiple recipients |

---

## How it works

### Staff flow (print a sticker)

1. Go to `/` on the Windows PC attached to the DYMO LabelWriter.
2. Enter a job number (e.g. `32255`) and click **Look up**.
3. The app fetches the job from Syncore and pre-fills customer + order
   description. Edit if needed and set the box count.
4. Click **Print sticker** — a new tab opens sized to 2.25 × 4 in and auto-prints.

The sticker is a bearer token — whoever holds the physical sticker can mark the
job picked up. That's acceptable because stickers only go on orders already
sitting in the pickup area.

### Windows printing notes

- In Chrome/Edge's print dialog, choose the DYMO LabelWriter and the matching
  2.25 × 4 in paper size.
- Set margins to **None** and scale to **100%**.
- Save the settings as a preset so staff don't have to reconfigure each time.
- If the DYMO driver flips the sticker to landscape, the layout still renders
  correctly — add `&orient=landscape` to the URL if you want to tweak later.

### Customer flow (scan + confirm)

1. Customer scans the QR with their phone camera → opens
   `https://pickup.colorgraphicswa.com/scan/<token>`.
2. Page shows the job number, customer name, and order description.
3. Customer taps **Confirm pickup**. The `/api/confirm` route:
   - Verifies the HMAC token.
   - Checks a Netlify Blobs store for an existing pickup record for this job.
     If found → returns `alreadyPickedUp: true` without side effects.
   - Otherwise, appends a red Job Tracker entry to Syncore via the web-UI
     endpoint, records the pickup in Blobs, and emails the CSR address.

---

## Syncore integration

Two separate integration surfaces:

**REST API** (`src/lib/syncore/client.ts`) — for reading. Base URL
`https://api.syncore.app/v2`, `x-api-key` header.

| Purpose | Method | Path |
|---|---|---|
| Fetch job / customer / description / rep | `GET` | `/orders/jobs/{id}` |

**Web-UI session** (`src/lib/syncore/webui.ts`) — for writing Job Tracker
entries. Syncore does not expose a REST endpoint for the Job Tracker, so we
log in to `https://www.ateasesystems.net/Account/Login` (matching the pattern
used by UPS-Shipping-Import) and POST entries to
`/Job/AddTrackerEntryAsync` with `{ JobId, TextColor, Description }`.

`TextColor: 1` renders the entry in red so staff can spot pickups quickly in
the Job Tracker.

The session cookie is cached in-process for 20 minutes — function cold starts
re-log in, warm invocations reuse the session. On 401/HTML responses the
cache is invalidated and a fresh login is attempted once.

### Pickup email recipient

All pickup-confirmation emails go to `PICKUP_EMAIL_TO` — typically a single
CSR distribution list like `csr@colorgraphicswa.com`. Syncore's
`primary_rep` and `customer_service_rep_name` are surfaced in the admin UI
for context but are not used for routing the email.

---

## Deploying to Netlify

1. `git init` + push to GitHub.
2. Netlify → **Add new site** → import the repo.
3. Build command: `npm run build`. Publish dir: `.next`. Node version: 20.
4. Add every env var from `.env.local` to Netlify → **Site settings → Environment
   variables**. Make sure `PUBLIC_BASE_URL` matches the deployed origin (e.g.
   `https://pickup.colorgraphicswa.com`).
5. Assign the custom domain `pickup.colorgraphicswa.com`.
6. Redeploy and verify:
   - `/login` loads with the CG logo
   - `/` lookups a real job
   - Printing a sticker on the Windows DYMO produces a scannable QR
   - Scanning + confirming writes a `CG-PICKUP::` entry in Syncore and emails
     the assigned rep

---

## End-to-end test checklist

- [ ] `npm run dev`, hit `/`, look up a real job — customer + description show up.
- [ ] Click **Print sticker**, print a test label on the DYMO.
- [ ] Scan the printed QR with a phone — the scan page shows job details.
- [ ] Tap **Confirm pickup** — success message.
- [ ] Open Syncore → that job → Job Log tab → new `CG-PICKUP::` entry is present.
- [ ] Check the assigned rep's inbox for the pickup email.
- [ ] Re-scan the same sticker — page shows "Already picked up on …".
- [ ] Confirm Syncore has only one log entry and no second email went out.
