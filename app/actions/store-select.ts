'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function setManagerStore(storeId: string, surface: 'hq' | 'manager' = 'hq') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, store_ids')
    .eq('user_id', user.id)
    .single()
  const allowed = profile?.role === '老闆' || (profile?.store_ids ?? []).includes(storeId)
  if (!allowed) return { error: '沒有此店家的店家權限' }

  const cookieStore = await cookies()
  const cookieName = surface === 'manager' ? 'manager_viewing_store' : 'hq_viewing_store'
  cookieStore.set(cookieName, storeId, {
    maxAge: 60 * 60 * 24,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  })
  revalidatePath('/manager', 'layout')
  revalidatePath('/hq', 'layout')
  return { success: true }
}
