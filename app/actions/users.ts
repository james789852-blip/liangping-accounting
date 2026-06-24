'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const MANAGE_ROLES = ['經理', '總監', '老闆']

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('user_profiles').select('role').eq('user_id', user.id).single()
  return data
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
}) {
  const caller = await getCallerProfile()
  if (!caller || !MANAGE_ROLES.includes(caller.role)) return { error: '權限不足' }

  const admin = getAdminClient()
  const email = `${formData.account.trim().toUpperCase()}@liang-ping.com`

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: formData.password,
    email_confirm: true,
  })
  if (authError) return { error: authError.message }

  const isOwner = formData.role === '老闆'
  const storeIds = isOwner ? [] : formData.store_ids
  // 確保 primary_store_id 若有設定則必須在 store_ids 內
  const primary = formData.primary_store_id && storeIds.includes(formData.primary_store_id)
    ? formData.primary_store_id
    : (storeIds.length > 0 ? storeIds[0] : null)

  const { error: profileError } = await admin.from('user_profiles').insert({
    user_id: authUser.user.id,
    name: formData.name,
    role: formData.role,
    title: formData.title ?? null,
    employee_id: formData.employee_id ?? null,
    store_ids: storeIds,
    primary_store_id: primary,
    is_hq: isOwner ? true : (formData.is_hq ?? false),
    active: true,
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(authUser.user.id)
    return { error: profileError.message }
  }

  revalidatePath('/hq/users')
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
}) {
  const caller = await getCallerProfile()
  if (!caller || !MANAGE_ROLES.includes(caller.role)) return { error: '權限不足' }

  const admin = getAdminClient()

  // 若帳號有異動，先更新 Supabase auth email
  if (formData.account !== undefined) {
    const newEmail = `${formData.account.trim().toUpperCase()}@liang-ping.com`
    const { error: emailErr } = await admin.auth.admin.updateUserById(userId, { email: newEmail })
    if (emailErr) return { error: '帳號更新失敗：' + emailErr.message }
  }

  const patch: Record<string, unknown> = {}
  if (formData.name !== undefined) patch.name = formData.name
  if (formData.role !== undefined) patch.role = formData.role
  if (formData.title !== undefined) patch.title = formData.title
  if (formData.employee_id !== undefined) patch.employee_id = formData.employee_id
  if (formData.store_ids !== undefined) patch.store_ids = formData.store_ids
  if (formData.is_hq !== undefined) patch.is_hq = formData.is_hq
  if (formData.active !== undefined) patch.active = formData.active

  // primary_store_id：若 store_ids 一起更新，要確保 primary 在 store_ids 內
  if (formData.primary_store_id !== undefined) {
    const sids = formData.store_ids
    if (formData.primary_store_id === null) {
      patch.primary_store_id = null
    } else if (!sids || sids.includes(formData.primary_store_id)) {
      patch.primary_store_id = formData.primary_store_id
    } else {
      // 不一致時，自動修為 store_ids 第一家或 null
      patch.primary_store_id = sids[0] ?? null
    }
  }

  const { error } = await admin
    .from('user_profiles')
    .update(patch)
    .eq('user_id', userId)

  if (error) return { error: error.message }
  revalidatePath('/hq/users')
  return { success: true }
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const caller = await getCallerProfile()
  if (!caller || !MANAGE_ROLES.includes(caller.role)) return { error: '權限不足' }

  const admin = getAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) return { error: error.message }
  return { success: true }
}

export async function updateUserStatus(userId: string, active: boolean) {
  const caller = await getCallerProfile()
  if (!caller || !MANAGE_ROLES.includes(caller.role)) return { error: '權限不足' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('user_profiles').update({ active }).eq('user_id', userId)
  if (error) return { error: error.message }
  revalidatePath('/hq/users')
  return { success: true }
}

export async function deleteUser(userId: string) {
  const caller = await getCallerProfile()
  if (!caller || !['總監', '老闆', '經理'].includes(caller.role)) return { error: '權限不足' }

  const admin = getAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }
  revalidatePath('/hq/users')
  return { success: true }
}

export async function updateUserHQ(userId: string, isHQ: boolean) {
  const supabase = await createClient()
  const { data: { user: caller } } = await supabase.auth.getUser()
  if (!caller) return { error: '未登入' }

  const { data: callerProfile } = await supabase
    .from('user_profiles').select('role').eq('user_id', caller.id).single()
  if (!callerProfile || !['總監', '老闆'].includes(callerProfile.role)) {
    return { error: '權限不足' }
  }

  const { error } = await supabase
    .from('user_profiles').update({ is_hq: isHQ }).eq('user_id', userId)
  if (error) return { error: error.message }
  revalidatePath('/hq/users')
  return { success: true }
}
