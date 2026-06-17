import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ClosingForm from '@/components/manager/closing-form'
import { Store, CKPrice } from '@/lib/types'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import { getReceiptSettings } from '@/app/actions/receipt-settings'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'


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

  // 已送出/已審核的帳目：若是今日帳目 → 轉去 /manager/closing 走零用金核對流程
  // （/manager/closing 已能處理 submitted/verified 並顯示零用金步驟）
  if (!['draft', 'disputed'].includes(closing.status)) {
    const today = getBusinessDate()
    if (closing.business_date === today) {
      redirect('/manager/closing')
    }
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

  const admin2 = createAdminClient()
  const [{ data: todayReceipts }, receiptCategories, { data: mappingRows }, itemOrderText] = await Promise.all([
    supabase
      .from('receipts')
      .select('id, vendor_name, total_amount, tax_amount, receipt_type, photo_url, notes, receipt_items(item_name, unit, quantity, unit_price, amount)')
      .eq('store_id', storeId)
      .eq('business_date', closing.business_date)
      .order('created_at'),
    getReceiptSettings(storeId),
    admin2.from('item_column_mappings').select('item_name, item_category, vendor_group, excel_column').eq('store_id', storeId),
    admin2.storage.from('excel-templates').download(`${storeId}-item-order.json`)
      .then(async ({ data }) => (data ? data.text() : null))
      .catch((): null => null),
  ])

  let itemOrder: string[] = []
  try { if (itemOrderText) itemOrder = JSON.parse(itemOrderText) } catch {}
  const orderMap = new Map<string, number>(itemOrder.map((name, i) => [name, i] as const))

  // 不過濾：item-order.json 只用於排序，沒在裡面的品項排到最後。
  const mappingColumns = (mappingRows ?? []).map((r: any) => ({
    name: r.item_name,
    category: r.item_category,
    vendor_group: r.vendor_group ?? undefined,
    excel_column: r.excel_column,
  }))
    .sort((a, b) => (orderMap.get(a.name) ?? 9999) - (orderMap.get(b.name) ?? 9999))

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
        receiptCategories={receiptCategories}
        mappingColumns={mappingColumns}
      />
    </>
  )
}
