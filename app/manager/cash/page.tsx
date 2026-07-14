import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import CashCountForm from '@/components/manager/cash-count-form'

export const dynamic = 'force-dynamic'

export default async function CashPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }>
}) {
  const supabase = await createClient()
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, store_ids, is_hq, primary_store_id').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm">
        您尚未被指派到任何店家，請聯絡系統管理員。
      </div>
    )
  }

  const realToday = getBusinessDate()
  // ?date 允許查歷史某日（給已 submitted 帳目補做零用金核對用），但不能晚於今日
  const sp = (await searchParams) ?? {}
  const today = (sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= realToday)
    ? sp.date
    : realToday
  const sevenDaysAgo = new Date(new Date(today + 'T00:00:00+08:00').getTime() - 7 * 86400000).toISOString().slice(0, 10)

  const admin = createAdminClient()

  const [{ data: store }, { data: closing }, { data: todayPetty }, { data: historyRows }] = await Promise.all([
    admin.from('stores').select('name, petty_cash').eq('id', storeId).single(),
    admin.from('daily_closings')
      .select('id, status, actual_remit, total_revenue, variance')
      .eq('store_id', storeId).eq('business_date', today).maybeSingle(),
    admin.from('petty_cash_counts')
      .select('count_date, updated_at, bills_1000, bills_500, bills_100, coins_50, coins_10, coins_5, coins_1, lump_1000, lump_500, lump_100, lump_50, lump_10, lump_5, lump_1')
      .eq('store_id', storeId).eq('count_date', today).maybeSingle(),
    admin.from('petty_cash_counts')
      .select('count_date, updated_at, bills_1000, bills_500, bills_100, coins_50, coins_10, coins_5, coins_1, lump_1000, lump_500, lump_100, lump_50, lump_10, lump_5, lump_1')
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
