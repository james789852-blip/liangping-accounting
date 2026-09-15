import {
  sendAccountingSubmissionReminders,
  sendCKReimbursementHandoffReminders,
  sendReturnedAccountingReminders,
} from '@/lib/scheduled-push-reminders'
import { processPendingPushJobs } from '@/lib/push-notifications'
import { getPushScheduleSettings } from '@/lib/push-schedule-settings'
import { isPushScheduleDue } from '@/lib/push-schedule'
import { resolveCompletedHQNotificationFollowUps } from '@/lib/hq-notification-followups'

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
    if (kind === 'delivery-retry') {
      const result = await processPendingPushJobs(200)
      return Response.json({ success: true, kind, ...result, checkedAt: new Date().toISOString() })
    }

    const schedule = await getPushScheduleSettings()
    if (kind === 'returned') {
      const result = await sendReturnedAccountingReminders(schedule.returnedReminderMinutes)
      return Response.json({ success: true, kind, ...result, checkedAt: new Date().toISOString() })
    }
    if (kind === 'scheduled') {
      const followUps = await resolveCompletedHQNotificationFollowUps()
      const checks = [
        {
          name: 'accounting-first',
          time: schedule.accountingFirstTime,
          run: () => sendAccountingSubmissionReminders('first', schedule.accountingFirstTime),
        },
        {
          name: 'accounting-final',
          time: schedule.accountingFinalTime,
          run: () => sendAccountingSubmissionReminders('final', schedule.accountingFinalTime),
        },
        {
          name: 'ck-handoff',
          time: schedule.ckHandoffTime,
          run: () => sendCKReimbursementHandoffReminders(schedule.ckHandoffTime),
        },
      ]
      const due = checks.filter(check => isPushScheduleDue(check.time))
      const results = Object.fromEntries(await Promise.all(
        due.map(async check => [check.name, await check.run()] as const),
      ))
      return Response.json({
        success: true,
        kind,
        due: due.map(check => ({ name: check.name, time: check.time })),
        results,
        followUps,
        checkedAt: new Date().toISOString(),
      })
    }

    return Response.json({ error: 'Unknown reminder kind' }, { status: 404 })
  } catch (error) {
    console.error('[push-reminders] failed:', error)
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
