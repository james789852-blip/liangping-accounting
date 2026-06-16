'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// 同步央廚月份資料到 Google 試算表（內容 = Excel 匯出內容）
// TODO: 完整實作 — 目前先擋住，等下一個 commit 接上 lib/google-sheets.ts
export async function syncCKMonthToSheets(_ckStoreId: string, _month: string) {
  return { error: '同步試算表功能尚未完成，下次 commit 會接上' }
}

// 同步店面央廚叫貨金額 → ck_store_orders
export async function syncStoreCKOrder(storeId: string, date: string, amount: number) {
  const admin = createAdminClient()

  // 找這間店屬於哪間央廚
  const { data: ckStores } = await admin
    .from('stores')
    .select('id')
    .eq('type', '央廚')
    .eq('active', true)
    .contains('assigned_store_ids', [storeId])

  if (!ckStores?.length) return { success: true }
  const ckStoreId = ckStores[0].id

  // upsert 央廚每日主記錄
  const { data: record, error: recErr } = await admin
    .from('ck_daily_records')
    .upsert(
      { ck_store_id: ckStoreId, business_date: date, updated_at: new Date().toISOString() },
      { onConflict: 'ck_store_id,business_date' }
    )
    .select('id')
    .single()
  if (recErr || !record) return { success: true }

  // upsert 店家叫貨
  if (amount > 0) {
    await admin.from('ck_store_orders')
      .upsert(
        { ck_daily_record_id: record.id, store_id: storeId, amount },
        { onConflict: 'ck_daily_record_id,store_id' }
      )
  } else {
    await admin.from('ck_store_orders')
      .delete()
      .eq('ck_daily_record_id', record.id)
      .eq('store_id', storeId)
  }

  revalidatePath('/manager/ck')
  revalidatePath('/hq/ck')
  return { success: true }
}

// 儲存央廚每日記錄（含體系外叫貨 + 支出）
export async function saveCKDailyRecord(ckStoreId: string, date: string, data: {
  payerName?: string
  note?: string
  status?: 'draft' | 'submitted'
  externalOrders?: { name: string; amount: number }[]
  expenses?: { category: string; item_name: string; amount: number; payer_name?: string }[]
  receiptPhotoUrls?: string[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const admin = createAdminClient()

  const { data: record, error } = await admin
    .from('ck_daily_records')
    .upsert(
      {
        ck_store_id: ckStoreId,
        business_date: date,
        payer_name: data.payerName ?? null,
        note: data.note ?? null,
        status: data.status ?? 'draft',
        ...(data.receiptPhotoUrls !== undefined ? { receipt_photo_urls: data.receiptPhotoUrls } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'ck_store_id,business_date' }
    )
    .select('id')
    .single()

  if (error || !record) return { error: error?.message ?? '儲存失敗' }
  const recordId = record.id

  // 體系外叫貨：全部刪除後重新寫入
  if (data.externalOrders !== undefined) {
    await admin.from('ck_store_orders')
      .delete()
      .eq('ck_daily_record_id', recordId)
      .is('store_id', null)
    if (data.externalOrders.length > 0) {
      await admin.from('ck_store_orders').insert(
        data.externalOrders.map(o => ({
          ck_daily_record_id: recordId,
          external_store_name: o.name,
          amount: o.amount,
        }))
      )
    }
  }

  // 支出明細：全部刪除後重新寫入
  if (data.expenses !== undefined) {
    await admin.from('ck_expense_items').delete().eq('ck_daily_record_id', recordId)
    if (data.expenses.length > 0) {
      await admin.from('ck_expense_items').insert(
        data.expenses.map((e, i) => ({
          ck_daily_record_id: recordId,
          category: e.category,
          item_name: e.item_name,
          amount: e.amount,
          payer_name: e.payer_name ?? null,
          sort_order: i,
        }))
      )
    }
  }

  revalidatePath('/manager/ck')
  revalidatePath('/hq/ck')
  return { success: true, id: recordId }
}

// 設定央廚服務的體系內店家
export async function updateCKAssignedStores(ckStoreId: string, assignedStoreIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('stores')
    .update({ assigned_store_ids: assignedStoreIds })
    .eq('id', ckStoreId)

  if (error) return { error: error.message }
  revalidatePath('/hq/stores')
  return { success: true }
}

// 新增體系外店家
export async function addCKExternalStore(ckStoreId: string, name: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('ck_external_stores')
    .insert({ ck_store_id: ckStoreId, name })
  if (error) return { error: error.message }
  revalidatePath('/manager/ck')
  return { success: true }
}

// 刪除體系外店家
export async function deleteCKExternalStore(id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('ck_external_stores').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/manager/ck')
  return { success: true }
}

// 更新體系外店家名稱
export async function updateCKExternalStore(id: string, name: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('ck_external_stores').update({ name }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/manager/ck')
  return { success: true }
}

// 總公司標記補款狀態
export async function markCKHQPaid(ckStoreId: string, date: string, paid: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('ck_daily_records')
    .select('id')
    .eq('ck_store_id', ckStoreId)
    .eq('business_date', date)
    .maybeSingle()

  let error
  if (existing) {
    ;({ error } = await admin
      .from('ck_daily_records')
      .update({
        hq_paid: paid,
        hq_paid_at: paid ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id))
  } else {
    ;({ error } = await admin
      .from('ck_daily_records')
      .insert({
        ck_store_id: ckStoreId,
        business_date: date,
        hq_paid: paid,
        hq_paid_at: paid ? new Date().toISOString() : null,
      }))
  }

  if (error) return { error: error.message }
  revalidatePath('/hq/ck')
  return { success: true }
}
