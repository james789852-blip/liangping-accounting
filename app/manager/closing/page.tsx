import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClosingForm from '@/components/manager/closing-form'
import { Store, CKPrice } from '@/lib/types'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import { getReceiptSettings } from '@/app/actions/receipt-settings'
import { getCachedUserProfile, getCachedStoreFull, getCachedActiveCKPrices, getCachedStoreMappings, getCachedItemOrder } from '@/lib/cached-queries'
import { getStoreItemsResolved, toMappingColumns } from '@/lib/store-items-resolver'
import { getStoreItemsFromMappings } from '@/lib/mapping-based-items'

export const dynamic = 'force-dynamic'

export default async function ClosingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 共用 layout 的 user_profile 快取，避免重複查
  const profile = await getCachedUserProfile(user.id)
  const params = await searchParams

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) {
    return (
      <div className="p-6">
        <p className="text-red-500">您尚未被指派到任何店家，請聯絡系統管理員。</p>
      </div>
    )
  }

  const realToday = getBusinessDate()
  // ?date 參數允許店長補做過往帳目；只接受 YYYY-MM-DD 且不晚於今日
  const requested = params.date
  const today = (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= realToday)
    ? requested
    : realToday
  const isBackfill = today !== realToday

  // 一次平行撈完所有依賴 storeId/today 的資料（含 store_items_resolved）
  const [
    store,
    ckPrices,
    { data: existingClosing },
    { data: todayReceipts },
    receiptCategories,
    mappingRows,
    { data: prevClosing },
    itemOrder,
    newItems,
    mappingBasedItems,
  ] = await Promise.all([
    getCachedStoreFull(storeId),
    getCachedActiveCKPrices(),
    supabase
      .from('daily_closings')
      .select('*, revenue_items(*), order_items(*), expense_items(*), handwrite_orders(*), cash_counts(*)')
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
    getCachedStoreMappings(storeId),
    supabase
      .from('daily_closings')
      .select('reserve_items, business_date')
      .eq('store_id', storeId)
      .lt('business_date', today)
      .in('status', ['submitted', 'verified'])
      .order('business_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getCachedItemOrder(storeId),
    getStoreItemsResolved(storeId),
    // 也撈 mapping-based items（跟 xlsx 匯出同源，確保下拉品項齊全）
    getStoreItemsFromMappings(storeId),
  ] as const)

  // 央廚店家使用專屬流程
  if ((store as any)?.type === '央廚') redirect('/manager/ck')

  if (existingClosing?.status === 'disputed') {
    redirect(`/manager/edit/${existingClosing.id}`)
  }

  const prevReserveItems = (prevClosing?.reserve_items as any[]) ?? []
  const prevDayReserves = prevReserveItems.length > 0
    ? { business_date: prevClosing!.business_date as string, items: prevReserveItems }
    : null

  const orderMap = new Map<string, number>(itemOrder.map((name, i) => [name, i] as const))

  // 優先用 item_column_mappings（跟 xlsx 匯出同源，確保收據下拉品項跟 xlsx 一致）
  // 若 mapping 空才 fallback 舊資料源
  const mappingColumns = mappingBasedItems.length > 0
    ? toMappingColumns(mappingBasedItems)
    : newItems.length > 0
    ? toMappingColumns(newItems)
    : (mappingRows ?? []).map((r: { item_name: string; item_category: string; vendor_group: string | null; excel_column: string }) => ({
        name: r.item_name,
        category: r.item_category,
        vendor_group: r.vendor_group ?? undefined,
        excel_column: r.excel_column,
      })).sort((a, b) => (orderMap.get(a.name) ?? 9999) - (orderMap.get(b.name) ?? 9999))

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
      isBackfill={isBackfill}
      realToday={realToday}
    />
  )
}
