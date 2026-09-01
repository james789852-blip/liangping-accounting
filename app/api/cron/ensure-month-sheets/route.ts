import { ensureMonthSheetsTabs } from '@/lib/google-sheets'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await ensureMonthSheetsTabs()
    const status = result.failed.length > 0 ? 207 : 200
    return Response.json(result, { status })
  } catch (error) {
    console.error('[ensure-month-sheets] failed:', error)
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
