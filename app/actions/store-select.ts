'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function setManagerStore(storeId: string, _surface: 'hq' | 'manager' = 'hq') {
  void _surface
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
  // 總公司端與店長端共用最近一次選擇，確保跨端切換時畫面與選單一致。
  // 權限已在上方驗證，兩個 cookie 只保存通過授權的店家。
  for (const cookieName of ['hq_viewing_store', 'manager_viewing_store']) {
    cookieStore.set(cookieName, storeId, {
      maxAge: 60 * 60 * 24 * 180,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    })
  }
  cookieStore.set(`last_viewing_store_${user.id}`, storeId, {
    maxAge: 60 * 60 * 24 * 180,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  })
  revalidatePath('/manager', 'layout')
  revalidatePath('/hq', 'layout')
  return { success: true }
}
