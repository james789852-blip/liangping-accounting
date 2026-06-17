import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ClosingForm from '@/components/manager/closing-form'
import { Store, CKPrice } from '@/lib/types'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import { getReceiptSettings } from '@/app/actions/receipt-settings'
import { getCachedUserProfile, getCachedStoreFull, getCachedActiveCKPrices } from '@/lib/cached-queries'

export const dynamic = 'force-dynamic'

export default async function ClosingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 共用 layout 的 user_profile 快取，避免重複查
  const profile = await getCachedUserProfile(user.id)

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) {
    return (
      <div className="p-6">
        <p className="text-red-500">您尚未被指派到任何店家，請聯絡系統管理員。</p>
      </div>
    )
  }

  const today = getBusinessDate()
  const admin = createAdminClient()

  // 一次平行撈完所有依賴 storeId/today 的資料
  const [
    store,
    ckPrices,
    { data: existingClosing },
    { data: todayReceipts },
    receiptCategories,
    { data: mappingRows },
    { data: prevClosing },
    itemOrderText,
  ] = await Promise.all([
    getCachedStoreFull(storeId),
    getCachedActiveCKPrices(),
    supabase
      .from('daily_closings')
      .select('*, revenue_items(*), order_items(*), expense_items(*), handwrite_orders(*)')
      .eq('store_id', storeId)
      .eq('business_date', today)
      .maybeSingle(),
    supabase
      .from('receipts')
      .select('id, vendor_name, total_amount, tax_amount, receipt_type, photo_url, notes, receipt_items(item_name, unit, quantity, unit_price, amount)')
      .eq('store_id', storeId)
      .eq('business_date', today)
      .order('created_at'),
    getReceiptSettings(storeId),
    admin.from('item_column_mappings').select('item_name, item_category, vendor_group, excel_column').eq('store_id', storeId),
    supabase
      .from('daily_closings')
      .select('reserve_items, business_date')
      .eq('store_id', storeId)
      .lt('business_date', today)
      .in('status', ['submitted', 'verified'])
      .order('business_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.storage.from('excel-templates').download(`${storeId}-item-order.json`)
      .then(async ({ data }) => (data ? data.text() : null))
      .catch((): null => null),
  ])

  // 央廚店家使用專屬流程
  if ((store as any)?.type === '央廚') redirect('/manager/ck')

  // 補抓 cash_counts（必須等 existingClosing 才知道 id）
  if (existingClosing) {
    const { data: cashCounts } = await admin.from('cash_counts').select('*').eq('closing_id', existingClosing.id)
    ;(existingClosing as any).cash_counts = cashCounts ?? []
  }

  if (existingClosing?.status === 'disputed') {
    redirect(`/manager/edit/${existingClosing.id}`)
  }

  const prevReserveItems = (prevClosing?.reserve_items as any[]) ?? []
  const prevDayReserves = prevReserveItems.length > 0
    ? { business_date: prevClosing!.business_date as string, items: prevReserveItems }
    : null

  let itemOrder: string[] = []
  try { if (itemOrderText) itemOrder = JSON.parse(itemOrderText) } catch {}
  const orderMap = new Map<string, number>(itemOrder.map((name, i) => [name, i] as const))

  // 不過濾任何 mapping 品項：item-order.json 僅用於排序，沒在裡面的品項排到最後。
  // 之前 .filter 會把後來加的 mapping、或舊模板留下的品項擋掉。
  const mappingColumns = (mappingRows ?? []).map((r: { item_name: string; item_category: string; vendor_group: string | null; excel_column: string }) => ({
    name: r.item_name,
    category: r.item_category,
    vendor_group: r.vendor_group ?? undefined,
    excel_column: r.excel_column,
  }))
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
