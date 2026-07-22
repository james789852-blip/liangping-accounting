'use server'

import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCKRangeStats, getCKMonthlyStats, type CKDailyStats, type CKMonthlyStats } from '@/lib/ck-aggregator'

async function checkHqAuth() {
  const supabase = await createClient()
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '無權限' as const }
  return { ok: true as const }
}

export async function fetchCKDailyStats(ckStoreId: string, date: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!ckStoreId || !date) return { error: '缺少參數' as const }
  const { days } = await getCKRangeStats(ckStoreId, date, date)
  return { success: true as const, stats: days[0] as CKDailyStats | undefined }
}

/** 撈 CK 當日完整 record（含照片、成員訂單、支出、狀態）給總覽內嵌審核用 */
export async function fetchCKDailyDetail(ckStoreId: string, date: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!ckStoreId || !date) return { error: '缺少參數' as const }

  const admin = createAdminClient()
  const [{ data: ckStore }, { data: rec }] = await Promise.all([
    admin.from('stores').select('id, name, assigned_store_ids').eq('id', ckStoreId).maybeSingle(),
    admin.from('ck_daily_records')
      .select('id, ck_store_id, business_date, status, payer_name, note, submitted_by, review_note, reviewed_at, hq_paid, hq_paid_at, receipt_photo_urls, hq_reimbursement_photo_urls, hq_reimbursement_sent_at, ck_reimbursement_confirmed, ck_reimbursement_confirmed_at')
      .eq('ck_store_id', ckStoreId).eq('business_date', date).maybeSingle(),
  ])
  if (!ckStore) return { error: '找不到央廚' as const }

  let submittedByName: string | null = null
  if (rec?.submitted_by) {
    const { data: submitter } = await admin
      .from('user_profiles').select('name').eq('user_id', rec.submitted_by).maybeSingle()
    submittedByName = submitter?.name ?? null
  }

  const assignedIds: string[] = (ckStore.assigned_store_ids as string[] | null) ?? []
  const [{ data: assignedStores }, { data: extStores }, orderRes, expRes, closingRes] = await Promise.all([
    assignedIds.length > 0
      ? admin.from('stores').select('id, name').in('id', assignedIds)
      : Promise.resolve({ data: [] }),
    admin.from('ck_external_stores').select('*').eq('ck_store_id', ckStoreId),
    rec ? admin.from('ck_store_orders').select('store_id, external_store_name, amount, ck_confirmed_amount').eq('ck_daily_record_id', rec.id) : Promise.resolve({ data: [] }),
    rec ? admin.from('ck_expense_items').select('category, item_name, amount, payer_name, vendor_group, doc_type, receipt_photo_url').eq('ck_daily_record_id', rec.id).order('sort_order') : Promise.resolve({ data: [] }),
    assignedIds.length > 0
      ? admin.from('daily_closings')
          .select('store_id, total_cost')
          .in('store_id', assignedIds)
          .eq('business_date', date)
          .in('status', ['submitted', 'verified', 'disputed'])
      : Promise.resolve({ data: [] }),
  ])

  const nameMap = Object.fromEntries((assignedStores ?? []).map((s: any) => [s.id, s.name as string]))
  const memberOrders = ((orderRes.data ?? []) as any[])
    .filter(o => o.store_id !== null)
    .map(o => ({ store_id: o.store_id, store_name: nameMap[o.store_id] ?? o.store_id, amount: Number(o.ck_confirmed_amount ?? 0) }))
  const externalOrders = ((orderRes.data ?? []) as any[])
    .filter(o => o.store_id === null)
    .map(o => ({ name: o.external_store_name, amount: Number(o.amount ?? 0) }))
  const expenses = ((expRes.data ?? []) as any[]).map(e => ({
    category: e.category, item_name: e.item_name, amount: Number(e.amount ?? 0), payer_name: e.payer_name ?? undefined,
    vendor_group: e.vendor_group ?? undefined,
    doc_type: e.doc_type ?? undefined,
    receipt_photo_url: e.receipt_photo_url ?? undefined,
  }))
  const managerAmountByStore = ((closingRes.data ?? []) as any[]).reduce<Record<string, number>>((amounts, closing) => {
    amounts[closing.store_id] = (amounts[closing.store_id] ?? 0) + Number(closing.total_cost ?? 0)
    return amounts
  }, {})
  const memberStores = assignedIds.map(id => {
    const existing = memberOrders.find(o => o.store_id === id)
    return {
      store_id: id,
      store_name: nameMap[id] ?? id,
      amount: existing?.amount ?? 0,
      manager_amount: managerAmountByStore[id] ?? null,
    }
  })
  const revenueTotal = [...memberOrders, ...externalOrders].reduce((s, o) => s + o.amount, 0)
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)

  return {
    success: true as const,
    detail: rec ? {
      ckStore: { id: ckStore.id, name: ckStore.name },
      status: rec.status ?? 'none',
      payerName: rec.payer_name ?? null,
      submittedBy: rec.submitted_by ?? null,
      submittedByName,
      note: rec.note ?? null,
      reviewNote: (rec as any).review_note ?? null,
      reviewedAt: (rec as any).reviewed_at ?? null,
      hqPaid: (rec as any).hq_paid ?? false,
      hqPaidAt: (rec as any).hq_paid_at ?? null,
      hqReimbursementPhotoUrls: ((rec as any).hq_reimbursement_photo_urls as string[] | null) ?? [],
      hqReimbursementSentAt: (rec as any).hq_reimbursement_sent_at ?? null,
      ckReimbursementConfirmed: (rec as any).ck_reimbursement_confirmed ?? false,
      ckReimbursementConfirmedAt: (rec as any).ck_reimbursement_confirmed_at ?? null,
      revenueTotal,
      expenseTotal,
      balance: revenueTotal - expenseTotal,
      memberStores,
      externalOrders,
      externalStores: ((extStores ?? []) as any[]).map(s => ({
        id: s.id,
        name: s.name,
        deductFromReimbursement: s.deduct_from_reimbursement ?? (
          String((ckStore as any).name ?? '').trim().startsWith('泉州') && String(s.name ?? '').trim() === '食咣雞'
        ),
      })),
      expenses,
      receiptPhotoUrls: ((rec as any).receipt_photo_urls as string[] | null) ?? [],
    } : null,
  }
}

export async function fetchCKMonthlyStats(ckStoreId: string, year: number, monthNum: number) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!ckStoreId || !year || !monthNum) return { error: '缺少參數' as const }
  const stats = await getCKMonthlyStats(ckStoreId, year, monthNum)
  return { success: true as const, stats: stats as CKMonthlyStats }
}
