import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
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
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_id, name, role, store_ids, is_hq, primary_store_id')
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
      .select('id, payer_name, note, status, review_note, reviewed_at, receipt_photo_urls, hq_paid, hq_paid_at, hq_reimbursement_photo_urls, hq_reimbursement_sent_at, ck_reimbursement_confirmed, ck_reimbursement_confirmed_at')
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
      .select('store_id, item_name, vendor_group, item_category, excel_column, sort_order, is_tax_addon')
      .eq('store_id', storeId)
      .order('sort_order'),
  ])

  const mappingMap = new Map<string, any>()
  for (const item of (rawMappings ?? []) as any[]) {
    const key = `${item.vendor_group ?? ''}||${item.item_name}`
    mappingMap.set(key, item)
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
    review_note?: string | null
    reviewed_at?: string | null
    hq_paid?: boolean
    hq_paid_at?: string | null
    hq_reimbursement_photo_urls?: string[]
    hq_reimbursement_sent_at?: string | null
    ck_reimbursement_confirmed?: boolean
    ck_reimbursement_confirmed_at?: string | null
    externalOrders: { name: string; amount: number }[]
    expenses: { id: string; category: '食材' | '耗材' | '雜項'; item_name: string; amount: number; payer_name: string; vendor_group: string; doc_type: string; note: string; receipt_photo_url?: string }[]
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
      admin.from('ck_expense_items').select('id, category, item_name, amount, payer_name, vendor_group, doc_type, note, receipt_photo_url')
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
      review_note: (ckRecord as any).review_note ?? null,
      reviewed_at: (ckRecord as any).reviewed_at ?? null,
      hq_paid: (ckRecord as any).hq_paid ?? false,
      hq_paid_at: (ckRecord as any).hq_paid_at ?? null,
      hq_reimbursement_photo_urls: ((ckRecord as any).hq_reimbursement_photo_urls as string[] | null) ?? [],
      hq_reimbursement_sent_at: (ckRecord as any).hq_reimbursement_sent_at ?? null,
      ck_reimbursement_confirmed: (ckRecord as any).ck_reimbursement_confirmed ?? false,
      ck_reimbursement_confirmed_at: (ckRecord as any).ck_reimbursement_confirmed_at ?? null,
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
        receipt_photo_url: (e.receipt_photo_url ?? '') as string,
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
        mappingItems={(mappings ?? []) as { item_name: string; vendor_group: string | null; item_category: string; excel_column: string; sort_order: number | null; is_tax_addon?: boolean }[]}
        receiptCategories={receiptCategories}
      />
    </div>
  )
}
