import { redirect, notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { isAdmin } from '@/lib/admin-auth'
import { env } from '@/lib/env'
import { verifyToken } from '@/lib/token/hmac'
import StickerAutoPrint from './StickerAutoPrint'

interface SearchParams {
  t?: string
  c?: string
  d?: string
  b?: string
}

export default async function StickerPage(props: {
  params: Promise<{ jobId: string }>
  searchParams: Promise<SearchParams>
}) {
  if (!(await isAdmin())) {
    redirect('/login?next=/')
  }

  const { jobId: jobIdStr } = await props.params
  const { t: token, c: customer, d: description, b: boxesStr } = await props.searchParams

  const jobId = parseInt(jobIdStr, 10)
  if (!Number.isInteger(jobId) || jobId <= 0) notFound()
  if (!token) notFound()

  try {
    const payload = verifyToken(token)
    if (payload.jobId !== jobId) notFound()
  } catch {
    notFound()
  }

  const boxes = Math.max(1, parseInt(boxesStr || '1', 10) || 1)
  const scanUrl = `${env().PUBLIC_BASE_URL.replace(/\/$/, '')}/scan/${token}`
  const qrDataUrl = await QRCode.toDataURL(scanUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 480,
    color: { dark: '#111111', light: '#FFFFFF' }
  })

  return (
    <>
      <style>{`
        @page { size: 2.25in 4in; margin: 0; }
        html, body { background: #fff; margin: 0; padding: 0; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sticker {
          width: 2.25in;
          height: 4in;
          padding: 0.12in;
          color: #111;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
        }
        .logo-row { display: flex; justify-content: center; margin-bottom: 0.05in; }
        .logo-row img { height: 0.32in; width: auto; }
        .red-bar { height: 3px; background: #E01B2B; border-radius: 2px; margin-bottom: 0.07in; }
        .job-number {
          font-size: 26pt;
          font-weight: 900;
          letter-spacing: -0.5px;
          line-height: 1;
          text-align: center;
          margin-bottom: 0.04in;
        }
        .label-small {
          text-transform: uppercase;
          font-size: 6.5pt;
          letter-spacing: 1px;
          color: #666;
          text-align: center;
        }
        .customer {
          font-size: 11pt;
          font-weight: 700;
          text-align: center;
          line-height: 1.15;
          margin-top: 0.05in;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .description {
          font-size: 8.5pt;
          color: #333;
          text-align: center;
          line-height: 1.2;
          margin-top: 0.03in;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .boxes-pill {
          align-self: center;
          background: #111;
          color: #fff;
          padding: 2px 10px;
          border-radius: 999px;
          font-size: 8pt;
          font-weight: 700;
          letter-spacing: 0.5px;
          margin-top: 0.06in;
        }
        .qr-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          margin-top: 0.08in;
        }
        .qr-area img { width: 1.45in; height: 1.45in; display: block; }
        .qr-caption {
          font-size: 7pt;
          color: #111;
          text-align: center;
          margin-top: 0.03in;
          font-weight: 600;
        }
      `}</style>
      <div className="sticker">
        <div className="logo-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cg-logo.png" alt="Color Graphics" />
        </div>
        <div className="red-bar" />
        <div className="label-small">Job</div>
        <div className="job-number">#{jobId}</div>
        {customer && <div className="customer">{customer}</div>}
        {description && <div className="description">{description}</div>}
        <div className="boxes-pill">{boxes} box{boxes === 1 ? '' : 'es'}</div>
        <div className="qr-area">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="Scan to confirm pickup" />
          <div className="qr-caption">Scan to confirm pickup</div>
        </div>
      </div>
      <StickerAutoPrint />
    </>
  )
}
