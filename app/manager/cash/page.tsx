import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
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

  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)

  const [{ data: store }, { data: closing }] = await Promise.all([
    supabase.from('stores').select('name, petty_cash').eq('id', storeId).single(),
    supabase.from('daily_closings')
      .select('id, status, actual_remit, total_revenue, variance')
      .eq('store_id', storeId).eq('business_date', today).maybeSingle(),
  ])

  // 取今日已儲存的現金清點（若有）
  let savedCashCounts: any = null
  if (closing) {
    const admin = createAdminClient()
    const { data: cashCounts } = await admin
      .from('cash_counts').select('*').eq('closing_id', closing.id)
    savedCashCounts = cashCounts?.[0] ?? null
  }

  return (
    <CashCountForm
      storeName={store?.name ?? ''}
      pettyCash={store?.petty_cash ?? 0}
      today={today}
      closing={closing ?? null}
      savedCashCounts={savedCashCounts}
    />
  )
}
