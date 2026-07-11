'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getAuthContext, canAccessStore } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import {
  canManageCKSettings as canManageCKSettingsPermission,
  canReviewClosings,
} from '@/lib/user-permissions'

async function getUserPermissionProfile(userId: string) {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()
  return profile
}

async function canManageCKStoreSettings(ctx: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>) {
  const profile = await getUserPermissionProfile(ctx.userId)
  return canManageCKSettingsPermission(profile)
}

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

  const profile = await getUserPermissionProfile(ctx.userId)
  const allowed = canReviewClosings(profile) || canManageCKSettingsPermission(profile)
  if (!allowed) return { error: '權限不足，請先開啟央廚店家管理或帳目審核權限' }

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
  memberOrders?: { storeId: string; confirmedAmount: number | null }[]
  externalOrders?: { name: string; amount: number }[]
  expenses?: { category: string; item_name: string; amount: number; payer_name?: string; vendor_group?: string; doc_type?: string; note?: string; receipt_photo_url?: string }[]
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
        review_note: data.status === 'submitted' ? null : undefined,
        reviewed_at: data.status === 'submitted' ? null : undefined,
        reviewed_by: data.status === 'submitted' ? null : undefined,
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

  // 體系內店家叫貨：央廚自報金額寫入 ck_confirmed_amount，店家自報 amount 保留供隔日對帳
  if (data.memberOrders !== undefined) {
    const cleaned = data.memberOrders.filter(o => o.storeId)
    const storeIds = cleaned.map(o => o.storeId)
    const existingAmountByStore: Record<string, number> = {}

    if (storeIds.length > 0) {
      const { data: existingOrders, error: existingErr } = await admin
        .from('ck_store_orders')
        .select('store_id, amount')
        .eq('ck_daily_record_id', recordId)
        .in('store_id', storeIds)
      if (existingErr) return { error: existingErr.message }
      for (const row of existingOrders ?? []) {
        existingAmountByStore[row.store_id as string] = Number(row.amount ?? 0)
      }
    }

    const clearIds = cleaned
      .filter(o => o.confirmedAmount === null)
      .map(o => o.storeId)
    if (clearIds.length > 0) {
      const { error: clearErr } = await admin
        .from('ck_store_orders')
        .update({ ck_confirmed_amount: null, ck_confirmed_at: null, ck_confirmed_by: null })
        .eq('ck_daily_record_id', recordId)
        .in('store_id', clearIds)
      if (clearErr) return { error: clearErr.message }
    }

    const upsertRows = cleaned
      .filter(o => o.confirmedAmount !== null)
      .map(o => ({
        ck_daily_record_id: recordId,
        store_id: o.storeId,
        amount: existingAmountByStore[o.storeId] ?? 0,
        ck_confirmed_amount: o.confirmedAmount,
        ck_confirmed_at: new Date().toISOString(),
        ck_confirmed_by: ctx.userId,
      }))
    if (upsertRows.length > 0) {
      const { error: memberErr } = await admin
        .from('ck_store_orders')
        .upsert(upsertRows, { onConflict: 'ck_daily_record_id,store_id' })
      if (memberErr) return { error: memberErr.message }
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
          vendor_group: e.vendor_group ?? null,
          doc_type: e.doc_type ?? null,
          note: (e as any).note ?? null,
          receipt_photo_url: e.receipt_photo_url ?? null,
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
  revalidatePath('/manager/dashboard')
  revalidatePath('/manager/history')
  revalidatePath('/hq/ck')
  revalidatePath('/hq/accounting')
  return { success: true, id: recordId }
}

export async function reviewCKDailyRecord(
  ckStoreId: string,
  date: string,
  decision: 'verified' | 'disputed',
  note?: string
) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  const profile = await getUserPermissionProfile(ctx.userId)
  if (!canReviewClosings(profile)) return { error: '權限不足，請先開啟帳目審核權限' }

  const admin = createAdminClient()
  const { data: existing, error: findError } = await admin
    .from('ck_daily_records')
    .select('id, status')
    .eq('ck_store_id', ckStoreId)
    .eq('business_date', date)
    .maybeSingle()
  if (findError) return { error: findError.message }
  if (!existing) return { error: '找不到央廚帳目' }

  const now = new Date().toISOString()
  const { error } = await admin
    .from('ck_daily_records')
    .update({
      status: decision,
      review_note: decision === 'disputed' ? (note?.trim() || '總公司退回修改') : null,
      reviewed_at: now,
      reviewed_by: ctx.userId,
      updated_at: now,
    })
    .eq('id', existing.id)
  if (error) return { error: error.message }

  await logAudit({
    eventType: 'ck_record_update',
    storeId: ckStoreId,
    userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} ${decision === 'verified' ? '審核通過' : '退回'}央廚 ${date} 帳目`,
    metadata: { business_date: date, decision, note: note ?? null },
  })

  revalidatePath('/hq/ck')
  revalidatePath('/hq/accounting')
  revalidatePath('/manager/ck')
  revalidatePath('/manager/history')
  revalidatePath('/manager/dashboard')
  return { success: true }
}

export async function deleteCKDailyRecord(ckStoreId: string, date: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  const profile = await getUserPermissionProfile(ctx.userId)
  if (!canReviewClosings(profile)) return { error: '權限不足，請先開啟帳目審核權限' }

  const admin = createAdminClient()
  const { data: existing, error: findError } = await admin
    .from('ck_daily_records')
    .select('id')
    .eq('ck_store_id', ckStoreId)
    .eq('business_date', date)
    .maybeSingle()
  if (findError) return { error: findError.message }
  if (!existing) return { error: '找不到央廚帳目' }

  const { error } = await admin.from('ck_daily_records').delete().eq('id', existing.id)
  if (error) return { error: error.message }

  await logAudit({
    eventType: 'closing_delete',
    storeId: ckStoreId,
    userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} 刪除央廚 ${date} 帳目`,
    metadata: { business_date: date },
  })

  revalidatePath('/hq/ck')
  revalidatePath('/hq/accounting')
  revalidatePath('/manager/ck')
  revalidatePath('/manager/history')
  revalidatePath('/manager/dashboard')
  return { success: true }
}

// 設定央廚服務的體系內店家
export async function updateCKAssignedStores(ckStoreId: string, assignedStoreIds: string[]) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!(await canManageCKStoreSettings(ctx))) return { error: '權限不足，請先開啟「可管理央廚店家」權限' }

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
  if (!(await canManageCKStoreSettings(ctx))) return { error: '權限不足，請先開啟「可管理央廚店家」權限' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ck_external_stores')
    .insert({ ck_store_id: ckStoreId, name })
    .select('id, name')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/manager/ck')
  revalidatePath('/hq/stores')
  return { success: true, store: data }
}

// 刪除體系外店家
export async function deleteCKExternalStore(id: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const admin = createAdminClient()
  const { data: ext } = await admin.from('ck_external_stores').select('ck_store_id').eq('id', id).single()
  if (!ext) return { error: '找不到此體系外店家' }
  if (!(await canManageCKStoreSettings(ctx))) return { error: '權限不足，請先開啟「可管理央廚店家」權限' }

  const { error } = await admin.from('ck_external_stores').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/manager/ck')
  revalidatePath('/hq/stores')
  return { success: true }
}

// 更新體系外店家名稱
export async function updateCKExternalStore(id: string, name: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const admin = createAdminClient()
  const { data: ext } = await admin.from('ck_external_stores').select('ck_store_id').eq('id', id).single()
  if (!ext) return { error: '找不到此體系外店家' }
  if (!(await canManageCKStoreSettings(ctx))) return { error: '權限不足，請先開啟「可管理央廚店家」權限' }

  const { error } = await admin.from('ck_external_stores').update({ name }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/manager/ck')
  revalidatePath('/hq/stores')
  return { success: true }
}

// 總公司送出/取消央廚補款
export async function markCKHQPaid(
  ckStoreId: string,
  date: string,
  paid: boolean,
  photoUrls: string[] = []
) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  const profile = await getUserPermissionProfile(ctx.userId)
  if (!canReviewClosings(profile)) return { error: '權限不足，請先開啟帳目審核權限' }
  if (paid && photoUrls.length === 0) return { error: '請先上傳補款信封照片' }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const patch = paid
    ? {
        hq_paid: true,
        hq_paid_at: now,
        hq_reimbursement_photo_urls: photoUrls,
        hq_reimbursement_sent_at: now,
        ck_reimbursement_confirmed: false,
        ck_reimbursement_confirmed_at: null,
        ck_reimbursement_confirmed_by: null,
        updated_at: now,
      }
    : {
        hq_paid: false,
        hq_paid_at: null,
        hq_reimbursement_photo_urls: [],
        hq_reimbursement_sent_at: null,
        ck_reimbursement_confirmed: false,
        ck_reimbursement_confirmed_at: null,
        ck_reimbursement_confirmed_by: null,
        updated_at: now,
      }

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
      .update(patch)
      .eq('id', existing.id))
  } else {
    ;({ error } = await admin
      .from('ck_daily_records')
      .insert({
        ck_store_id: ckStoreId,
        business_date: date,
        ...patch,
      }))
  }

  if (error) return { error: error.message }

  await logAudit({
    eventType: 'ck_hq_paid',
    storeId: ckStoreId, userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} ${paid ? '送出' : '取消'}央廚 ${date} 補款`,
    metadata: { paid, business_date: date, photo_count: paid ? photoUrls.length : 0 },
  })

  revalidatePath('/hq/ck')
  revalidatePath('/hq/accounting')
  revalidatePath('/manager/ck')
  revalidatePath('/manager/dashboard')
  return { success: true }
}

// 央廚確認已點交補款
export async function confirmCKReimbursementHandoff(ckStoreId: string, date: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!canAccessStore(ctx, ckStoreId)) return { error: '無權限存取此央廚' }

  const admin = createAdminClient()
  const { data: existing, error: findError } = await admin
    .from('ck_daily_records')
    .select('id, hq_paid')
    .eq('ck_store_id', ckStoreId)
    .eq('business_date', date)
    .maybeSingle()
  if (findError) return { error: findError.message }
  if (!existing) return { error: '找不到央廚帳目' }
  if (!(existing as any).hq_paid) return { error: '總公司尚未送出補款' }

  const now = new Date().toISOString()
  const { error } = await admin
    .from('ck_daily_records')
    .update({
      ck_reimbursement_confirmed: true,
      ck_reimbursement_confirmed_at: now,
      ck_reimbursement_confirmed_by: ctx.userId,
      updated_at: now,
    })
    .eq('id', existing.id)

  if (error) return { error: error.message }

  await logAudit({
    eventType: 'ck_hq_paid',
    storeId: ckStoreId,
    userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} 已點交央廚 ${date} 補款`,
    metadata: { business_date: date, handoff_confirmed: true },
  })

  revalidatePath('/manager/ck')
  revalidatePath('/manager/dashboard')
  revalidatePath('/hq/ck')
  revalidatePath('/hq/accounting')
  return { success: true }
}
