import {
  sendAccountingSubmissionReminders,
  sendCKReimbursementHandoffReminders,
  sendReturnedAccountingReminders,
} from '@/lib/scheduled-push-reminders'
import { processPendingPushJobs, sendPendingSubmissionDigest } from '@/lib/push-notifications'
import { getPushScheduleSettings } from '@/lib/push-schedule-settings'
import { runScheduledPush } from '@/lib/push-schedule-runs'
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
    if (kind === 'submission-digest') {
      const result = await sendPendingSubmissionDigest()
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
      const settled = await Promise.all(checks.map(async check => {
        try {
          const result = await runScheduledPush({
            key: check.name as 'accounting-first' | 'accounting-final' | 'ck-handoff',
            scheduledTime: check.time,
            run: check.run,
          })
          return [check.name, result] as const
        } catch (error) {
          return [check.name, {
            due: true,
            failed: true,
            error: error instanceof Error ? error.message : String(error),
          }] as const
        }
      }))
      const results = Object.fromEntries(settled)
      const due = checks.filter(check => results[check.name]?.due)
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
