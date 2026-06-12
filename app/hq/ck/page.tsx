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
  ] = await Promise.all([
    admin.from('ck_daily_records')
      .select('id, ck_store_id, status, payer_name, note, hq_paid, hq_paid_at, receipt_photo_urls')
      .in('ck_store_id', ckStoreIds)
      .eq('business_date', date),
    uniqueAssignedIds.length > 0
      ? admin.from('stores').select('id, name').in('id', uniqueAssignedIds)
      : Promise.resolve({ data: [] }),
    admin.from('ck_external_stores').select('id, ck_store_id, name').in('ck_store_id', ckStoreIds),
  ])

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

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-3xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: '#a1a1aa' }}>央廚帳目</p>
            <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>央廚帳目總覽</h1>
            <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>{ckStores.length} 間央廚</p>
          </div>
          {/* 日期導覽 */}
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <a href={`/hq/ck?date=${prevDay(date)}`}
              className="flex items-center justify-center h-8 w-8 rounded-xl text-sm font-semibold transition-colors hover:bg-slate-50"
              style={{ border: '1px solid #e4e4e7', color: '#52525b' }}>‹</a>
            <span className="text-sm font-semibold tabular-nums px-1" style={{ color: '#18181b', minWidth: '90px', textAlign: 'center' }}>{date}</span>
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
        <CKOverview data={ckData} date={date} />
      </div>
    </div>
  )
}
