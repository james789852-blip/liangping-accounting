import { autoCompleteExpiredCKReimbursementHandoffs } from '@/lib/ck-reimbursement-handoff'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await autoCompleteExpiredCKReimbursementHandoffs()
    return Response.json({
      success: true,
      completedCount: result.completedCount,
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[auto-complete-ck-handoffs] failed:', error)
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
