import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedUserProfile } from '@/lib/cached-queries'
import { redirect } from 'next/navigation'
import { sortStores } from '@/lib/store-order'
import AccountingClient from '@/components/hq/accounting-client'
import { resolveHQStoreId } from '@/lib/hq-store-selection'
import { canReviewClosings } from '@/lib/user-permissions'
import { getBusinessDate } from '@/lib/business-date'
import { fetchDailyClosingWithReceipts } from '@/app/actions/store-overview'
import { loadCKDailyDetails } from '@/lib/ck-daily-detail'

export const dynamic = 'force-dynamic'

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; ckStoreId?: string; date?: string; tab?: string }>
}) {
  const user = await getAuthedUser()
  if (!user) redirect('/login')
  const profile = await getCachedUserProfile(user.id)
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

  // 店面只預載目前選中的完整明細；央廚數量少，則一次批次預載當日三間完整明細，
  // 讓總公司在央廚卡片間切換時只切換記憶體資料，不再等待第二次 Server Action。
  const [{ data: closings }, { data: holidays }, initialStoreDetail, initialCkDetailByStore] = await Promise.all([
    admin.from('daily_closings')
      .select('id, store_id, business_date, status, dispute_note, total_revenue, total_cost, total_expenses, expected_remit, actual_remit, should_include_delivery, variance, remittance_adjustments, reserve_items, cash_counts(large_expenses)')
      .eq('business_date', date),
    admin.from('store_holidays').select('store_id').eq('holiday_date', date),
    initialStoreId
      ? fetchDailyClosingWithReceipts(initialStoreId, date)
      : Promise.resolve({ success: true as const, closing: null, receipts: [], submitterName: null }),
    loadCKDailyDetails(ckStores.map(store => store.id), date),
  ])

  const ckRecords = ckStores.flatMap(store => {
    const detail = initialCkDetailByStore[store.id]
    return detail ? [{
      ck_store_id: store.id,
      status: detail.status,
      hq_paid: detail.hqPaid,
      ck_reimbursement_confirmed: detail.ckReimbursementConfirmed,
    }] : []
  })

  const holidayIds = new Set((holidays ?? []).map((h: any) => h.store_id as string))
  const initialDetailByStore: Record<string, { closing: any; receipts: any[] }> = {}
  if (initialStoreId && 'success' in initialStoreDetail) {
    initialDetailByStore[initialStoreId] = {
      closing: initialStoreDetail.closing
        ? { ...initialStoreDetail.closing, submitter_name: initialStoreDetail.submitterName }
        : null,
      receipts: initialStoreDetail.receipts ?? [],
    }
  }

  return (
    <AccountingClient
      key={date}
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
      initialCkDetailByStore={initialCkDetailByStore}
    />
  )
}
