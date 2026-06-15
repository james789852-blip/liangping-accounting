import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ClosingForm from '@/components/manager/closing-form'
import ClosingDoneCard from '@/components/manager/closing-done-card'
import { Store, CKPrice } from '@/lib/types'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import { getReceiptSettings } from '@/app/actions/receipt-settings'

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

  // 央廚店家使用專屬流程，不走一般結帳
  if ((store as any)?.type === '央廚') redirect('/manager/ck')

  const { data: ckPrices } = await supabase
    .from('central_kitchen_prices')
    .select('id, item_name, unit_price, unit, excel_column')
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

  if (existingClosing?.status === 'verified') {
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
    .select('id, vendor_name, total_amount, tax_amount, receipt_type, photo_url, receipt_items(item_name, unit, quantity, unit_price, amount)')
    .eq('store_id', storeId)
    .eq('business_date', today)
    .order('created_at')

  const admin2 = createAdminClient()
  const [receiptCategories, { data: mappingRows }, { data: prevClosing }, itemOrderText] = await Promise.all([
    getReceiptSettings(storeId),
    admin2.from('item_column_mappings').select('item_name, item_category, vendor_group, excel_column').eq('store_id', storeId),
    supabase
      .from('daily_closings')
      .select('reserve_items, business_date')
      .eq('store_id', storeId)
      .lt('business_date', today)
      .in('status', ['submitted', 'verified'])
      .order('business_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin2.storage.from('excel-templates').download(`${storeId}-item-order.json`)
      .then(async ({ data }) => (data ? data.text() : null))
      .catch((): null => null),
  ])

  const prevReserveItems = (prevClosing?.reserve_items as any[]) ?? []
  const prevDayReserves = prevReserveItems.length > 0
    ? { business_date: prevClosing!.business_date as string, items: prevReserveItems }
    : null

  let itemOrder: string[] = []
  try { if (itemOrderText) itemOrder = JSON.parse(itemOrderText) } catch {}
  const orderMap = new Map<string, number>(itemOrder.map((name, i) => [name, i] as const))

  const mappingColumns = (mappingRows ?? []).map((r: { item_name: string; item_category: string; vendor_group: string | null; excel_column: string }) => ({
    name: r.item_name,
    category: r.item_category,
    vendor_group: r.vendor_group ?? undefined,
    excel_column: r.excel_column,
  }))
    .filter(col => itemOrder.length === 0 || orderMap.has(col.name))
    .sort((a, b) => (orderMap.get(a.name) ?? 9999) - (orderMap.get(b.name) ?? 9999))

  return (
    <ClosingForm
      store={store as Store}
      ckPrices={(ckPrices ?? []) as CKPrice[]}
      existingClosing={existingClosing}
      userId={user.id}
      today={today}
      todayReceipts={todayReceipts ?? []}
      receiptCategories={receiptCategories}
      mappingColumns={mappingColumns}
      prevDayReserves={prevDayReserves}
    />
  )
}
