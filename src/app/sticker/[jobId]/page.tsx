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

  const totalBoxes = Math.max(1, Math.min(99, parseInt(boxesStr || '1', 10) || 1))
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
          padding: 0.12in 0.14in;
          color: #111;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
          page-break-after: always;
          break-after: page;
        }
        .sticker:last-child { page-break-after: auto; break-after: auto; }
        .logo-row { display: flex; justify-content: center; margin-bottom: 0.04in; }
        .logo-row img { height: 0.30in; width: auto; }
        .red-bar { height: 3px; background: #E01B2B; border-radius: 2px; margin-bottom: 0.06in; }
        .job-number {
          font-size: 26pt;
          font-weight: 900;
          letter-spacing: -0.5px;
          line-height: 1;
          text-align: center;
          margin-bottom: 0.03in;
        }
        .label-small {
          text-transform: uppercase;
          font-size: 6.5pt;
          letter-spacing: 1px;
          color: #666;
          text-align: center;
        }
        .customer {
          font-size: 13pt;
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
          font-size: 10.5pt;
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
          padding: 5px 16px;
          border-radius: 999px;
          font-size: 14pt;
          font-weight: 800;
          letter-spacing: 0.3px;
          margin-top: 0.08in;
        }
        .qr-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          margin-top: 0.06in;
        }
        .qr-area img { width: 1.35in; height: 1.35in; display: block; }
        .qr-caption {
          font-size: 7pt;
          color: #111;
          text-align: center;
          margin-top: 0.03in;
          font-weight: 600;
        }
      `}</style>
      {Array.from({ length: totalBoxes }, (_, i) => i + 1).map(boxIndex => (
        <div className="sticker" key={boxIndex}>
          <div className="logo-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cg-logo.png" alt="Color Graphics" />
          </div>
          <div className="red-bar" />
          <div className="label-small">Job</div>
          <div className="job-number">#{jobId}</div>
          {customer && <div className="customer">{customer}</div>}
          {description && <div className="description">{description}</div>}
          <div className="boxes-pill">
            {boxIndex} of {totalBoxes} {totalBoxes === 1 ? 'box' : 'boxes'}
          </div>
          <div className="qr-area">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Scan to confirm pickup" />
            <div className="qr-caption">Scan to confirm pickup</div>
          </div>
        </div>
      ))}
      <StickerAutoPrint />
    </>
  )
}
