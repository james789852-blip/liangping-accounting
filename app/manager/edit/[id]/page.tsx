import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ClosingForm from '@/components/manager/closing-form'
import { Store, CKPrice } from '@/lib/types'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import { getReceiptSettings } from '@/app/actions/receipt-settings'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getStoreItemsResolved, toMappingColumns } from '@/lib/store-items-resolver'
import { getStoreItemsFromMappings } from '@/lib/mapping-based-items'

export const dynamic = 'force-dynamic'

export default async function EditClosingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('user_id, name, role, store_ids, is_hq, primary_store_id').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) return <div className="p-6 text-red-500">您尚未被指派到任何店家</div>

  const admin1 = createAdminClient()
  // 用 admin 撈避開 RLS 限制導致 cash_counts join 撈不到
  const { data: closing } = await admin1
    .from('daily_closings')
    .select('*, revenue_items(*), order_items(*), expense_items(*), handwrite_orders(*), cash_counts(*)')
    .eq('id', id)
    .eq('store_id', storeId)
    .single()

  if (!closing) {
    // HQ user 多半是從書籤/瀏覽器歷史殘留進到別家店的帳目連結 → 導回總公司儀表板
    const isHQ = !!profile?.is_hq || profile?.role === '老闆'
    if (isHQ) redirect('/hq/dashboard')
    return <div className="p-6 text-slate-500">找不到此帳目或無權限</div>
  }

  const { data: cashCounts } = await admin1
    .from('cash_counts')
    .select('*')
    .eq('closing_id', closing.id)
  ;(closing as any).cash_counts = cashCounts ?? closing.cash_counts ?? []

  // 已送出/已審核的帳目：一律導回 /manager/closing（含零用金步驟）
  // 過往日期加 ?date 參數，讓 closing form 正確載入該日帳目
  if (!['draft', 'disputed'].includes(closing.status)) {
    const today = getBusinessDate()
    redirect(closing.business_date !== today ? `/manager/closing?date=${closing.business_date}` : '/manager/closing')
  }

  const admin2 = createAdminClient()
  const reserveLookbackDate = new Date(new Date(`${closing.business_date}T00:00:00+08:00`).getTime() - 45 * 86400000).toISOString().slice(0, 10)
  // 全部平行撈，省 3 個 round trip
  const [
    { data: store },
    { data: ckPrices },
    { data: todayReceipts },
    receiptCategories,
    { data: mappingRows },
    itemOrderText,
    mappingBasedItems,
    { data: actualVendors },
    { data: prevReserveClosings },
  ] = await Promise.all([
    supabase.from('stores').select('*').eq('id', storeId).single(),
    supabase
      .from('central_kitchen_prices')
      .select('id, item_name, unit_price, unit, excel_column')
      .eq('active', true)
      .order('sort_order').order('item_name'),
    supabase
      .from('receipts')
      .select('id, vendor_name, actual_vendor_name, total_amount, tax_amount, receipt_type, photo_url, notes, receipt_items(item_name, unit, quantity, unit_price, amount)')
      .eq('store_id', storeId)
      .eq('business_date', closing.business_date)
      .order('created_at'),
    getReceiptSettings(storeId),
    admin2.from('item_column_mappings').select('item_name, item_category, vendor_group, excel_column').eq('store_id', storeId),
    admin2.storage.from('excel-templates').download(`${storeId}-item-order.json`)
      .then(async ({ data }) => (data ? data.text() : null))
      .catch((): null => null),
    getStoreItemsFromMappings(storeId),
    supabase
      .from('store_actual_vendors')
      .select('id, vendor_group, name')
      .eq('store_id', storeId)
      .eq('active', true)
      .order('vendor_group')
      .order('sort_order')
      .order('name'),
    admin2
      .from('daily_closings')
      .select('reserve_items, business_date')
      .eq('store_id', storeId)
      .gte('business_date', reserveLookbackDate)
      .lt('business_date', closing.business_date)
      .in('status', ['submitted', 'verified'])
      .order('business_date', { ascending: false })
      .limit(45),
  ])

  // 補做／退回修改頁面也要沿用一般結帳頁的歷史預留款比對，
  // 否則大額支出會再次被當成今日現金扣除。
  const reserveExpenseHints = new Map<string, { reason: string; amount: number; total_bill?: number }>()
  for (const previous of prevReserveClosings ?? []) {
    const items = Array.isArray(previous.reserve_items) ? previous.reserve_items as any[] : []
    for (const item of items) {
      const reason = typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : '其他'
      const amount = Math.max(0, Number(item.amount ?? 0))
      if (amount <= 0) continue
      const totalBill = Number(item.total_bill ?? 0)
      const hint = reserveExpenseHints.get(reason)
      if (hint) {
        hint.amount += amount
        if (totalBill > 0) hint.total_bill = Math.max(hint.total_bill ?? 0, totalBill)
      } else {
        reserveExpenseHints.set(reason, { reason, amount, ...(totalBill > 0 ? { total_bill: totalBill } : {}) })
      }
    }
  }

  let itemOrder: string[] = []
  try { if (itemOrderText) itemOrder = JSON.parse(itemOrderText) } catch {}
  const orderMap = new Map<string, number>(itemOrder.map((name, i) => [name, i] as const))

  const newItems = mappingBasedItems.length > 0 ? [] : await getStoreItemsResolved(storeId)

  // 優先用 mapping-based（跟 xlsx 匯出同源）→ newItems → 舊 mapping
  const mappingColumns = mappingBasedItems.length > 0
    ? toMappingColumns(mappingBasedItems)
    : newItems.length > 0
    ? toMappingColumns(newItems)
    : (mappingRows ?? []).map((r: any) => ({
        name: r.item_name,
        category: r.item_category,
        vendor_group: r.vendor_group ?? undefined,
        excel_column: r.excel_column,
      })).sort((a, b) => (orderMap.get(a.name) ?? 9999) - (orderMap.get(b.name) ?? 9999))

  // 退回修改頁也必須和一般結帳頁相同：廠商下拉以該店最新的
  // item_column_mappings 為準，不能繼續顯示 receipt_vendors 的舊分類。
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
    <>
      <div className="bg-white px-6 py-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
        <Link href={`/manager/history/${id}`} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: '#a1a1aa' }}>
          <ArrowLeft className="h-3.5 w-3.5" />返回歷史紀錄
        </Link>
      </div>
      <ClosingForm
        store={store as Store}
        ckPrices={(ckPrices ?? []) as CKPrice[]}
        existingClosing={closing}
        userId={user.id}
        today={closing.business_date}
        todayReceipts={todayReceipts ?? []}
        receiptCategories={syncedReceiptCategories}
        mappingColumns={mappingColumns}
        actualVendors={actualVendors ?? []}
        preReservedExpenseHints={Array.from(reserveExpenseHints.values())}
        isBackfill={closing.business_date !== getBusinessDate()}
        realToday={getBusinessDate()}
      />
    </>
  )
}
