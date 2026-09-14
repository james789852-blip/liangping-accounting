'use server'

import { getVerifiedUser } from '@/lib/authed-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageCKSettings, canManageStoreSettings, canManageUsers } from '@/lib/user-permissions'
import { sendTestPushToStore, sendTestPushToUser } from '@/lib/push-notifications'

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
