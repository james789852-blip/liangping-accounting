import { ensureMonthSheetsTabs } from '@/lib/google-sheets'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const month = url.searchParams.get('month') || undefined
    const refreshExisting = url.searchParams.get('refresh') === '1'
    const scope = url.searchParams.get('scope')
    const type = scope === 'store' ? '店面' : scope === 'central-kitchen' ? '央廚' : undefined
    const result = await ensureMonthSheetsTabs(month, { refreshExisting, type })
    const status = result.failed.length > 0 ? 207 : 200
    return Response.json(result, { status })
  } catch (error) {
    console.error('[ensure-month-sheets] failed:', error)
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
