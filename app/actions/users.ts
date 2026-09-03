'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getVerifiedUser } from '@/lib/authed-user'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { canManageUsers } from '@/lib/user-permissions'
import { inferSystemRole } from '@/lib/account-access'
import { resolvePrimaryStoreId } from '@/lib/user-primary-store'
import { buildAuditChanges, logAudit } from '@/lib/audit'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getCallerProfile() {
  const supabase = await createClient()
  const user = await getVerifiedUser()
  if (!user) return null
  const { data } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  return data?.active === false ? null : data
}

function readableUserCreateError(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes('already') || lower.includes('duplicate') || lower.includes('unique')) {
    return '此帳號已存在，請確認身分證字號是否已建立過'
  }
  if (lower.includes('password')) {
    return '密碼不符合規則，請至少輸入 6 碼'
  }
  if (lower.includes('email')) {
    return '帳號格式無法建立，請確認身分證字號欄位是否正確'
  }
  if (lower.includes('check constraint') && lower.includes('role')) {
    return '角色尚未被資料庫允許，請先更新角色權限設定'
  }
  if (lower.includes('violates row-level security')) {
    return '資料庫權限不足，請確認管理權限設定'
  }
  return message
}

function safeUserSnapshot(profile: Record<string, unknown> | null | undefined) {
  if (!profile) return null
  const allowed = [
    'user_id', 'name', 'role', 'title', 'employee_id', 'store_ids', 'primary_store_id',
    'is_hq', 'active', 'can_manage_users', 'can_manage_stores', 'can_manage_store_settings',
    'can_manage_ck_settings', 'can_manage_items', 'can_manage_store_items', 'can_manage_ck_items',
    'can_manage_store_receipts', 'can_manage_ck_receipts', 'can_manage_ck_prices',
    'can_review_closings', 'can_export_reports',
  ]
  return Object.fromEntries(allowed.filter(key => key in profile).map(key => [key, profile[key]]))
}

export async function createUser(formData: {
  name: string
  account: string      // 身分證字號
  password: string
  role: string
  title?: string
  employee_id?: string
  store_ids: string[]
  is_hq?: boolean
  primary_store_id?: string | null
  can_manage_users?: boolean
  can_manage_stores?: boolean
  can_manage_store_settings?: boolean
  can_manage_ck_settings?: boolean
  can_manage_items?: boolean
  can_manage_store_items?: boolean
  can_manage_ck_items?: boolean
  can_manage_store_receipts?: boolean
  can_manage_ck_receipts?: boolean
  can_manage_ck_prices?: boolean
  can_review_closings?: boolean
  can_export_reports?: boolean
}) {
  const caller = await getCallerProfile()
  if (!canManageUsers(caller)) return { error: '權限不足' }

  const admin = getAdminClient()
  const email = `${formData.account.trim().toUpperCase()}@liang-ping.com`

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: formData.password,
    email_confirm: true,
  })
  if (authError) return { error: readableUserCreateError(authError.message) }

  const systemRole = inferSystemRole(formData.title, formData.role)
  const isOwner = systemRole === '老闆'
  const requestedPrimary = formData.is_hq ? null : (formData.primary_store_id ?? null)
  const storeIds = isOwner
    ? []
    : [...new Set([...(requestedPrimary ? [requestedPrimary] : []), ...formData.store_ids])]
  const primary = isOwner ? null : requestedPrimary

  const { error: profileError } = await admin.from('user_profiles').insert({
    user_id: authUser.user.id,
    name: formData.name,
    role: systemRole,
    title: formData.title ?? null,
    employee_id: formData.employee_id ?? null,
    store_ids: storeIds,
    primary_store_id: primary,
    is_hq: isOwner || formData.is_hq === true,
    can_manage_users: isOwner ? true : (formData.can_manage_users ?? false),
    can_manage_stores: isOwner ? true : ((formData.can_manage_store_settings ?? false) || (formData.can_manage_ck_settings ?? false) || (formData.can_manage_stores ?? false)),
    can_manage_store_settings: isOwner ? true : (formData.can_manage_store_settings ?? formData.can_manage_stores ?? false),
    can_manage_ck_settings: isOwner ? true : (formData.can_manage_ck_settings ?? formData.can_manage_stores ?? false),
    can_manage_items: isOwner ? true : (
      (formData.can_manage_store_items ?? false) ||
      (formData.can_manage_ck_items ?? false) ||
      (formData.can_manage_store_receipts ?? false) ||
      (formData.can_manage_ck_receipts ?? false) ||
      (formData.can_manage_items ?? false)
    ),
    can_manage_store_items: isOwner ? true : (formData.can_manage_store_items ?? formData.can_manage_items ?? false),
    can_manage_ck_items: isOwner ? true : (formData.can_manage_ck_items ?? formData.can_manage_items ?? false),
    can_manage_store_receipts: isOwner ? true : (formData.can_manage_store_receipts ?? formData.can_manage_items ?? false),
    can_manage_ck_receipts: isOwner ? true : (formData.can_manage_ck_receipts ?? formData.can_manage_items ?? false),
    can_manage_ck_prices: isOwner ? true : (formData.can_manage_ck_prices ?? false),
    can_review_closings: isOwner ? true : (formData.can_review_closings ?? false),
    can_export_reports: isOwner ? true : (formData.can_export_reports ?? false),
    active: true,
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(authUser.user.id)
    return { error: readableUserCreateError(profileError.message) }
  }

  await logAudit({
    eventType: 'user_create',
    userId: caller!.user_id,
    description: `${caller!.name ?? '未知'} 新增管理人員（${formData.name}）`,
    metadata: {
      entity: { type: 'user', id: authUser.user.id, name: formData.name },
      after: safeUserSnapshot({
        user_id: authUser.user.id,
        name: formData.name,
        role: systemRole,
        title: formData.title ?? null,
        employee_id: formData.employee_id ?? null,
        store_ids: storeIds,
        primary_store_id: primary,
        is_hq: isOwner || formData.is_hq === true,
        active: true,
      }),
      account_created: true,
    },
  })

  revalidatePath('/hq/users')
  revalidateTag('user-profile', 'default')
  return { success: true }
}

export async function updateUser(userId: string, formData: {
  name?: string
  account?: string      // 身分證字號，若有提供則同步更新 auth email
  role?: string
  title?: string
  employee_id?: string
  store_ids?: string[]
  is_hq?: boolean
  active?: boolean
  primary_store_id?: string | null
  can_manage_users?: boolean
  can_manage_stores?: boolean
  can_manage_store_settings?: boolean
  can_manage_ck_settings?: boolean
  can_manage_items?: boolean
  can_manage_store_items?: boolean
  can_manage_ck_items?: boolean
  can_manage_store_receipts?: boolean
  can_manage_ck_receipts?: boolean
  can_manage_ck_prices?: boolean
  can_review_closings?: boolean
  can_export_reports?: boolean
}) {
  const caller = await getCallerProfile()
  if (!canManageUsers(caller)) return { error: '權限不足' }

  const admin = getAdminClient()
  const { data: currentProfile } = await admin
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (!currentProfile) return { error: '找不到管理人員' }

  // 若帳號有異動，先更新 Supabase auth email
  if (formData.account !== undefined) {
    const newEmail = `${formData.account.trim().toUpperCase()}@liang-ping.com`
    const { error: emailErr } = await admin.auth.admin.updateUserById(userId, { email: newEmail })
    if (emailErr) return { error: '帳號更新失敗：' + emailErr.message }
  }

  const patch: Record<string, unknown> = {}
  if (formData.name !== undefined) patch.name = formData.name
  if (formData.role !== undefined || formData.title !== undefined) {
    patch.role = inferSystemRole(formData.title, formData.role)
  }
  if (formData.title !== undefined) patch.title = formData.title
  if (formData.employee_id !== undefined) patch.employee_id = formData.employee_id
  if (formData.store_ids !== undefined) {
    const primary = formData.is_hq ? null : resolvePrimaryStoreId(formData)
    const storeIds = [...new Set([...(primary ? [primary] : []), ...formData.store_ids])]
    patch.store_ids = storeIds
    patch.primary_store_id = primary
  }
  if (formData.is_hq !== undefined) {
    const nextRole = inferSystemRole(formData.title, formData.role)
    patch.is_hq = nextRole === '老闆' || formData.is_hq === true
    if (formData.is_hq) patch.primary_store_id = null
  }
  if (formData.can_manage_users !== undefined) patch.can_manage_users = formData.can_manage_users
  if (formData.can_manage_stores !== undefined) patch.can_manage_stores = formData.can_manage_stores
  if (formData.can_manage_store_settings !== undefined) patch.can_manage_store_settings = formData.can_manage_store_settings
  if (formData.can_manage_ck_settings !== undefined) patch.can_manage_ck_settings = formData.can_manage_ck_settings
  if (formData.can_manage_store_settings !== undefined || formData.can_manage_ck_settings !== undefined) {
    patch.can_manage_stores = !!(formData.can_manage_store_settings || formData.can_manage_ck_settings)
  }
  if (formData.can_manage_items !== undefined) patch.can_manage_items = formData.can_manage_items
  if (formData.can_manage_store_items !== undefined) patch.can_manage_store_items = formData.can_manage_store_items
  if (formData.can_manage_ck_items !== undefined) patch.can_manage_ck_items = formData.can_manage_ck_items
  if (formData.can_manage_store_receipts !== undefined) patch.can_manage_store_receipts = formData.can_manage_store_receipts
  if (formData.can_manage_ck_receipts !== undefined) patch.can_manage_ck_receipts = formData.can_manage_ck_receipts
  if (
    formData.can_manage_store_items !== undefined ||
    formData.can_manage_ck_items !== undefined ||
    formData.can_manage_store_receipts !== undefined ||
    formData.can_manage_ck_receipts !== undefined
  ) {
    patch.can_manage_items = !!(
      formData.can_manage_store_items ||
      formData.can_manage_ck_items ||
      formData.can_manage_store_receipts ||
      formData.can_manage_ck_receipts
    )
  }
  if (formData.can_manage_ck_prices !== undefined) patch.can_manage_ck_prices = formData.can_manage_ck_prices
  if (formData.can_review_closings !== undefined) patch.can_review_closings = formData.can_review_closings
  if (formData.can_export_reports !== undefined) patch.can_export_reports = formData.can_export_reports
  if (formData.active !== undefined) patch.active = formData.active

  const { error } = await admin
    .from('user_profiles')
    .update(patch)
    .eq('user_id', userId)

  if (error) return { error: error.message }
  const before = safeUserSnapshot(currentProfile) ?? {}
  const after = safeUserSnapshot({ ...currentProfile, ...patch }) ?? {}
  await logAudit({
    eventType: 'user_update',
    userId: caller!.user_id,
    description: `${caller!.name ?? '未知'} 修改管理人員（${String(after.name ?? currentProfile.name)}）`,
    metadata: {
      entity: { type: 'user', id: userId, name: after.name ?? currentProfile.name },
      before,
      after,
      changes: [
        ...buildAuditChanges(before, after),
        ...(formData.account !== undefined ? [{ field: 'account', label: '登入帳號', before: '原帳號', after: '已更新（內容不記錄）' }] : []),
      ],
    },
  })
  revalidatePath('/hq/users')
  revalidateTag('user-profile', 'default')
  return { success: true }
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const caller = await getCallerProfile()
  if (!canManageUsers(caller)) return { error: '權限不足' }

  const admin = getAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) return { error: error.message }
  await logAudit({
    eventType: 'user_password_reset',
    severity: 'warn',
    userId: caller!.user_id,
    description: `${caller!.name ?? '未知'} 重設管理人員密碼`,
    metadata: {
      entity: { type: 'user', id: userId },
      password_changed: true,
      password_value: '[敏感資料已遮蔽]',
    },
  })
  return { success: true }
}

export async function updateUserStatus(userId: string, active: boolean) {
  const caller = await getCallerProfile()
  if (!canManageUsers(caller)) return { error: '權限不足' }

  const admin = getAdminClient()
  const { data: target } = await admin.from('user_profiles').select('name, active').eq('user_id', userId).maybeSingle()
  const { error } = await admin
    .from('user_profiles').update({ active }).eq('user_id', userId)
  if (error) return { error: error.message }
  await logAudit({
    eventType: 'user_status_update',
    severity: active ? 'info' : 'warn',
    userId: caller!.user_id,
    description: `${caller!.name ?? '未知'} ${active ? '啟用' : '停用'}管理人員（${target?.name ?? '未知'}）`,
    metadata: {
      entity: { type: 'user', id: userId, name: target?.name ?? null },
      before: { active: target?.active ?? null },
      after: { active },
      changes: buildAuditChanges({ active: target?.active ?? null }, { active }, { active: '啟用狀態' }),
    },
  })
  revalidatePath('/hq/users')
  revalidateTag('user-profile', 'default')
  return { success: true }
}

export async function deleteUser(userId: string) {
  const caller = await getCallerProfile()
  if (!canManageUsers(caller)) return { error: '權限不足' }

  const admin = getAdminClient()
  const { data: target } = await admin.from('user_profiles').select('*').eq('user_id', userId).maybeSingle()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }
  await logAudit({
    eventType: 'user_delete',
    severity: 'warn',
    userId: caller!.user_id,
    description: `${caller!.name ?? '未知'} 刪除管理人員（${target?.name ?? '未知'}）`,
    metadata: {
      entity: { type: 'user', id: userId, name: target?.name ?? null },
      before: safeUserSnapshot(target),
    },
  })
  revalidatePath('/hq/users')
  revalidateTag('user-profile', 'default')
  return { success: true }
}

export async function updateUserHQ(userId: string, isHQ: boolean) {
  const callerProfile = await getCallerProfile()
  if (!canManageUsers(callerProfile)) {
    return { error: '權限不足' }
  }

  const admin = getAdminClient()
  const { data: target } = await admin.from('user_profiles').select('name, is_hq').eq('user_id', userId).maybeSingle()
  const { error } = await admin
    .from('user_profiles').update({ is_hq: isHQ }).eq('user_id', userId)
  if (error) return { error: error.message }
  await logAudit({
    eventType: 'user_update',
    userId: callerProfile!.user_id,
    description: `${callerProfile!.name ?? '未知'} 修改管理人員總公司權限（${target?.name ?? '未知'}）`,
    metadata: {
      entity: { type: 'user', id: userId, name: target?.name ?? null },
      before: { is_hq: target?.is_hq ?? null },
      after: { is_hq: isHQ },
      changes: buildAuditChanges({ is_hq: target?.is_hq ?? null }, { is_hq: isHQ }, { is_hq: '總公司身分' }),
    },
  })
  revalidatePath('/hq/users')
  revalidateTag('user-profile', 'default')
  return { success: true }
}
