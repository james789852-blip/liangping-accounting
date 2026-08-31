'use server'

import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, revalidateTag } from 'next/cache'
import { canManageCKSettings, canManageStoreSettings } from '@/lib/user-permissions'

interface StoreSettings {
  mode: string
  ichef_uber_linked: boolean
  uber_enabled: boolean
  uber_accounts: string[]
  panda_enabled: boolean
  twpay_enabled: boolean
  online_enabled: boolean
  online_cash_enabled: boolean
  petty_cash: number
  name?: string
  type?: string
  google_sheets_id?: string | null
}

async function requireManager() {
  const supabase = await createClient()
  const user = await getVerifiedUser()
  if (!user) return { user: null, profile: null, error: '未登入' as string }
  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canManageStoreSettings(profile) && !canManageCKSettings(profile)) {
    return { user: null, profile: null, error: '權限不足，未開啟「可管理店家」權限' as string }
  }
  return { user, profile, error: null }
}

function canManageStoreType(profile: any, type?: string | null) {
  return (type === '央廚') ? canManageCKSettings(profile) : canManageStoreSettings(profile)
}

export async function updateStoreSettings(storeId: string, settings: StoreSettings) {
  const { profile, error } = await requireManager()
  if (error) return { error }

  const admin = createAdminClient()
  const { data: currentStore } = await admin.from('stores').select('type').eq('id', storeId).single()
  const targetType = settings.type ?? currentStore?.type ?? '店面'
  if (!canManageStoreType(profile, targetType)) {
    return { error: targetType === '央廚' ? '權限不足，未開啟「可管理央廚店家」權限' : '權限不足，未開啟「可管理店面店家」權限' }
  }

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
      online_cash_enabled: settings.online_cash_enabled,
      petty_cash: settings.petty_cash,
      ...('google_sheets_id' in settings ? { google_sheets_id: settings.google_sheets_id ?? null } : {}),
    })
    .eq('id', storeId)

  if (dbErr) return { error: dbErr.message }

  revalidatePath('/hq/stores')
  revalidatePath('/manager', 'layout')
  revalidatePath('/manager/closing')
  revalidateTag('stores', 'default')   // 失效 getCachedAllStores / getCachedStoreById / getCachedStoreFull
  return { success: true }
}

export async function createStore(name: string, mode: string, type = '店面') {
  const { profile, error } = await requireManager()
  if (error) return { error }
  if (!canManageStoreType(profile, type)) {
    return { error: type === '央廚' ? '權限不足，未開啟「可管理央廚店家」權限' : '權限不足，未開啟「可管理店面店家」權限' }
  }

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
  revalidateTag('stores', 'default')
  return { success: true, id: data.id }
}

export async function deactivateStore(storeId: string) {
  const { profile, error } = await requireManager()
  if (error) return { error }

  const admin = createAdminClient()
  const { data: store, error: loadError } = await admin
    .from('stores')
    .select('id, name, type, active')
    .eq('id', storeId)
    .maybeSingle()

  if (loadError) return { error: loadError.message }
  if (!store || store.active === false) return { error: '找不到這間店家，可能已經被停用' }
  if (!canManageStoreType(profile, store.type)) {
    return { error: store.type === '央廚' ? '權限不足，無法停用央廚店家' : '權限不足，無法停用店面店家' }
  }

  const { data: deactivated, error: dbErr } = await admin
    .from('stores')
    .update({ active: false })
    .eq('id', storeId)
    .eq('active', true)
    .select('id')
    .maybeSingle()

  if (dbErr) return { error: dbErr.message }
  if (!deactivated) return { error: '停用失敗，店家狀態沒有更新，請重新整理後再試一次' }

  revalidatePath('/hq/stores')
  revalidatePath('/hq/users')
  revalidatePath('/hq/dashboard')
  revalidatePath('/manager', 'layout')
  revalidatePath('/manager/closing')
  revalidateTag('stores', 'default')
  return { success: true, name: store.name }
}

export async function activateStore(storeId: string) {
  const { profile, error } = await requireManager()
  if (error) return { error }

  const admin = createAdminClient()
  const { data: store, error: loadError } = await admin
    .from('stores')
    .select('id, name, type, active')
    .eq('id', storeId)
    .maybeSingle()

  if (loadError) return { error: loadError.message }
  if (!store || store.active !== false) return { error: '找不到這間已停用店家，可能已經重新啟用' }
  if (!canManageStoreType(profile, store.type)) {
    return { error: store.type === '央廚' ? '權限不足，無法重新啟用央廚店家' : '權限不足，無法重新啟用店面店家' }
  }

  const { data: activated, error: dbErr } = await admin
    .from('stores')
    .update({ active: true })
    .eq('id', storeId)
    .eq('active', false)
    .select('id')
    .maybeSingle()

  if (dbErr) return { error: dbErr.message }
  if (!activated) return { error: '重新啟用失敗，店家狀態沒有更新，請重新整理後再試一次' }

  revalidatePath('/hq/stores')
  revalidatePath('/hq/users')
  revalidatePath('/hq/dashboard')
  revalidatePath('/manager', 'layout')
  revalidatePath('/manager/closing')
  revalidateTag('stores', 'default')
  return { success: true, name: store.name }
}
