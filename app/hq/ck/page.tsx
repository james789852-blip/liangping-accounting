import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getBusinessDate } from '@/lib/business-date'
import CKOverview from '@/components/hq/ck-overview'

export const dynamic = 'force-dynamic'

function prevDay(date: string) {
  const d = new Date(date + 'T00:00:00+08:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function nextDay(date: string) {
  const d = new Date(date + 'T00:00:00+08:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default async function HQCKPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') redirect('/manager/dashboard')

  const admin = createAdminClient()
  const today = getBusinessDate()
  const params = await searchParams
  const date = params.date ?? today

  // 所有央廚店家
  const { data: ckStores } = await admin
    .from('stores')
    .select('id, name, assigned_store_ids')
    .eq('active', true)
    .eq('type', '央廚')
    .order('name')

  if (!ckStores?.length) {
    return (
      <div className="min-h-full" style={{ background: '#fafafa' }}>
        <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5' }}>
          <div className="max-w-2xl mx-auto">
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: '#a1a1aa' }}>央廚帳目</p>
            <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>央廚帳目總覽</h1>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-sm" style={{ color: '#a1a1aa' }}>尚未設定任何央廚店家，請至「店家管理」設定店家類型</p>
        </div>
      </div>
    )
  }

  const ckStoreIds = ckStores.map(s => s.id)
  const allAssignedIds = ckStores.flatMap(s => (s.assigned_store_ids as string[] | null) ?? [])
  const uniqueAssignedIds = [...new Set(allAssignedIds)]

  const [
    { data: ckRecords },
    { data: assignedStores },
    { data: externalStores },
    { data: validClosings },
  ] = await Promise.all([
    admin.from('ck_daily_records')
      .select('id, ck_store_id, status, payer_name, note, hq_paid, hq_paid_at, receipt_photo_urls')
      .in('ck_store_id', ckStoreIds)
      .eq('business_date', date),
    uniqueAssignedIds.length > 0
      ? admin.from('stores').select('id, name').in('id', uniqueAssignedIds)
      : Promise.resolve({ data: [] }),
    admin.from('ck_external_stores').select('id, ck_store_id, name').in('ck_store_id', ckStoreIds),
    uniqueAssignedIds.length > 0
      ? admin.from('daily_closings').select('store_id').in('store_id', uniqueAssignedIds).eq('business_date', date)
      : Promise.resolve({ data: [] }),
  ])
  const validClosingStores = new Set((validClosings ?? []).map((c: any) => c.store_id as string))

  const recordIds = (ckRecords ?? []).map(r => r.id)

  const [
    { data: storeOrders },
    { data: expenseItems },
  ] = await Promise.all([
    recordIds.length > 0
      ? admin.from('ck_store_orders').select('ck_daily_record_id, store_id, external_store_name, amount').in('ck_daily_record_id', recordIds)
      : Promise.resolve({ data: [] }),
    recordIds.length > 0
      ? admin.from('ck_expense_items').select('ck_daily_record_id, category, item_name, amount, payer_name').in('ck_daily_record_id', recordIds).order('sort_order')
      : Promise.resolve({ data: [] }),
  ])

  const assignedStoreMap = Object.fromEntries((assignedStores ?? []).map((s: any) => [s.id, s.name as string]))

  const ckData = ckStores.map(ckStore => {
    const record = (ckRecords ?? []).find(r => r.ck_store_id === ckStore.id) ?? null
    const assignedIds: string[] = (ckStore.assigned_store_ids as string[] | null) ?? []
    const extStores = (externalStores ?? []).filter((s: any) => s.ck_store_id === ckStore.id)

    let memberOrders: { store_id: string; store_name: string; amount: number }[] = []
    let externalOrders: { name: string; amount: number }[] = []
    let expenses: { category: string; item_name: string; amount: number; payer_name?: string }[] = []

    if (record) {
      const orders = (storeOrders ?? []).filter((o: any) => o.ck_daily_record_id === record.id)
      memberOrders = orders
        .filter((o: any) => o.store_id !== null)
        .filter((o: any) => validClosingStores.has(o.store_id as string))
        .map((o: any) => ({ store_id: o.store_id, store_name: assignedStoreMap[o.store_id] ?? o.store_id, amount: o.amount }))
      externalOrders = orders
        .filter((o: any) => o.store_id === null)
        .map((o: any) => ({ name: o.external_store_name, amount: o.amount }))
      expenses = (expenseItems ?? [])
        .filter((e: any) => e.ck_daily_record_id === record.id)
        .map((e: any) => ({ category: e.category, item_name: e.item_name, amount: e.amount, payer_name: e.payer_name ?? undefined }))
    }

    const memberTotalFromOrders = memberOrders.reduce((s, o) => s + o.amount, 0)
    const extTotal = externalOrders.reduce((s, o) => s + o.amount, 0)
    const revenueTotal = memberTotalFromOrders + extTotal
    const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)

    const allMemberStores = assignedIds.map(id => {
      const existing = memberOrders.find(o => o.store_id === id)
      return { store_id: id, store_name: assignedStoreMap[id] ?? id, amount: existing?.amount ?? 0 }
    })

    return {
      ckStore: { id: ckStore.id, name: ckStore.name },
      status: record?.status ?? 'none',
      payerName: record?.payer_name ?? null,
      note: record?.note ?? null,
      hqPaid: (record as any)?.hq_paid ?? false,
      hqPaidAt: (record as any)?.hq_paid_at ?? null,
      revenueTotal,
      expenseTotal,
      balance: revenueTotal - expenseTotal,
      memberStores: allMemberStores,
      externalOrders,
      externalStores: extStores.map((s: any) => ({ id: s.id, name: s.name })),
      expenses,
      receiptPhotoUrls: ((record as any)?.receipt_photo_urls as string[] | null) ?? [],
    }
  })

  const isToday = date === today

  // 全公司過去 7 天對帳異常（跨所有央廚）
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10)
  const [{ data: weekMismatchRows }, { data: weekValidClosings }] = await Promise.all([
    admin
      .from('ck_store_orders')
      .select('amount, ck_confirmed_amount, store_id, ck_daily_records!inner(business_date, ck_store_id)')
      .not('ck_confirmed_amount', 'is', null)
      .gte('ck_daily_records.business_date', sevenDaysAgoStr)
      .in('ck_daily_records.ck_store_id', ckStoreIds),
    uniqueAssignedIds.length > 0
      ? admin.from('daily_closings')
          .select('store_id, business_date')
          .in('store_id', uniqueAssignedIds)
          .gte('business_date', sevenDaysAgoStr)
          .lte('business_date', date)
      : Promise.resolve({ data: [] }),
  ])
  const weekValidClosingKeys = new Set(
    (weekValidClosings ?? []).map((c: any) => `${c.business_date}||${c.store_id}`)
  )
  const ckNameMap = Object.fromEntries(ckStores.map(s => [s.id, s.name]))
  const weekMismatches = (weekMismatchRows ?? [])
    .filter((o: any) => weekValidClosingKeys.has(`${(o.ck_daily_records as any)?.business_date}||${o.store_id}`))
    .filter((o: any) => Number(o.ck_confirmed_amount) !== Number(o.amount))
    .map((o: any) => ({
      business_date: (o.ck_daily_records as any)?.business_date as string,
      ck_store_name: ckNameMap[(o.ck_daily_records as any)?.ck_store_id as string] ?? '',
      store_name: assignedStoreMap[o.store_id as string] ?? '',
      amount: Number(o.amount),
      ck_confirmed_amount: Number(o.ck_confirmed_amount),
    }))
    .sort((a, b) => b.business_date.localeCompare(a.business_date))

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-4 sm:px-6 py-4 sm:py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-3xl mx-auto space-y-3 sm:space-y-0 sm:flex sm:items-start sm:justify-between sm:gap-4">
          <div>
            <p className="text-xs font-semibold uppercase mb-0.5" style={{ color: '#a1a1aa' }}>央廚帳目</p>
            <h1 className="text-lg sm:text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>央廚帳目總覽</h1>
            <p className="text-sm" style={{ color: '#a1a1aa' }}>{ckStores.length} 間央廚</p>
          </div>
          {/* 日期導覽 */}
          <div className="flex items-center gap-2">
            <a href={`/hq/ck?date=${prevDay(date)}`}
              className="flex items-center justify-center h-8 w-8 rounded-xl text-sm font-semibold transition-colors hover:bg-slate-50"
              style={{ border: '1px solid #e4e4e7', color: '#52525b' }}>‹</a>
            <span className="text-sm font-semibold tabular-nums px-1" style={{ color: '#18181b', minWidth: '86px', textAlign: 'center' }}>{date}</span>
            <a href={`/hq/ck?date=${nextDay(date)}`}
              className={`flex items-center justify-center h-8 w-8 rounded-xl text-sm font-semibold transition-colors ${isToday ? 'opacity-30 pointer-events-none' : 'hover:bg-slate-50'}`}
              style={{ border: '1px solid #e4e4e7', color: '#52525b' }}>›</a>
            {!isToday && (
              <a href="/hq/ck"
                className="text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-colors hover:opacity-80"
                style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                今日
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 pb-28 space-y-4">
        {/* 全公司對帳異常橫幅 */}
        {weekMismatches.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: '#FEF2F2', border: '1.5px solid #FECACA' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #FECACA', background: '#FEE2E2' }}>
              <p className="text-sm font-bold flex items-center gap-2" style={{ color: '#991B1B' }}>
                ⚠️ 全公司對帳異常（過去 7 天 {weekMismatches.length} 筆）
              </p>
            </div>
            <div>
              {weekMismatches.slice(0, 10).map((m, i) => {
                const diff = m.ck_confirmed_amount - m.amount
                return (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between text-xs"
                    style={{ borderBottom: i < Math.min(weekMismatches.length, 10) - 1 ? '1px solid #FECACA' : 'none' }}>
                    <div className="flex items-center gap-2">
                      <span style={{ color: '#52525b' }}>{m.business_date}</span>
                      <span className="font-semibold" style={{ color: '#18181b' }}>{m.store_name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#fff', color: '#92400E', border: '1px solid #FDE68A' }}>{m.ck_store_name}</span>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span style={{ color: '#71717a' }}>店 ${Math.round(m.amount).toLocaleString()}</span>
                      <span style={{ color: '#71717a' }}>央 ${Math.round(m.ck_confirmed_amount).toLocaleString()}</span>
                      <span className="font-bold" style={{ color: diff > 0 ? '#dc2626' : '#0369a1' }}>
                        {diff > 0 ? '+' : ''}{Math.round(diff).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )
              })}
              {weekMismatches.length > 10 && (
                <p className="text-xs text-center py-2" style={{ color: '#7F1D1D' }}>… 還有 {weekMismatches.length - 10} 筆</p>
              )}
            </div>
          </div>
        )}

        <CKOverview data={ckData} date={date} />
      </div>
    </div>
  )
}
