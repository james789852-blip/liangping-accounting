import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { getDefaultHQHref } from '@/lib/user-permissions'

export default async function Home() {
  const user = await getAuthedUser()

  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, is_hq, store_ids, can_manage_users, can_manage_stores, can_manage_store_settings, can_manage_ck_settings, can_manage_items, can_manage_store_items, can_manage_ck_items, can_manage_store_receipts, can_manage_ck_receipts, can_manage_ck_prices, can_review_closings, can_export_reports')
    .eq('user_id', user.id)
    .single()

  const isHQ = profile?.role === '老闆' || profile?.is_hq === true
  const hasAssignedStore = Array.isArray(profile?.store_ids) && profile.store_ids.length > 0

  // 只要有店家權限就優先進店長端；仍可從導覽列返回總公司。
  if (!isHQ && hasAssignedStore) {
    redirect('/manager/dashboard')
  }

  redirect(isHQ ? getDefaultHQHref(profile) : '/manager/dashboard')
}
