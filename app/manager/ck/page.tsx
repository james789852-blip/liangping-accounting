import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import CKDailyForm from '@/components/manager/ck-daily-form'
import { sortStores } from '@/lib/store-order'
import { getReceiptSettings } from '@/app/actions/receipt-settings'

export const dynamic = 'force-dynamic'

export default async function CKPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
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

  const realToday = getBusinessDate()
  const params = await searchParams
  const requested = params.date
  const today = (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= realToday)
    ? requested
    : realToday
  const isBackfill = today !== realToday
  const assignedStoreIds: string[] = (store.assigned_store_ids as string[] | null) ?? []

  const [
    { data: assignedStores },
    { data: externalStores },
    { data: ckRecord },
    { data: todayClosings },
    { data: ckVendorGroups },
    { data: rawMappings },
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
    admin.from('ck_vendor_groups')
      .select('id, name, doc_type').eq('ck_store_id', storeId).eq('active', true)
      .order('sort_order').order('name'),
    // 央廚品項對應（跟店面版一樣，xlsx 匯出對應 excel_column）
    admin.from('item_column_mappings')
      .select('store_id, item_name, vendor_group, item_category, excel_column, sort_order')
      .or(`store_id.is.null,store_id.eq.${storeId}`)
      .order('sort_order'),
  ])

  const mappingMap = new Map<string, any>()
  for (const item of (rawMappings ?? []) as any[]) {
    const key = `${item.vendor_group ?? ''}||${item.item_name}`
    const existingItem = mappingMap.get(key)
    if (!existingItem || (!existingItem.store_id && item.store_id === storeId)) {
      mappingMap.set(key, item)
    }
  }
  const mappings = Array.from(mappingMap.values())
    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || String(a.item_name).localeCompare(String(b.item_name), 'zh-Hant'))

  // 收據類別（跟店面版一致的 UI）
  const receiptCategories = await getReceiptSettings(storeId)

  // 哪些店已送出今日結帳
  const submittedStores = new Set(
    (todayClosings ?? [])
      .filter((c: any) => ['submitted', 'verified'].includes(c.status))
      .map((c: any) => c.store_id as string)
  )
  // 體系內叫貨 + 支出，從 ck_daily_record 載入
  let memberOrderMap: Record<string, number> = {}
  let memberConfirmedMap: Record<string, number | null> = {}  // 央廚對帳金額
  let existing: {
    id: string
    payer_name?: string
    note?: string
    status: string
    externalOrders: { name: string; amount: number }[]
    expenses: { id: string; category: '食材' | '耗材' | '雜項'; item_name: string; amount: number; payer_name: string; vendor_group: string; doc_type: string; note: string }[]
    receiptPhotoUrls?: string[]
  } | null = null

  if (ckRecord) {
    const [
      { data: storeOrders },
      { data: extOrders },
      { data: expenseItems },
    ] = await Promise.all([
      admin.from('ck_store_orders').select('store_id, amount, ck_confirmed_amount')
        .eq('ck_daily_record_id', ckRecord.id).not('store_id', 'is', null),
      admin.from('ck_store_orders').select('external_store_name, amount')
        .eq('ck_daily_record_id', ckRecord.id).is('store_id', null),
      admin.from('ck_expense_items').select('id, category, item_name, amount, payer_name, vendor_group, doc_type, note')
        .eq('ck_daily_record_id', ckRecord.id).order('sort_order'),
    ])

    for (const o of ((storeOrders ?? []) as any[])) {
      if (o.store_id) {
        memberOrderMap[o.store_id] = o.amount
        memberConfirmedMap[o.store_id] = (o.ck_confirmed_amount as number | null) ?? null
      }
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
        vendor_group: (e.vendor_group ?? '') as string,
        doc_type: (e.doc_type ?? '') as string,
        note: (e.note ?? '') as string,
      })),
      receiptPhotoUrls: ((ckRecord as any).receipt_photo_urls as string[] | null) ?? [],
    }
  }

  const memberOrders = sortStores((assignedStores ?? []) as { id: string; name: string }[]).map((s: any) => ({
    store_id: s.id as string,
    store_name: s.name as string,
    amount: memberOrderMap[s.id] ?? 0,
    confirmed_amount: memberConfirmedMap[s.id] ?? null,
    submitted: submittedStores.has(s.id),
  }))

  // 過去 7 天該央廚下旗下店家的對帳異常（不一致）+ 待對帳統計
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10)
  const { data: recentCkOrders } = await admin
    .from('ck_store_orders')
    .select('amount, ck_confirmed_amount, store_id, ck_daily_records!inner(business_date, ck_store_id)')
    .eq('ck_daily_records.ck_store_id', storeId)
    .gte('ck_daily_records.business_date', sevenDaysAgoStr)
  const recentValidCkOrders = recentCkOrders ?? []
  const storeNameMap = new Map((assignedStores ?? []).map((s: any) => [s.id as string, s.name as string]))
  const recentMismatches = recentValidCkOrders
    .filter((o: any) => o.ck_confirmed_amount != null && Number(o.ck_confirmed_amount) !== Number(o.amount))
    .map((o: any) => ({
      business_date: (o.ck_daily_records as any)?.business_date as string,
      store_id: o.store_id as string,
      store_name: storeNameMap.get(o.store_id as string) ?? '',
      amount: Number(o.amount),
      ck_confirmed_amount: Number(o.ck_confirmed_amount),
    }))
    .sort((a, b) => b.business_date.localeCompare(a.business_date))
  const recentPending = recentValidCkOrders
    .filter((o: any) => o.ck_confirmed_amount == null && Number(o.amount) > 0)
    .length

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
        {/* 過去 7 天對帳狀態 */}
        {(recentMismatches.length > 0 || recentPending > 0) && (
          <div className="mt-3 flex gap-2 text-xs">
            {recentMismatches.length > 0 && (
              <div className="flex-1 px-3 py-2 rounded-xl font-semibold flex items-center gap-1.5"
                style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}>
                ⚠️ 過去 7 天 {recentMismatches.length} 筆不一致
              </div>
            )}
            {recentPending > 0 && (
              <div className="flex-1 px-3 py-2 rounded-xl font-semibold flex items-center gap-1.5"
                style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                ⏳ {recentPending} 筆待對帳
              </div>
            )}
          </div>
        )}
        {recentMismatches.length > 0 && (
          <div className="mt-3 rounded-2xl overflow-hidden" style={{ background: '#FEF2F2', border: '1.5px solid #FECACA' }}>
            <div className="px-4 py-2.5" style={{ borderBottom: '1px solid #FECACA', background: '#FEE2E2' }}>
              <p className="text-xs font-bold" style={{ color: '#991B1B' }}>對帳異常清單（過去 7 天）</p>
            </div>
            <div>
              {recentMismatches.slice(0, 10).map((m, i) => {
                const diff = m.ck_confirmed_amount - m.amount
                return (
                  <div key={i} className="px-4 py-2 flex items-center justify-between text-xs"
                    style={{ borderBottom: i < Math.min(recentMismatches.length, 10) - 1 ? '1px solid #FECACA' : 'none' }}>
                    <div className="flex items-center gap-2">
                      <span style={{ color: '#52525b' }}>{m.business_date}</span>
                      <span className="font-semibold" style={{ color: '#18181b' }}>{m.store_name}</span>
                    </div>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span style={{ color: '#71717a' }}>店家 ${Math.round(m.amount).toLocaleString()}</span>
                      <span style={{ color: '#71717a' }}>央廚 ${Math.round(m.ck_confirmed_amount).toLocaleString()}</span>
                      <span className="font-bold" style={{ color: diff > 0 ? '#dc2626' : '#0369a1' }}>
                        {diff > 0 ? '+' : ''}{Math.round(diff).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <CKDailyForm
        key={`${storeId}-${today}`}
        ckStoreId={storeId}
        ckStoreName={store.name}
        date={today}
        realToday={realToday}
        isBackfill={isBackfill}
        memberOrders={memberOrders}
        externalStores={externalStores ?? []}
        existing={existing}
        vendorGroups={(ckVendorGroups ?? []) as { id: string; name: string; doc_type: string | null }[]}
        mappingItems={(mappings ?? []) as { item_name: string; vendor_group: string | null; item_category: string; excel_column: string; sort_order: number | null }[]}
        receiptCategories={receiptCategories}
      />
    </div>
  )
}
