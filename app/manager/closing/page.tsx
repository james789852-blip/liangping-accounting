import { createClient } from '@/lib/supabase/server'
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
    supabase
      .from('daily_closings')
      .select('reserve_items, business_date')
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
    const admin = createAdminClient()
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

  const reserveGroups = new Map<string, {
    reason: string
    total_bill: number
    amount: number
    started_date: string
    last_date: string
  }>()
  for (const closing of prevReserveClosings ?? []) {
    const date = closing.business_date as string
    const items = Array.isArray(closing.reserve_items) ? closing.reserve_items as any[] : []
    for (const item of items) {
      const reason = typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : '其他'
      const totalBill = Number(item.total_bill ?? 0)
      if (totalBill <= 0) continue
      const key = `${reason}||${totalBill}`
      const existing = reserveGroups.get(key)
      const amount = Math.max(0, Number(item.amount ?? 0))
      if (existing) {
        existing.amount += amount
        if (date < existing.started_date) existing.started_date = date
        if (date > existing.last_date) existing.last_date = date
      } else {
        reserveGroups.set(key, { reason, total_bill: totalBill, amount, started_date: date, last_date: date })
      }
    }
  }
  const pendingReserves = Array.from(reserveGroups.values())
    .filter(item => item.total_bill > item.amount)
    .sort((a, b) => b.last_date.localeCompare(a.last_date))
  const prevDayReserves = pendingReserves.length > 0
    ? {
        business_date: pendingReserves[0].last_date,
        items: pendingReserves.map(item => ({
          reason: item.reason,
          amount: item.amount,
          total_bill: item.total_bill,
          started_date: item.started_date,
          remaining_amount: item.total_bill - item.amount,
        })),
      }
    : null

  const orderMap = new Map<string, number>(itemOrder.map((name, i) => [name, i] as const))
  const newItems = mappingBasedItems.length > 0 ? [] : await getStoreItemsResolved(storeId)

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
      key={`${storeId}-${today}`}
      store={store as Store}
      ckPrices={(ckPrices ?? []) as CKPrice[]}
      existingClosing={existingClosing}
      userId={user.id}
      today={today}
      todayReceipts={todayReceipts ?? []}
      receiptCategories={receiptCategories}
      mappingColumns={mappingColumns}
      actualVendors={actualVendors ?? []}
      prevDayReserves={prevDayReserves}
      isBackfill={isBackfill}
      realToday={realToday}
      calendarToday={calendarToday}
      isEarlyMorningBusinessDate={isEarlyMorningBusinessDate}
      latestBackfillDraftDate={!requested ? (latestBackfillDraft?.business_date as string | undefined) : undefined}
    />
  )
}
