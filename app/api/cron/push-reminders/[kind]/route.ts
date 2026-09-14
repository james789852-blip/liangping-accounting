import {
  sendAccountingSubmissionReminders,
  sendCKReimbursementHandoffReminders,
} from '@/lib/scheduled-push-reminders'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { kind } = await context.params
    const result = kind === 'accounting-first'
      ? await sendAccountingSubmissionReminders('23:00')
      : kind === 'accounting-final'
        ? await sendAccountingSubmissionReminders('23:30')
        : kind === 'ck-handoff'
          ? await sendCKReimbursementHandoffReminders()
          : null
    if (!result) return Response.json({ error: 'Unknown reminder kind' }, { status: 404 })
    return Response.json({ success: true, kind, ...result, checkedAt: new Date().toISOString() })
  } catch (error) {
    console.error('[push-reminders] failed:', error)
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
