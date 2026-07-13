import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { sortStores } from '@/lib/store-order'
import AccountingClient from '@/components/hq/accounting-client'
import { resolveHQStoreId } from '@/lib/hq-store-selection'
import { canReviewClosings } from '@/lib/user-permissions'

export const dynamic = 'force-dynamic'

function getTaipeiDate() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

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
  const today = getTaipeiDate()
  const date = params.date ?? today
  const initialStoreId = await resolveHQStoreId(stores, params.storeId)
  const initialCkStoreId = await resolveHQStoreId(ckStores, params.ckStoreId)

  // 撈當日所有店家 closings 狀態 + 央廚 records 狀態
  const [{ data: closings }, { data: ckRecords }, { data: holidays }] = await Promise.all([
    admin.from('daily_closings')
      .select(`
        id, store_id, business_date, status, note, dispute_note, submitted_by, updated_at,
        total_revenue, total_cost, total_expenses, expected_remit,
        actual_remit, should_include_delivery, variance
      `)
      .eq('business_date', date),
    admin.from('ck_daily_records')
      .select('ck_store_id, status, hq_paid, ck_reimbursement_confirmed, updated_at')
      .eq('business_date', date),
    admin.from('store_holidays').select('store_id').eq('holiday_date', date),
  ])

  const holidayIds = new Set((holidays ?? []).map((h: any) => h.store_id as string))

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
    />
  )
}
