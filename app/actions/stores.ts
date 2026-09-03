'use server'

import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, revalidateTag } from 'next/cache'
import { canManageCKSettings, canManageStoreSettings } from '@/lib/user-permissions'
import { buildAuditChanges, logAudit } from '@/lib/audit'

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
  const { data: currentStore } = await admin
    .from('stores')
    .select('id, name, type, mode, ichef_uber_linked, uber_enabled, uber_accounts, panda_enabled, twpay_enabled, online_enabled, online_cash_enabled, petty_cash, google_sheets_id, active')
    .eq('id', storeId)
    .single()
  if (!currentStore) return { error: '找不到店家' }
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

  const after = {
    ...currentStore,
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
  }
  await logAudit({
    eventType: 'store_update',
    storeId,
    userId: profile!.user_id,
    description: `${profile!.name ?? '未知'} 修改店家設定（${after.name}）`,
    metadata: {
      action: 'update_settings',
      entity: { type: after.type === '央廚' ? 'central_kitchen' : 'store', id: storeId, name: after.name },
      before: currentStore,
      after,
      changes: buildAuditChanges(currentStore, after),
    },
  })

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

  await logAudit({
    eventType: 'store_update',
    storeId: data.id,
    userId: profile!.user_id,
    description: `${profile!.name ?? '未知'} 新增${type === '央廚' ? '央廚' : '店家'}（${trimmed}）`,
    metadata: {
      action: 'create',
      entity: { type: type === '央廚' ? 'central_kitchen' : 'store', id: data.id, name: trimmed },
      after: { name: trimmed, mode, type, active: true },
    },
  })

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

  await logAudit({
    eventType: 'store_update',
    severity: 'warn',
    storeId,
    userId: profile!.user_id,
    description: `${profile!.name ?? '未知'} 停用${store.type === '央廚' ? '央廚' : '店家'}（${store.name}）`,
    metadata: {
      action: 'deactivate',
      entity: { type: store.type === '央廚' ? 'central_kitchen' : 'store', id: storeId, name: store.name },
      before: { active: true },
      after: { active: false },
      changes: buildAuditChanges({ active: true }, { active: false }, { active: '啟用狀態' }),
    },
  })

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

  await logAudit({
    eventType: 'store_update',
    storeId,
    userId: profile!.user_id,
    description: `${profile!.name ?? '未知'} 重新啟用${store.type === '央廚' ? '央廚' : '店家'}（${store.name}）`,
    metadata: {
      action: 'activate',
      entity: { type: store.type === '央廚' ? 'central_kitchen' : 'store', id: storeId, name: store.name },
      before: { active: false },
      after: { active: true },
      changes: buildAuditChanges({ active: false }, { active: true }, { active: '啟用狀態' }),
    },
  })

  revalidatePath('/hq/stores')
  revalidatePath('/hq/users')
  revalidatePath('/hq/dashboard')
  revalidatePath('/manager', 'layout')
  revalidatePath('/manager/closing')
  revalidateTag('stores', 'default')
  return { success: true, name: store.name }
}

export async function deleteStorePermanently(storeId: string) {
  const { profile, error } = await requireManager()
  if (error) return { error }

  const admin = createAdminClient()
  const { data: store, error: loadError } = await admin
    .from('stores')
    .select('id, name, type, active')
    .eq('id', storeId)
    .maybeSingle()

  if (loadError) return { error: loadError.message }
  if (!store || store.active !== false) return { error: '只有已停用的店家可以永久刪除' }
  if (!canManageStoreType(profile, store.type)) {
    return { error: store.type === '央廚' ? '權限不足，無法刪除央廚店家' : '權限不足，無法刪除店面店家' }
  }

  const relatedChecks = await Promise.all([
    admin.from('user_profiles').select('user_id', { count: 'exact', head: true }).contains('store_ids', [storeId]),
    admin.from('daily_closings').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
    admin.from('ck_daily_records').select('id', { count: 'exact', head: true }).eq('ck_store_id', storeId),
    admin.from('ck_store_orders').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
    admin.from('platform_payouts').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
    admin.from('menu_videos').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
    admin.from('audit_logs').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
    admin.from('stores').select('id', { count: 'exact', head: true }).contains('assigned_store_ids', [storeId]),
  ])

  const checkError = relatedChecks.find(result => result.error)?.error
  if (checkError) return { error: `刪除前檢查失敗：${checkError.message}` }
  const relatedCount = relatedChecks.reduce((sum, result) => sum + (result.count ?? 0), 0)
  if (relatedCount > 0) {
    return { error: '這間店仍有帳號、帳務或歷史紀錄，為避免資料遺失無法永久刪除；請維持停用狀態' }
  }

  const { data: deleted, error: dbErr } = await admin
    .from('stores')
    .delete()
    .eq('id', storeId)
    .eq('active', false)
    .select('id')
    .maybeSingle()

  if (dbErr) return { error: '這間店仍有關聯設定或資料，無法永久刪除；請維持停用狀態' }
  if (!deleted) return { error: '永久刪除失敗，店家可能已被修改，請重新整理後再試一次' }

  await logAudit({
    eventType: 'store_update',
    severity: 'warn',
    userId: profile!.user_id,
    description: `${profile!.name ?? '未知'} 永久刪除${store.type === '央廚' ? '央廚' : '店家'}（${store.name}）`,
    metadata: {
      action: 'delete',
      entity: { type: store.type === '央廚' ? 'central_kitchen' : 'store', id: storeId, name: store.name },
      before: store,
    },
  })

  revalidatePath('/hq/stores')
  revalidatePath('/hq/users')
  revalidatePath('/hq/dashboard')
  revalidatePath('/manager', 'layout')
  revalidateTag('stores', 'default')
  return { success: true, name: store.name }
}
