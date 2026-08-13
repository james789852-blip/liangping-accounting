import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ClosingForm from '@/components/manager/closing-form'
import { Store, CKPrice } from '@/lib/types'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import { getReceiptSettings } from '@/app/actions/receipt-settings'
import { getCachedUserProfile, getCachedStoreFull, getCachedStoreMappings, getCachedItemOrder, getCachedActiveCKPrices } from '@/lib/cached-queries'
import { getStoreItemsResolved, toMappingColumns } from '@/lib/store-items-resolver'
import { getStoreItemsFromMappings } from '@/lib/mapping-based-items'
import { buildReserveHistoryContext } from '@/lib/reserve-history'

export const dynamic = 'force-dynamic'

export default async function ClosingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const supabase = await createClient()
  const user = await getAuthedUser()
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
  const admin = createAdminClient()

  const realToday = getBusinessDate()
  const taipeiNow = new Date(Date.now() + 8 * 3600000)
  const calendarToday = taipeiNow.toISOString().slice(0, 10)
  const isEarlyMorningBusinessDate = calendarToday !== realToday
  // ?date 參數允許店長補做過往帳目；只接受 YYYY-MM-DD 且不晚於今日
  const requested = params.date
  const today = (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= realToday)
    ? requested
    : realToday
  const isBackfill = today !== realToday
  const reserveLookbackDate = new Date(new Date(today + 'T00:00:00+08:00').getTime() - 45 * 86400000).toISOString().slice(0, 10)

  // 一次平行撈完所有依賴 storeId/today 的資料（含 store_items_resolved）
  const [
    store,
    ckPrices,
    { data: existingClosing },
    { data: todayReceipts },
    receiptCategories,
    mappingRows,
    { data: prevReserveClosings },
    itemOrder,
    mappingBasedItems,
    { data: actualVendors },
    { data: latestBackfillDraft },
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
      .select('id, vendor_name, actual_vendor_name, total_amount, tax_amount, receipt_type, photo_url, notes, receipt_items(item_name, unit, quantity, unit_price, amount)')
      .eq('store_id', storeId)
      .eq('business_date', today)
      .order('created_at'),
    getReceiptSettings(storeId),
    getCachedStoreMappings(storeId),
    admin
      .from('daily_closings')
      .select('reserve_items, business_date, expense_items(description, amount)')
      .eq('store_id', storeId)
      .gte('business_date', reserveLookbackDate)
      .lt('business_date', today)
      .in('status', ['submitted', 'verified'])
      .order('business_date', { ascending: false })
      .limit(45),
    getCachedItemOrder(storeId),
    // 也撈 mapping-based items（跟 xlsx 匯出同源，確保下拉品項齊全）
    getStoreItemsFromMappings(storeId),
    supabase
      .from('store_actual_vendors')
      .select('id, vendor_group, name')
      .eq('store_id', storeId)
      .eq('active', true)
      .order('vendor_group')
      .order('sort_order')
      .order('name'),
    !requested
      ? supabase
          .from('daily_closings')
          .select('business_date')
          .eq('store_id', storeId)
          .lt('business_date', realToday)
          .in('status', ['draft', 'disputed'])
          .order('business_date', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ] as const)

  if (existingClosing) {
    const { data: cashCounts } = await admin
      .from('cash_counts')
      .select('*')
      .eq('closing_id', existingClosing.id)
    ;(existingClosing as any).cash_counts = cashCounts ?? existingClosing.cash_counts ?? []
  }

  // 央廚店家使用專屬流程
  if ((store as any)?.type === '央廚') redirect('/manager/ck')

  if (existingClosing?.status === 'disputed') {
    redirect(`/manager/edit/${existingClosing.id}`)
  }
  if (existingClosing && ['submitted', 'verified'].includes(existingClosing.status)) {
    const petty = (existingClosing as any).petty_counts as { verified_at?: string } | null | undefined
    const pettyDone = !!petty?.verified_at
    if (pettyDone) redirect(`/manager/summary?date=${encodeURIComponent(today)}`)
  }

  const { prevDayReserves, preReservedExpenseHints } = buildReserveHistoryContext(prevReserveClosings ?? [])

  const orderMap = new Map<string, number>(itemOrder.map((name, i) => [name, i] as const))
  const newItems = mappingBasedItems.length > 0 ? [] : await getStoreItemsResolved(storeId)

  // 優先用 item_column_mappings（跟 xlsx 匯出同源，確保收據下拉品項跟 xlsx 一致）
  // 若 mapping 空才 fallback 舊資料源
  const mappingColumns = mappingBasedItems.length > 0
    ? toMappingColumns(mappingBasedItems)
    : newItems.length > 0
    ? toMappingColumns(newItems)
    : (mappingRows ?? []).map((r: { item_name: string; item_category: string; vendor_group: string | null; excel_column: string; doc_type_override: string | null }) => ({
        name: r.item_name,
        category: r.item_category,
        vendor_group: r.vendor_group ?? undefined,
        excel_column: r.excel_column,
        doc_type: r.doc_type_override,
      })).sort((a, b) => (orderMap.get(a.name) ?? 9999) - (orderMap.get(b.name) ?? 9999))

  // 「品項對應管理」是店面單據廠商分類的 source of truth。
  // receipt_vendors 是舊設定表，若總公司改了 vendor_group（例如油豆腐 → 豆腐商），
  // 只讀舊表會讓店面下拉仍顯示舊名稱。保留其他收據類別，但讓「廠商」清單
  // 每次開頁都直接反映該店目前的 mappings。
  // 這些是結帳流程的系統類別，不是廠商設定；不可混入「廠商」下拉選單。
  const systemReceiptGroupNames = new Set(['未分類', '央廚配送', '日常用品', '買東西或維修', '其他', '退稅'])
  const mappingVendorGroups = Array.from(new Set(
    mappingColumns
      .map(item => item.vendor_group?.trim())
      .filter((name): name is string => !!name && !systemReceiptGroupNames.has(name)),
  ))
  const syncedReceiptCategories = receiptCategories.map(category => category.name !== '廠商' || mappingVendorGroups.length === 0
    ? category
    : {
        ...category,
        vendors: mappingVendorGroups.map((name, index) => ({ id: `mapping-vendor-${index}`, name })),
      })

  return (
    <ClosingForm
      key={`${storeId}-${today}-${existingClosing?.id ?? 'new'}-${existingClosing?.status ?? 'draft'}-${existingClosing?.disputed_at ?? 'none'}`}
      store={store as Store}
      ckPrices={(ckPrices ?? []) as CKPrice[]}
      existingClosing={existingClosing}
      userId={user.id}
      today={today}
      todayReceipts={todayReceipts ?? []}
      receiptCategories={syncedReceiptCategories}
      mappingColumns={mappingColumns}
      actualVendors={actualVendors ?? []}
      prevDayReserves={prevDayReserves}
      preReservedExpenseHints={preReservedExpenseHints}
      isBackfill={isBackfill}
      realToday={realToday}
      calendarToday={calendarToday}
      isEarlyMorningBusinessDate={isEarlyMorningBusinessDate}
      latestBackfillDraftDate={!requested ? (latestBackfillDraft?.business_date as string | undefined) : undefined}
    />
  )
}
