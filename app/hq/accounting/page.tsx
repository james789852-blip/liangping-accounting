import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { sortStores } from '@/lib/store-order'
import AccountingClient from '@/components/hq/accounting-client'
import { resolveHQStoreId } from '@/lib/hq-store-selection'
import { canReviewClosings } from '@/lib/user-permissions'
import { getBusinessDate } from '@/lib/business-date'

export const dynamic = 'force-dynamic'

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; ckStoreId?: string; date?: string; tab?: string }>
}) {
  const user = await getAuthedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canReviewClosings(profile)) redirect('/manager/dashboard')

  const admin = createAdminClient()
  const [{ data: storesRaw }, { data: ckStoresRaw }] = await Promise.all([
    admin.from('stores').select('id, name').eq('active', true).neq('type', '央廚'),
    admin.from('stores').select('id, name').eq('active', true).eq('type', '央廚'),
  ])
  const stores = sortStores(storesRaw ?? [])
  const ckStores = (ckStoresRaw ?? []).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))

  const params = await searchParams
  // 帳目中心與店家結帳共用營業日：台灣時間 05:00 才切換到隔天。
  // 總公司凌晨做帳時，預設仍停留在前一天的營業日；指定日期仍可手動查看歷史帳目。
  const today = getBusinessDate()
  const date = params.date ?? today
  const initialStoreId = await resolveHQStoreId(stores, params.storeId)
  const initialCkStoreId = await resolveHQStoreId(ckStores, params.ckStoreId)

  // 一次準備狀態卡與當日審核資料。切換店家時直接使用這份資料，避免每次點擊才重新查詢。
  const [{ data: closings }, { data: ckRecords }, { data: holidays }, { data: receipts }] = await Promise.all([
    admin.from('daily_closings')
      .select(`
        id, store_id, business_date, status, note, dispute_note, submitted_by, updated_at,
        total_revenue, total_cost, total_expenses, expected_remit,
        actual_remit, should_include_delivery, variance, remittance_adjustments,
        ck_delivery_photo_url, channel_photo_urls,
        envelope_photo_url, void_invoice_photo_urls, note_photo_url, extra_photo_urls,
        stores(id, name),
        revenue_items(channel, account_name, gross_amount),
        order_items(item_name, quantity, unit_price, total_amount),
        handwrite_orders(order_number, amount, voided, void_reason),
        expense_items(description, amount)
      `)
      .eq('business_date', date),
    admin.from('ck_daily_records')
      .select('ck_store_id, status, hq_paid, ck_reimbursement_confirmed, updated_at')
      .eq('business_date', date),
    admin.from('store_holidays').select('store_id').eq('holiday_date', date),
    admin.from('receipts')
      .select('id, store_id, business_date, vendor_name, receipt_type, total_amount, photo_url, receipt_items(item_name, quantity, unit, unit_price, amount), created_at')
      .eq('business_date', date)
      .order('created_at'),
  ])

  const holidayIds = new Set((holidays ?? []).map((h: any) => h.store_id as string))
  const receiptsByStore: Record<string, any[]> = {}
  for (const receipt of (receipts ?? []) as any[]) {
    if (!receiptsByStore[receipt.store_id]) receiptsByStore[receipt.store_id] = []
    receiptsByStore[receipt.store_id].push(receipt)
  }
  const initialDetailByStore = Object.fromEntries(
    (closings ?? []).map((closing: any) => [closing.store_id, {
      closing,
      receipts: receiptsByStore[closing.store_id] ?? [],
    }]),
  )

  return (
    <AccountingClient
      stores={stores}
      ckStores={ckStores}
      date={date}
      initialStoreId={initialStoreId}
      initialCkStoreId={initialCkStoreId}
      initialTab={(params.tab as 'store' | 'ck') ?? 'store'}
      closings={(closings ?? []) as any[]}
      ckRecords={(ckRecords ?? []) as any[]}
      holidayStoreIds={[...holidayIds]}
      initialDetailByStore={initialDetailByStore}
    />
  )
}
