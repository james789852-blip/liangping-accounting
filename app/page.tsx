import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasAnyHQPermission, isStoreRole } from '@/lib/user-permissions'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, is_hq, primary_store_id, can_manage_users, can_manage_stores, can_manage_store_settings, can_manage_ck_settings, can_manage_items, can_manage_store_items, can_manage_ck_items, can_manage_store_receipts, can_manage_ck_receipts, can_manage_ck_prices, can_review_closings, can_export_reports')
    .eq('user_id', user.id)
    .single()

  // 店家角色（店長/副店長/小幫手/廠長/副廠長）一律進 manager dashboard，不論 is_hq
  const storeRole = isStoreRole(profile?.role)
  const isHQ = hasAnyHQPermission(profile)

  // 總公司人員若有設定主店 → 一律先進他自己店長端的主店畫面
  if ((storeRole || isHQ) && (profile as any)?.primary_store_id) {
    redirect('/manager/dashboard')
  }

  redirect(isHQ ? '/hq/dashboard' : '/manager/dashboard')
}
