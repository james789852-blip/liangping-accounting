import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  DEFAULT_PUSH_SCHEDULE_SETTINGS,
  normalizePushScheduleSettings,
  type PushScheduleSettings,
} from '@/lib/push-schedule'

export async function getPushScheduleSettings(): Promise<PushScheduleSettings> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('push_schedule_settings')
    .select('accounting_first_time, accounting_final_time, ck_handoff_time, returned_reminder_minutes')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    console.error('[push-schedule] load failed, using defaults:', error.message)
    return DEFAULT_PUSH_SCHEDULE_SETTINGS
  }
  return normalizePushScheduleSettings(data)
}
