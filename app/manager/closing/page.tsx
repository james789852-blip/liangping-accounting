import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ClosingForm from '@/components/manager/closing-form'
import { Store, CKPrice } from '@/lib/types'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import { getReceiptSettings } from '@/app/actions/receipt-settings'
import { getCachedUserProfile, getCachedStoreFull, getCachedActiveCKPrices } from '@/lib/cached-queries'
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
    { data: prevReserveClosings },
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
      .select('id, vendor_name, actual_vendor_name, total_amount, tax_amount, receipt_type, photo_url, notes, updated_at, receipt_items(item_name, unit, quantity, unit_price, amount, item_mapping_id, vendor_group_snapshot)')
      .eq('store_id', storeId)
      .eq('business_date', today)
      .order('created_at'),
    getReceiptSettings(storeId),
    admin
      .from('daily_closings')
      .select('reserve_items, business_date, expense_items(description, amount)')
      .eq('store_id', storeId)
      .gte('business_date', reserveLookbackDate)
      .lt('business_date', today)
      .in('status', ['submitted', 'verified'])
      .order('business_date', { ascending: false })
      .limit(45),
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

  let lastEditorName: string | null = null
  if (existingClosing?.manager_id) {
    if (existingClosing.manager_id === user.id) {
      lastEditorName = profile?.name ?? user.email ?? null
    } else {
      const { data: editorProfile } = await admin
        .from('user_profiles')
        .select('name')
        .eq('user_id', existingClosing.manager_id)
        .maybeSingle()
      lastEditorName = editorProfile?.name ?? null
    }
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

  const newItems = mappingBasedItems.length > 0 ? [] : await getStoreItemsResolved(storeId)

  // 優先用 item_column_mappings（跟 xlsx 匯出同源，確保收據下拉品項跟 xlsx 一致）
  // 若 mapping 空才 fallback 舊資料源
  const mappingColumns = mappingBasedItems.length > 0
    ? toMappingColumns(mappingBasedItems)
    : toMappingColumns(newItems)

  // getReceiptSettings 已依「獨立類別」與「廠商子類別」完成同步分類，
  // 這裡不可再用舊規則覆寫，否則貨車保養等獨立類別會被誤塞進廠商。
  const syncedReceiptCategories = receiptCategories

  return (
    <ClosingForm
      key={`${storeId}-${today}-${existingClosing?.id ?? 'new'}-${existingClosing?.status ?? 'draft'}-${existingClosing?.disputed_at ?? 'none'}`}
      store={store as Store}
      ckPrices={(ckPrices ?? []) as CKPrice[]}
      existingClosing={existingClosing}
      userId={user.id}
      userName={profile?.name ?? user.email ?? '登入使用者'}
      initialLastEditorName={lastEditorName}
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
