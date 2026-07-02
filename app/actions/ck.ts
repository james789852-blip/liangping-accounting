'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getAuthContext, canAccessStore } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'

// Google Sheets 同步已停用；保留 stub 讓可能存在的舊 client 收到明確錯誤
export async function syncCKMonthToSheets(_ckStoreId: string, _month: string) {
  return { error: 'Google Sheets 同步已停用' as const }
}

// ──────────────────────────────────────────────────────
// 央廚交叉對帳：央廚管理人員輸入該店配送金額，與店家自報比對
// ──────────────────────────────────────────────────────
export async function confirmCKOrder(input: {
  ckDailyRecordId: string
  storeId: string
  confirmedAmount: number | null   // null = 取消對帳
}) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  // 權限：央廚管理人員（廠長/副廠長）+ 總公司管理層
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', ctx.userId).single()
  const allowed = profile?.is_hq ||
    ['老闆', '經理', '總監', '廠長', '副廠長'].includes(profile?.role ?? '')
  if (!allowed) return { error: '權限不足，僅限央廚管理或總公司操作' }

  const admin = createAdminClient()
  if (input.confirmedAmount === null) {
    await admin.from('ck_store_orders')
      .update({ ck_confirmed_amount: null, ck_confirmed_at: null, ck_confirmed_by: null })
      .eq('ck_daily_record_id', input.ckDailyRecordId)
      .eq('store_id', input.storeId)
  } else {
    await admin.from('ck_store_orders')
      .update({
        ck_confirmed_amount: input.confirmedAmount,
        ck_confirmed_at: new Date().toISOString(),
        ck_confirmed_by: ctx.userId,
      })
      .eq('ck_daily_record_id', input.ckDailyRecordId)
      .eq('store_id', input.storeId)
  }
  revalidatePath('/manager/ck')
  revalidatePath('/hq/ck')
  return { success: true }
}

// 同步店面央廚叫貨金額 → ck_store_orders
export async function syncStoreCKOrder(storeId: string, date: string, amount: number) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!canAccessStore(ctx, storeId)) return { error: '無權限存取此店家' }

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
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!canAccessStore(ctx, ckStoreId)) return { error: '無權限存取此央廚' }

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

  await logAudit({
    eventType: 'ck_record_update',
    storeId: ckStoreId, userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} 更新央廚 ${date} 記錄（${data.status ?? 'draft'}）`,
    metadata: { business_date: date, status: data.status, has_external: !!data.externalOrders, has_expenses: !!data.expenses },
  })

  revalidatePath('/manager/ck')
  revalidatePath('/hq/ck')
  return { success: true, id: recordId }
}

// 設定央廚服務的體系內店家
export async function updateCKAssignedStores(ckStoreId: string, assignedStoreIds: string[]) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!ctx.isHQ) return { error: '權限不足（僅總公司可調整）' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('stores')
    .update({ assigned_store_ids: assignedStoreIds })
    .eq('id', ckStoreId)

  if (error) return { error: error.message }

  await logAudit({
    eventType: 'store_update',
    storeId: ckStoreId, userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} 調整央廚體系內店家清單`,
    metadata: { assigned_store_ids: assignedStoreIds },
  })

  revalidatePath('/hq/stores')
  return { success: true }
}

// 新增體系外店家
export async function addCKExternalStore(ckStoreId: string, name: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!canAccessStore(ctx, ckStoreId)) return { error: '無權限存取此央廚' }

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
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const admin = createAdminClient()
  const { data: ext } = await admin.from('ck_external_stores').select('ck_store_id').eq('id', id).single()
  if (!ext) return { error: '找不到此體系外店家' }
  if (!canAccessStore(ctx, ext.ck_store_id as string)) return { error: '無權限存取' }

  const { error } = await admin.from('ck_external_stores').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/manager/ck')
  return { success: true }
}

// 更新體系外店家名稱
export async function updateCKExternalStore(id: string, name: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const admin = createAdminClient()
  const { data: ext } = await admin.from('ck_external_stores').select('ck_store_id').eq('id', id).single()
  if (!ext) return { error: '找不到此體系外店家' }
  if (!canAccessStore(ctx, ext.ck_store_id as string)) return { error: '無權限存取' }

  const { error } = await admin.from('ck_external_stores').update({ name }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/manager/ck')
  return { success: true }
}

// 總公司標記補款狀態
export async function markCKHQPaid(ckStoreId: string, date: string, paid: boolean) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!ctx.isHQ) return { error: '權限不足（僅總公司可標記）' }

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

  await logAudit({
    eventType: 'ck_hq_paid',
    storeId: ckStoreId, userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} ${paid ? '標記' : '取消'}央廚 ${date} 補款`,
    metadata: { paid, business_date: date },
  })

  revalidatePath('/hq/ck')
  return { success: true }
}
