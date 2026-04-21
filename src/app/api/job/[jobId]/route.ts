import { NextResponse } from 'next/server'
import { getJob } from '@/lib/syncore/client'
import { isAdminFromRequest } from '@/lib/admin-auth'

export async function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  if (!isAdminFromRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { jobId: jobIdStr } = await params
  const jobId = parseInt(jobIdStr, 10)
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return NextResponse.json({ error: 'bad job id' }, { status: 400 })
  }

  try {
    const job = await getJob(jobId)
    return NextResponse.json({
      jobId: job.jobId,
      customer: job.customer,
      description: job.description,
      repName: job.repName
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 404 })
  }
}
