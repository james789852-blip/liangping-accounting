'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface StoreSettings {
  mode: string
  ichef_uber_linked: boolean
  uber_enabled: boolean
  uber_accounts: string[]
  panda_enabled: boolean
  twpay_enabled: boolean
  online_enabled: boolean
  petty_cash: number
}

export async function updateStoreSettings(storeId: string, settings: StoreSettings) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('user_id', user.id).single()

  if (!profile || !['經理', '總監', '老闆'].includes(profile.role)) {
    return { error: '權限不足，僅限經理以上操作' }
  }

  const { error } = await supabase
    .from('stores')
    .update({
      mode: settings.mode,
      ichef_uber_linked: settings.ichef_uber_linked,
      uber_enabled: settings.uber_enabled,
      uber_accounts: settings.uber_accounts,
      panda_enabled: settings.panda_enabled,
      twpay_enabled: settings.twpay_enabled,
      online_enabled: settings.online_enabled,
      petty_cash: settings.petty_cash,
    })
    .eq('id', storeId)

  if (error) return { error: error.message }

  revalidatePath('/hq/stores')
  revalidatePath('/manager', 'layout')
  revalidatePath('/manager/closing')

  return { success: true }
}
