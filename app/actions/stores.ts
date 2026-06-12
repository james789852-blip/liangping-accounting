'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
  name?: string
  type?: string
}

async function requireManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null, error: '未登入' as string }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile || !['經理', '總監', '老闆'].includes(profile.role ?? '')) {
    return { user: null, profile: null, error: '權限不足，僅限經理以上操作' as string }
  }
  return { user, profile, error: null }
}

export async function updateStoreSettings(storeId: string, settings: StoreSettings) {
  const { profile, error } = await requireManager()
  if (error) return { error }

  const admin = createAdminClient()
  const { error: dbErr } = await admin
    .from('stores')
    .update({
      ...(settings.name ? { name: settings.name.trim() } : {}),
      ...(settings.type ? { type: settings.type } : {}),
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

  if (dbErr) return { error: dbErr.message }

  revalidatePath('/hq/stores')
  revalidatePath('/manager', 'layout')
  revalidatePath('/manager/closing')
  return { success: true }
}

export async function createStore(name: string, mode: string, type = '店面') {
  const { error } = await requireManager()
  if (error) return { error }

  const trimmed = name.trim()
  if (!trimmed) return { error: '請填寫店家名稱' }

  const admin = createAdminClient()
  const { data, error: dbErr } = await admin
    .from('stores')
    .insert({ name: trimmed, mode, type, active: true })
    .select('id')
    .single()

  if (dbErr) return { error: dbErr.message }

  revalidatePath('/hq/stores')
  revalidatePath('/manager', 'layout')
  return { success: true, id: data.id }
}
