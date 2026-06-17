import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import CKDailyForm from '@/components/manager/ck-daily-form'
import { sortStores } from '@/lib/store-order'

export const dynamic = 'force-dynamic'

export default async function CKPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('name, role, store_ids, is_hq')
    .eq('user_id', user.id)
    .single()

  const storeId = await getEffectiveStoreId(profile as any)
  if (!storeId) {
    return (
      <div className="p-6">
        <p className="text-red-500">您尚未被指派到任何店家，請聯絡系統管理員。</p>
      </div>
    )
  }

  const admin = createAdminClient()

  const { data: store } = await admin
    .from('stores')
    .select('id, name, type, assigned_store_ids')
    .eq('id', storeId)
    .single()

  if (!store || store.type !== '央廚') {
    redirect('/manager/closing')
  }

  const today = getBusinessDate()
  const assignedStoreIds: string[] = (store.assigned_store_ids as string[] | null) ?? []

  const [
    { data: assignedStores },
    { data: externalStores },
    { data: ckRecord },
    { data: todayClosings },
  ] = await Promise.all([
    assignedStoreIds.length > 0
      ? admin.from('stores').select('id, name').in('id', assignedStoreIds)
      : Promise.resolve({ data: [] }),
    admin.from('ck_external_stores').select('id, name').eq('ck_store_id', storeId).order('created_at'),
    admin.from('ck_daily_records')
      .select('id, payer_name, note, status, receipt_photo_urls')
      .eq('ck_store_id', storeId)
      .eq('business_date', today)
      .maybeSingle(),
    assignedStoreIds.length > 0
      ? supabase.from('daily_closings')
          .select('store_id, status')
          .in('store_id', assignedStoreIds)
          .eq('business_date', today)
      : Promise.resolve({ data: [] }),
  ])

  // 哪些店已送出今日結帳
  const submittedStores = new Set(
    (todayClosings ?? [])
      .filter((c: any) => ['submitted', 'verified'].includes(c.status))
      .map((c: any) => c.store_id as string)
  )

  // 體系內叫貨 + 支出，從 ck_daily_record 載入
  let memberOrderMap: Record<string, number> = {}
  let existing: {
    id: string
    payer_name?: string
    note?: string
    status: string
    externalOrders: { name: string; amount: number }[]
    expenses: { id: string; category: '食材' | '耗材' | '雜項'; item_name: string; amount: number; payer_name: string }[]
    receiptPhotoUrls?: string[]
  } | null = null

  if (ckRecord) {
    const [
      { data: storeOrders },
      { data: extOrders },
      { data: expenseItems },
    ] = await Promise.all([
      admin.from('ck_store_orders').select('store_id, amount')
        .eq('ck_daily_record_id', ckRecord.id).not('store_id', 'is', null),
      admin.from('ck_store_orders').select('external_store_name, amount')
        .eq('ck_daily_record_id', ckRecord.id).is('store_id', null),
      admin.from('ck_expense_items').select('id, category, item_name, amount, payer_name')
        .eq('ck_daily_record_id', ckRecord.id).order('sort_order'),
    ])

    for (const o of storeOrders ?? []) {
      if (o.store_id) memberOrderMap[o.store_id] = o.amount
    }

    existing = {
      id: ckRecord.id,
      payer_name: ckRecord.payer_name ?? undefined,
      note: ckRecord.note ?? undefined,
      status: ckRecord.status,
      externalOrders: (extOrders ?? []).map((o: any) => ({
        name: o.external_store_name as string,
        amount: o.amount as number,
      })),
      expenses: (expenseItems ?? []).map((e: any) => ({
        id: e.id as string,
        category: e.category as '食材' | '耗材' | '雜項',
        item_name: e.item_name as string,
        amount: e.amount as number,
        payer_name: (e.payer_name ?? '') as string,
      })),
      receiptPhotoUrls: ((ckRecord as any).receipt_photo_urls as string[] | null) ?? [],
    }
  }

  const memberOrders = sortStores((assignedStores ?? []) as { id: string; name: string }[]).map((s: any) => ({
    store_id: s.id as string,
    store_name: s.name as string,
    amount: memberOrderMap[s.id] ?? 0,
    submitted: submittedStores.has(s.id),
  }))

  return (
    <div>
      {/* 頁首 */}
      <div className="px-4 pt-6 pb-2 max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold" style={{ color: '#18181b' }}>{store.name}</h1>
            <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
              {today} · 央廚每日帳目
            </p>
          </div>
          <div className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)', color: '#92400E', border: '1px solid #FDE68A' }}>
            央廚
          </div>
        </div>
      </div>

      <CKDailyForm
        ckStoreId={storeId}
        ckStoreName={store.name}
        date={today}
        memberOrders={memberOrders}
        externalStores={externalStores ?? []}
        existing={existing}
      />
    </div>
  )
}
