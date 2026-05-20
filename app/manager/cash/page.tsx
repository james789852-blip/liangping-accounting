import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import CashCountForm from '@/components/manager/cash-count-form'

export const dynamic = 'force-dynamic'

export default async function CashPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, store_ids').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm">
        您尚未被指派到任何店家，請聯絡系統管理員。
      </div>
    )
  }

  const today = getBusinessDate()
  const sevenDaysAgo = new Date(new Date(today + 'T00:00:00+08:00').getTime() - 7 * 86400000).toISOString().slice(0, 10)

  const admin = createAdminClient()

  const [{ data: store }, { data: closing }, { data: todayPetty }, { data: historyRows }] = await Promise.all([
    supabase.from('stores').select('name, petty_cash').eq('id', storeId).single(),
    supabase.from('daily_closings')
      .select('id, status, actual_remit, total_revenue, variance')
      .eq('store_id', storeId).eq('business_date', today).maybeSingle(),
    admin.from('petty_cash_counts').select('*')
      .eq('store_id', storeId).eq('count_date', today).maybeSingle(),
    admin.from('petty_cash_counts').select('*')
      .eq('store_id', storeId)
      .gte('count_date', sevenDaysAgo)
      .lt('count_date', today)
      .order('count_date', { ascending: false })
      .limit(7),
  ])

  return (
    <CashCountForm
      storeName={store?.name ?? ''}
      pettyCash={store?.petty_cash ?? 0}
      storeId={storeId}
      today={today}
      closing={closing ?? null}
      savedPettyCashCount={todayPetty ?? null}
      history={historyRows ?? []}
    />
  )
}
