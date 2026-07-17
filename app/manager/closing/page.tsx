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
  const reserveExpenseHints = new Map<string, {
    reason: string
    amount: number
    total_bill?: number
  }>()
  const normalizeReserveText = (value: unknown) => String(value ?? '').replace(/[\s　]+/g, '').toLowerCase()
  const paidReserveKeys = new Set<string>()
  const historicalExpenses = ((prevReserveClosings ?? []) as any[]).flatMap(closing => {
    const expenses = Array.isArray(closing.expense_items) ? closing.expense_items : []
    return expenses.map((expense: any) => ({
      ...expense,
      business_date: closing.business_date as string,
    }))
  })
  for (const closing of (prevReserveClosings ?? []) as any[]) {
    const reserveItems = Array.isArray(closing.reserve_items) ? closing.reserve_items : []
    for (const item of reserveItems) {
      const reason = typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : '其他'
      const totalBill = Number(item.total_bill ?? 0)
      const reserveAmount = Math.max(0, Number(item.amount ?? 0))
      if (reserveAmount <= 0) continue
      const reasonText = normalizeReserveText(reason)
      const paid = historicalExpenses.some((expense: any) => {
        // 預留與實際付款通常不會發生在同一天。只要在開始預留後的
        // 歷史帳目中出現對應支出，就應視為已結清。
        if (expense.business_date < closing.business_date) return false
        const expenseAmount = Math.abs(Number(expense?.amount ?? 0))
        if (expenseAmount <= 0) return false
        const description = normalizeReserveText(expense?.description)
        const reasonMatches = reasonText !== '其他' && description.length > 0 && (
          description.includes(reasonText) || reasonText.includes(description)
        )
        const amountMatches = totalBill > 0
          ? expenseAmount >= totalBill - 1
          : expenseAmount >= reserveAmount - 1
        // 有帳單總額時，完整支出金額本身就足以辨識這筆預留款；
        // 沒有帳單總額則要求支出說明與預留原因相符，避免誤判其他支出。
        return amountMatches && (reasonMatches || (totalBill > 0 && expenseAmount >= totalBill - 1))
      })
      if (paid) paidReserveKeys.add(`${normalizeReserveText(reason)}||${totalBill}`)
    }
  }
  // 查詢結果是日期倒序；預留款的「續存」要按日期正序判斷，
  // 才能把後一天未重填帳單總額的補足金額接回前一天的同一筆帳單。
  // 例如：7/12 房租 48,433（帳單 77,000），7/13 補 28,567（舊資料沒有 total_bill）。
  const reserveHistory = [...(prevReserveClosings ?? [])].reverse()
  for (const closing of reserveHistory) {
    const date = closing.business_date as string
    const items = Array.isArray(closing.reserve_items) ? closing.reserve_items as any[] : []
    for (const item of items) {
      const reason = typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : '其他'
      const totalBill = Number(item.total_bill ?? 0)
      const amount = Math.max(0, Number(item.amount ?? 0))
      const reserveKey = `${normalizeReserveText(reason)}||${totalBill}`
      const alreadyPaid = paidReserveKeys.has(reserveKey)
      if (amount > 0) {
        if (!alreadyPaid) {
          const hint = reserveExpenseHints.get(reason)
          if (hint) {
            hint.amount += amount
            if (totalBill > 0) hint.total_bill = Math.max(hint.total_bill ?? 0, totalBill)
          } else {
            reserveExpenseHints.set(reason, { reason, amount, ...(totalBill > 0 ? { total_bill: totalBill } : {}) })
          }
        }
      }
      if (totalBill <= 0) {
        // 舊版／手動續存資料可能沒有帶 total_bill。若同原因最近仍有
        // 尚未結清的帳單，視為該帳單的續存，而不是另一筆獨立預留。
        // 這可避免已累計達到帳單總額後，隔天又被自動要求同一筆差額。
        const continuation = Array.from(reserveGroups.values())
          .filter(group => group.reason === reason && group.amount < group.total_bill)
          .sort((a, b) => b.last_date.localeCompare(a.last_date))[0]
        if (continuation) {
          continuation.amount += amount
          if (date > continuation.last_date) continuation.last_date = date
        }
        continue
      }
      const key = `${reason}||${totalBill}`
      const existing = reserveGroups.get(key)
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
    .filter(item => item.total_bill > item.amount && !paidReserveKeys.has(`${normalizeReserveText(item.reason)}||${item.total_bill}`))
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

  // 「品項對應管理」是店面單據廠商分類的 source of truth。
  // receipt_vendors 是舊設定表，若總公司改了 vendor_group（例如油豆腐 → 豆腐商），
  // 只讀舊表會讓店面下拉仍顯示舊名稱。保留其他收據類別，但讓「廠商」清單
  // 每次開頁都直接反映該店目前的 mappings。
  const mappingVendorGroups = Array.from(new Set(
    mappingColumns
      .map(item => item.vendor_group?.trim())
      .filter((name): name is string => !!name && !['未分類', '央廚配送'].includes(name)),
  ))
  const syncedReceiptCategories = receiptCategories.map(category => category.name !== '廠商' || mappingVendorGroups.length === 0
    ? category
    : {
        ...category,
        vendors: mappingVendorGroups.map((name, index) => ({ id: `mapping-vendor-${index}`, name })),
      })

  return (
    <ClosingForm
      key={`${storeId}-${today}`}
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
      preReservedExpenseHints={Array.from(reserveExpenseHints.values())}
      isBackfill={isBackfill}
      realToday={realToday}
      calendarToday={calendarToday}
      isEarlyMorningBusinessDate={isEarlyMorningBusinessDate}
      latestBackfillDraftDate={!requested ? (latestBackfillDraft?.business_date as string | undefined) : undefined}
    />
  )
}
