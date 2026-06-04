import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ClosingForm from '@/components/manager/closing-form'
import { Store, CKPrice } from '@/lib/types'
import { getEffectiveStoreId } from '@/lib/get-effective-store'

export default async function EditClosingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, store_ids').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) return <div className="p-6 text-red-500">您尚未被指派到任何店家</div>

  const { data: closing } = await supabase
    .from('daily_closings')
    .select('*, revenue_items(*), order_items(*), expense_items(*), handwrite_orders(*)')
    .eq('id', id)
    .eq('store_id', storeId)
    .single()

  if (closing) {
    const admin = createAdminClient()
    const { data: cashCounts } = await admin.from('cash_counts').select('*').eq('closing_id', closing.id)
    ;(closing as any).cash_counts = cashCounts ?? []
  }

  if (!closing) return <div className="p-6 text-slate-500">找不到此帳目或無權限</div>

  if (!['draft', 'disputed'].includes(closing.status)) {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-3">
        <p className="text-slate-600">此帳目狀態為「{closing.status}」，無法編輯</p>
        <a href="/manager/history" className="text-blue-600 text-sm underline">返回歷史紀錄</a>
      </div>
    )
  }

  const { data: store } = await supabase
    .from('stores').select('*').eq('id', storeId).single()

  const { data: ckPrices } = await supabase
    .from('central_kitchen_prices')
    .select('id, item_name, unit_price, unit, excel_column')
    .eq('active', true)
    .order('sort_order').order('item_name')

  const { data: todayReceipts } = await supabase
    .from('receipts')
    .select('id, vendor_name, total_amount, tax_amount, receipt_type, photo_url, receipt_items(item_name, unit, quantity, amount)')
    .eq('store_id', storeId)
    .eq('business_date', closing.business_date)
    .order('created_at')

  return (
    <ClosingForm
      store={store as Store}
      ckPrices={(ckPrices ?? []) as CKPrice[]}
      existingClosing={closing}
      userId={user.id}
      today={closing.business_date}
      todayReceipts={todayReceipts ?? []}
    />
  )
}
