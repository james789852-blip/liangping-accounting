import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCKReimbursementAdjustments } from '@/lib/ck-reimbursement-adjustment'
import {
  memberDeliveryPhotosFromStoreClosings,
  normalizeCKDeliveryPhotoUrls,
} from '@/lib/ck-delivery-photos'

/**
 * 一次準備同一天所有指定央廚的完整審核資料。
 * 帳目中心只有少數央廚，批次兩輪查詢能避免點卡片後再等待 Server Action。
 */
export async function loadCKDailyDetails(ckStoreIds: string[], date: string) {
  const ids = [...new Set(ckStoreIds.filter(Boolean))]
  if (ids.length === 0) return {}

  const admin = createAdminClient()
  const [{ data: ckStores }, { data: records }, reimbursementAdjustments] = await Promise.all([
    admin.from('stores')
      .select('id, name, assigned_store_ids')
      .in('id', ids),
    admin.from('ck_daily_records')
      .select('id, ck_store_id, business_date, status, payer_name, note, submitted_by, review_note, reviewed_at, hq_paid, hq_paid_at, receipt_photo_urls, hq_reimbursement_photo_urls, hq_reimbursement_sent_at, ck_reimbursement_confirmed, ck_reimbursement_confirmed_at')
      .in('ck_store_id', ids)
      .eq('business_date', date),
    getCKReimbursementAdjustments(ids, date),
  ])

  const recordIds = (records ?? []).map(record => record.id)
  const assignedIds = [...new Set((ckStores ?? []).flatMap(store => (
    (store.assigned_store_ids as string[] | null) ?? []
  )))]
  const submitterIds = [...new Set((records ?? [])
    .map(record => record.submitted_by as string | null)
    .filter((id): id is string => !!id))]

  const [assignedStoreRes, externalStoreRes, orderRes, expenseRes, closingRes, submitterRes] = await Promise.all([
    assignedIds.length > 0
      ? admin.from('stores').select('id, name').in('id', assignedIds)
      : Promise.resolve({ data: [] }),
    admin.from('ck_external_stores').select('*').in('ck_store_id', ids),
    recordIds.length > 0
      ? admin.from('ck_store_orders')
          .select('ck_daily_record_id, store_id, external_store_name, amount, ck_confirmed_amount, delivery_photo_urls')
          .in('ck_daily_record_id', recordIds)
      : Promise.resolve({ data: [] }),
    recordIds.length > 0
      ? admin.from('ck_expense_items')
          .select('ck_daily_record_id, category, item_name, amount, payer_name, vendor_group, doc_type, receipt_photo_url, sort_order')
          .in('ck_daily_record_id', recordIds)
          .order('sort_order')
      : Promise.resolve({ data: [] }),
    assignedIds.length > 0
      ? admin.from('daily_closings')
          .select('store_id, total_cost, ck_delivery_photo_url')
          .in('store_id', assignedIds)
          .eq('business_date', date)
          .in('status', ['submitted', 'verified', 'disputed'])
      : Promise.resolve({ data: [] }),
    submitterIds.length > 0
      ? admin.from('user_profiles').select('user_id, name').in('user_id', submitterIds)
      : Promise.resolve({ data: [] }),
  ])

  const assignedStoreName = Object.fromEntries((assignedStoreRes.data ?? []).map(store => [store.id, store.name as string]))
  const submitterName = Object.fromEntries((submitterRes.data ?? []).map(profile => [profile.user_id, profile.name as string]))
  const managerAmountByStore = (closingRes.data ?? []).reduce<Record<string, number>>((amounts, closing) => {
    amounts[closing.store_id] = (amounts[closing.store_id] ?? 0) + Number(closing.total_cost ?? 0)
    return amounts
  }, {})
  const memberDeliveryPhotosByStore = memberDeliveryPhotosFromStoreClosings(closingRes.data ?? [])
  const detailByStore: Record<string, any | null> = Object.fromEntries(ids.map(id => [id, null]))

  for (const ckStore of ckStores ?? []) {
    const record = (records ?? []).find(row => row.ck_store_id === ckStore.id)
    if (!record) continue

    const assignedStoreIds = (ckStore.assigned_store_ids as string[] | null) ?? []
    const recordOrders = (orderRes.data ?? []).filter(order => order.ck_daily_record_id === record.id)
    const memberOrders = recordOrders
      .filter(order => order.store_id !== null)
      .map(order => ({
        store_id: order.store_id as string,
        store_name: assignedStoreName[order.store_id as string] ?? order.store_id,
        ck_amount: order.ck_confirmed_amount == null ? null : Number(order.ck_confirmed_amount),
        deliveryPhotoUrls: [] as string[],
      }))
    const externalOrders = recordOrders
      .filter(order => order.store_id === null)
      .map(order => ({
        name: order.external_store_name,
        amount: Number(order.amount ?? 0),
        deliveryPhotoUrls: normalizeCKDeliveryPhotoUrls(order.delivery_photo_urls),
      }))
    const expenses = (expenseRes.data ?? [])
      .filter(expense => expense.ck_daily_record_id === record.id)
      .map(expense => ({
        category: expense.category,
        item_name: expense.item_name,
        amount: Number(expense.amount ?? 0),
        payer_name: expense.payer_name ?? undefined,
        vendor_group: expense.vendor_group ?? undefined,
        doc_type: expense.doc_type ?? undefined,
        receipt_photo_url: expense.receipt_photo_url ?? undefined,
      }))
    const memberStores = assignedStoreIds.map(storeId => {
      const existing = memberOrders.find(order => order.store_id === storeId)
      return {
        store_id: storeId,
        store_name: assignedStoreName[storeId] ?? storeId,
        store_amount: managerAmountByStore[storeId] ?? null,
        ck_amount: existing?.ck_amount ?? null,
        deliveryPhotoUrls: memberDeliveryPhotosByStore[storeId] ?? [],
      }
    })
    const revenueTotal = memberOrders.reduce((sum, order) => sum + (order.ck_amount ?? 0), 0)
      + externalOrders.reduce((sum, order) => sum + order.amount, 0)
    const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0)

    detailByStore[ckStore.id] = {
      ckStore: { id: ckStore.id, name: ckStore.name },
      status: record.status ?? 'none',
      payerName: record.payer_name ?? null,
      submittedBy: record.submitted_by ?? null,
      submittedByName: record.submitted_by ? (submitterName[record.submitted_by] ?? null) : null,
      note: record.note ?? null,
      reviewNote: record.review_note ?? null,
      reviewedAt: record.reviewed_at ?? null,
      hqPaid: record.hq_paid ?? false,
      hqPaidAt: record.hq_paid_at ?? null,
      hqReimbursementPhotoUrls: (record.hq_reimbursement_photo_urls as string[] | null) ?? [],
      hqReimbursementSentAt: record.hq_reimbursement_sent_at ?? null,
      hqReimbursementAdjustment: reimbursementAdjustments[ckStore.id]?.amount ?? 0,
      hqReimbursementAdjustmentNote: reimbursementAdjustments[ckStore.id]?.note ?? '',
      ckReimbursementConfirmed: record.ck_reimbursement_confirmed ?? false,
      ckReimbursementConfirmedAt: record.ck_reimbursement_confirmed_at ?? null,
      revenueTotal,
      expenseTotal,
      balance: revenueTotal - expenseTotal,
      memberStores,
      externalOrders,
      externalStores: (externalStoreRes.data ?? [])
        .filter(store => store.ck_store_id === ckStore.id)
        .map(store => ({
          id: store.id,
          name: store.name,
          deductFromReimbursement: store.deduct_from_reimbursement ?? (
            ckStore.name.trim().startsWith('泉州') && String(store.name ?? '').trim() === '食咣雞'
          ),
        })),
      expenses,
      receiptPhotoUrls: (record.receipt_photo_urls as string[] | null) ?? [],
    }
  }

  return detailByStore
}
