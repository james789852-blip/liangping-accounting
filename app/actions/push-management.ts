'use server'

import { getVerifiedUser } from '@/lib/authed-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageCKSettings, canManageStoreSettings, canManageUsers } from '@/lib/user-permissions'
import { sendTestPushToStore, sendTestPushToUser } from '@/lib/push-notifications'
import { validatePushScheduleSettings, type PushScheduleSettings } from '@/lib/push-schedule'
import { logAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

async function callerProfile() {
  const user = await getVerifiedUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle()
  return data?.active === false ? null : data
}

export async function sendStorePushTest(storeId: string) {
  const profile = await callerProfile()
  if (!profile) return { error: '未登入' }
  const admin = createAdminClient()
  const { data: store } = await admin.from('stores').select('type').eq('id', storeId).maybeSingle()
  if (!store) return { error: '找不到店家' }
  const allowed = store.type === '央廚' ? canManageCKSettings(profile) : canManageStoreSettings(profile)
  if (!allowed) return { error: '權限不足' }

  const result = await sendTestPushToStore(storeId)
  if ('error' in result) return result
  if (result.total === 0) return { error: '此店家目前沒有已綁定的推播裝置' }
  if (result.delivered === 0) return { error: '測試通知發送失敗，請重新綁定裝置' }
  return { success: true as const, delivered: result.delivered }
}

export async function sendUserPushTest(userId: string) {
  const profile = await callerProfile()
  if (!canManageUsers(profile)) return { error: '權限不足' }
  const result = await sendTestPushToUser(userId)
  if ('error' in result) return result
  if (result.total === 0) return { error: '此帳號目前沒有已綁定的推播裝置' }
  if (result.delivered === 0) return { error: '測試通知發送失敗，請重新綁定裝置' }
  return { success: true as const, delivered: result.delivered }
}

export async function removeUserPushDevice(subscriptionId: string) {
  const profile = await callerProfile()
  if (!canManageUsers(profile)) return { error: '權限不足' }
  const admin = createAdminClient()
  const { data: device, error: loadError } = await admin.from('push_subscriptions')
    .select('id, user_id, device_name')
    .eq('id', subscriptionId)
    .maybeSingle()
  if (loadError || !device) return { error: '找不到這台推播裝置' }
  const { error } = await admin.from('push_subscriptions').delete().eq('id', subscriptionId)
  if (error) return { error: '解除裝置失敗，請稍後再試' }
  return { success: true as const, deviceName: device.device_name || '裝置' }
}

export async function updatePushScheduleSettings(input: PushScheduleSettings) {
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' }
  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle()
  if (!canManageUsers(profile) || profile?.active === false) return { error: '權限不足' }

  const validated = validatePushScheduleSettings(input)
  if ('error' in validated) return { error: validated.error }
  const settings = validated.settings
  const admin = createAdminClient()
  const { error } = await admin.from('push_schedule_settings').upsert({
    id: 1,
    accounting_first_time: settings.accountingFirstTime,
    accounting_final_time: settings.accountingFinalTime,
    ck_handoff_time: settings.ckHandoffTime,
    returned_reminder_minutes: settings.returnedReminderMinutes,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: `推播時間儲存失敗：${error.message}` }

  await logAudit({
    eventType: 'push_schedule_update',
    userId: user.id,
    description: '更新帳務推播時間設定',
    metadata: settings,
  })
  revalidatePath('/hq/notifications')
  return { success: true as const, settings }
}
