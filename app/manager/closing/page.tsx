import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ClosingForm from '@/components/manager/closing-form'
import ClosingDoneCard from '@/components/manager/closing-done-card'
import { Store, CKPrice } from '@/lib/types'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'

export const dynamic = 'force-dynamic'

export default async function ClosingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('name, role, store_ids')
    .eq('user_id', user.id)
    .single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) {
    return (
      <div className="p-6">
        <p className="text-red-500">您尚未被指派到任何店家，請聯絡系統管理員。</p>
      </div>
    )
  }

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', storeId)
    .single()

  const { data: ckPrices } = await supabase
    .from('central_kitchen_prices')
    .select('id, item_name, unit_price, excel_column')
    .eq('active', true)
    .order('sort_order').order('item_name')

  const today = getBusinessDate()

  const { data: existingClosing } = await supabase
    .from('daily_closings')
    .select('*, revenue_items(*), order_items(*), expense_items(*), handwrite_orders(*)')
    .eq('store_id', storeId)
    .eq('business_date', today)
    .maybeSingle()

  if (existingClosing) {
    const admin = createAdminClient()
    const { data: cashCounts } = await admin.from('cash_counts').select('*').eq('closing_id', existingClosing.id)
    ;(existingClosing as any).cash_counts = cashCounts ?? []
  }

  if (existingClosing && ['submitted', 'verified'].includes(existingClosing.status)) {
    return (
      <ClosingDoneCard
        storeName={store?.name ?? ''}
        businessDate={today}
        status={existingClosing.status}
        totalRevenue={existingClosing.total_revenue}
        variance={existingClosing.variance}
      />
    )
  }

  if (existingClosing?.status === 'disputed') {
    redirect(`/manager/edit/${existingClosing.id}`)
  }

  // 撈今日收據，供結帳表單自動填入「當日現金支出」
  const { data: todayReceipts } = await supabase
    .from('receipts')
    .select('id, vendor_name, total_amount, receipt_type, receipt_items(item_name, amount)')
    .eq('store_id', storeId)
    .eq('business_date', today)
    .order('created_at')

  return (
    <ClosingForm
      store={store as Store}
      ckPrices={(ckPrices ?? []) as CKPrice[]}
      existingClosing={existingClosing}
      userId={user.id}
      today={today}
      todayReceipts={todayReceipts ?? []}
    />
  )
}
