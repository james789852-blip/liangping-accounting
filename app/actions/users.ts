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

export async function createUser(formData: {
  name: string
  email: string
  password: string
  role: string
  store_ids: string[]
}) {
  const supabase = await createClient()
  const { data: { user: caller } } = await supabase.auth.getUser()
  if (!caller) return { error: '未登入' }

  const { data: callerProfile } = await supabase
    .from('user_profiles').select('role').eq('user_id', caller.id).single()
  if (!callerProfile || !['經理', '總監'].includes(callerProfile.role)) {
    return { error: '權限不足' }
  }

  const admin = getAdminClient()

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: formData.email,
    password: formData.password,
    email_confirm: true,
  })
  if (authError) return { error: authError.message }

  const { error: profileError } = await admin.from('user_profiles').insert({
    user_id: authUser.user.id,
    name: formData.name,
    role: formData.role,
    store_ids: formData.store_ids,
    active: true,
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(authUser.user.id)
    return { error: profileError.message }
  }

  revalidatePath('/hq/users')
  return { success: true }
}

export async function updateUserStatus(userId: string, active: boolean) {
  const supabase = await createClient()
  const { data: { user: caller } } = await supabase.auth.getUser()
  if (!caller) return { error: '未登入' }

  const { error } = await supabase
    .from('user_profiles')
    .update({ active })
    .eq('user_id', userId)

  if (error) return { error: error.message }
  revalidatePath('/hq/users')
  return { success: true }
}
