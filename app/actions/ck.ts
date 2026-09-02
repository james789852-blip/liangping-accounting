'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { getAuthContext, canAccessStore } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import { recordCKReimbursementAdjustment } from '@/lib/ck-reimbursement-adjustment'
import {
  ckOrderNeedsDeliveryPhoto,
  ckOrderNeedsTransferPhoto,
  normalizeCKDeliveryPhotoUrls,
  normalizeCKTransferPhotoUrls,
} from '@/lib/ck-delivery-photos'
import {
  canManageCKSettings as canManageCKSettingsPermission,
  canReviewClosings,
} from '@/lib/user-permissions'
import { normalizeItemAmount } from '@/lib/negative-items'
import { syncCKMonthToSheets as syncCKMonthToSheetsImpl } from '@/lib/google-sheets'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

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

// 同步央廚月份資料到 Google 試算表（內容與央廚 Excel 匯出一致）。
export async function syncCKMonthToSheets(ckStoreId: string, month: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!ckStoreId?.trim()) return { error: '請選擇央廚' }
  if (!MONTH_PATTERN.test(month)) return { error: '月份格式錯誤' }

  const profile = await getUserPermissionProfile(ctx.userId)
  if (!canReviewClosings(profile) && !canManageCKSettingsPermission(profile)) {
    return { error: '權限不足，請先開啟央廚店家管理或帳目審核權限' }
  }

  try {
    await syncCKMonthToSheetsImpl(ckStoreId, month)
    return { success: true as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[syncCKMonthToSheets] failed:', error)
    await logAudit({
      eventType: 'sheets_sync_failed',
      severity: 'warn',
      storeId: ckStoreId,
      userId: ctx.userId,
      description: `央廚 ${month} 試算表同步失敗`,
      metadata: { error: message, month },
    })
    return { error: message }
  }
}

// 央廚管理人員輸入各店配送金額。
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

// 儲存央廚每日記錄（含體系外叫貨 + 支出）
export async function saveCKDailyRecord(ckStoreId: string, date: string, data: {
  payerName?: string
  note?: string
  status?: 'draft' | 'submitted'
  memberOrders?: { storeId: string; confirmedAmount: number | null }[]
  externalOrders?: { name: string; amount: number; deliveryPhotoUrls?: string[]; transferPhotoUrls?: string[] }[]
  expenses?: { category: string; item_name: string; amount: number; payer_name?: string; vendor_group?: string; doc_type?: string; note?: string; receipt_photo_url?: string }[]
  receiptPhotoUrls?: string[]
}) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!canAccessStore(ctx, ckStoreId)) return { error: '無權限存取此央廚' }

  const admin = createAdminClient()
  const memberOrders = data.memberOrders
  let externalOrders: Array<{
    name: string
    amount: number
    deliveryPhotoUrls: string[]
    transferPhotoUrls: string[]
    transferPhotoRequired: boolean
  }> | undefined

  if (data.externalOrders !== undefined) {
    if (data.externalOrders.length === 0) {
      externalOrders = []
    } else {
      const [configuredStoresResult, existingRecordResult] = await Promise.all([
        admin.from('ck_external_stores')
          .select('name, transfer_photo_required')
          .eq('ck_store_id', ckStoreId),
        admin.from('ck_daily_records')
          .select('id')
          .eq('ck_store_id', ckStoreId)
          .eq('business_date', date)
          .maybeSingle(),
      ])
      if (configuredStoresResult.error) return { error: configuredStoresResult.error.message }
      if (existingRecordResult.error) return { error: existingRecordResult.error.message }
      const configuredStores = configuredStoresResult.data
      const existingRecord = existingRecordResult.data
      const existingOrdersResult = existingRecord
        ? await admin.from('ck_store_orders')
            .select('external_store_name, transfer_photo_required')
            .eq('ck_daily_record_id', existingRecord.id)
            .is('store_id', null)
        : { data: [] }
      if ('error' in existingOrdersResult && existingOrdersResult.error) return { error: existingOrdersResult.error.message }
      const existingOrders = existingOrdersResult.data
      const configuredRequirementByName = new Map(
        (configuredStores ?? []).map(store => [String(store.name ?? '').trim(), Boolean(store.transfer_photo_required)]),
      )
      const existingRequirementByName = new Map(
        (existingOrders ?? []).map(order => [String(order.external_store_name ?? '').trim(), Boolean(order.transfer_photo_required)]),
      )

      externalOrders = data.externalOrders.map(order => {
        const name = order.name.trim()
        const transferPhotoRequired = existingRequirementByName.has(name)
          ? Boolean(existingRequirementByName.get(name))
          : Boolean(configuredRequirementByName.get(name))
        return {
          name,
          amount: Number(order.amount) || 0,
          deliveryPhotoUrls: normalizeCKDeliveryPhotoUrls(order.deliveryPhotoUrls),
          transferPhotoUrls: normalizeCKTransferPhotoUrls(order.transferPhotoUrls),
          transferPhotoRequired,
        }
      })
    }
  }

  if (data.status === 'submitted') {
    const missingExternalPhotos = externalOrders?.filter(order =>
      ckOrderNeedsDeliveryPhoto(order.amount, order.deliveryPhotoUrls),
    ).length ?? 0
    if (missingExternalPhotos > 0) {
      return { error: `有 ${missingExternalPhotos} 筆體系外叫貨尚未上傳配送單照片` }
    }
    const missingTransferPhotos = externalOrders?.filter(order =>
      ckOrderNeedsTransferPhoto(order.amount, order.transferPhotoRequired, order.transferPhotoUrls),
    ).map(order => order.name) ?? []
    if (missingTransferPhotos.length > 0) {
      return { error: `請先上傳轉帳成功照片：${missingTransferPhotos.join('、')}` }
    }
  }

  const { data: record, error } = await admin
    .from('ck_daily_records')
    .upsert(
      {
        ck_store_id: ckStoreId,
        business_date: date,
        payer_name: data.payerName ?? null,
        note: data.note ?? null,
        status: data.status ?? 'draft',
        submitted_by: data.status === 'submitted' ? ctx.userId : undefined,
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
  if (externalOrders !== undefined) {
    const { error: externalDeleteErr } = await admin.from('ck_store_orders')
      .delete()
      .eq('ck_daily_record_id', recordId)
      .is('store_id', null)
    if (externalDeleteErr) return { error: externalDeleteErr.message }

    if (externalOrders.length > 0) {
      const { error: externalInsertErr } = await admin.from('ck_store_orders').insert(
        externalOrders.map(o => ({
          ck_daily_record_id: recordId,
          external_store_name: o.name,
          amount: o.amount,
          delivery_photo_urls: o.deliveryPhotoUrls,
          transfer_photo_required: o.transferPhotoRequired,
          transfer_photo_urls: o.transferPhotoUrls,
        }))
      )
      if (externalInsertErr) return { error: externalInsertErr.message }
    }
  }

  // 體系內店家叫貨只保存央廚輸入金額；amount 不再存放店家自報。
  if (memberOrders !== undefined) {
    const cleaned = memberOrders.filter(o => o.storeId)

    const clearRows = cleaned.filter(o => o.confirmedAmount === null)
    for (const order of clearRows) {
      const { error: clearErr } = await admin
        .from('ck_store_orders')
        .update({
          ck_confirmed_amount: null,
          ck_confirmed_at: null,
          ck_confirmed_by: null,
        })
        .eq('ck_daily_record_id', recordId)
        .eq('store_id', order.storeId)
      if (clearErr) return { error: clearErr.message }
    }

    const upsertRows = cleaned
      .filter(o => o.confirmedAmount !== null)
      .map(o => ({
        ck_daily_record_id: recordId,
        store_id: o.storeId,
        amount: 0,
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
          amount: normalizeItemAmount(e.item_name, e.amount),
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
    metadata: {
      business_date: date,
      status: data.status,
      has_external: !!externalOrders,
      has_expenses: !!data.expenses,
      // 保留央廚實際送出的各店金額，日後可直接核對誰輸入了多少。
      member_orders: memberOrders?.map(order => ({
        store_id: order.storeId,
        confirmed_amount: order.confirmedAmount,
        delivery_photo_source: 'store_closing',
      })) ?? null,
      external_orders: externalOrders?.map(order => ({
        name: order.name,
        amount: order.amount,
        delivery_photo_count: order.deliveryPhotoUrls.length,
        transfer_photo_required: order.transferPhotoRequired,
        transfer_photo_count: order.transferPhotoUrls.length,
      })) ?? null,
    },
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

  if (decision === 'verified') {
    after(async () => {
      try {
        await syncCKMonthToSheetsImpl(ckStoreId, date.slice(0, 7))
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : String(syncError)
        console.error('[reviewCKDailyRecord] Google Sheets sync failed:', syncError)
        await logAudit({
          eventType: 'sheets_sync_failed',
          severity: 'warn',
          storeId: ckStoreId,
          userId: ctx.userId,
          description: `央廚 ${date.slice(0, 7)} 審核後試算表同步失敗`,
          metadata: { error: message, month: date.slice(0, 7), business_date: date },
        })
      }
    })
  }

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

// 設定體系外店家收入是否從央廚補款／點交金額扣除
export async function updateCKExternalStoreDeduction(id: string, deductFromReimbursement: boolean) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const admin = createAdminClient()
  const { data: ext } = await admin.from('ck_external_stores').select('ck_store_id').eq('id', id).single()
  if (!ext) return { error: '找不到此體系外店家' }
  if (!(await canManageCKStoreSettings(ctx))) return { error: '權限不足，請先開啟「可管理央廚店家」權限' }

  const { error } = await admin
    .from('ck_external_stores')
    .update({ deduct_from_reimbursement: deductFromReimbursement })
    .eq('id', id)
  if (error) return { error: error.message }

  await logAudit({
    eventType: 'store_update',
    storeId: ext.ck_store_id,
    userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} ${deductFromReimbursement ? '啟用' : '停用'}體系外店家扣除央廚補款`,
    metadata: { external_store_id: id, deduct_from_reimbursement: deductFromReimbursement },
  })

  revalidatePath('/manager/ck')
  revalidatePath('/hq/stores')
  revalidatePath('/hq/ck')
  revalidatePath('/hq/accounting')
  return { success: true }
}

// 設定體系外店家新帳目是否必須附上轉帳成功照片。
export async function updateCKExternalStoreTransferPhotoRequirement(id: string, required: boolean) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const admin = createAdminClient()
  const { data: ext } = await admin.from('ck_external_stores').select('ck_store_id, name').eq('id', id).single()
  if (!ext) return { error: '找不到此體系外店家' }
  if (!(await canManageCKStoreSettings(ctx))) return { error: '權限不足，請先開啟「可管理央廚店家」權限' }

  const { error } = await admin
    .from('ck_external_stores')
    .update({ transfer_photo_required: required })
    .eq('id', id)
  if (error) return { error: error.message }

  await logAudit({
    eventType: 'store_update',
    storeId: ext.ck_store_id,
    userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} ${required ? '啟用' : '停用'}體系外店家轉帳照片要求`,
    metadata: { external_store_id: id, external_store_name: ext.name, transfer_photo_required: required },
  })

  revalidatePath('/manager/ck')
  revalidatePath('/hq/stores')
  revalidatePath('/hq/ck')
  revalidatePath('/hq/accounting')
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

// 總公司上傳補款信封照片時立即保存草稿，避免在按下「送出補款」前
// 因審核通過、重新整理或切換頁面而遺失照片。
export async function saveCKHQReimbursementPhotoDraft(
  ckStoreId: string,
  date: string,
  photoUrls: string[],
) {
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
  if (!existing) return { error: '找不到央廚帳目，請先完成央廚做帳' }

  const { error } = await admin
    .from('ck_daily_records')
    .update({
      hq_reimbursement_photo_urls: photoUrls,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
  if (error) return { error: error.message }

  revalidatePath('/hq/ck')
  revalidatePath('/hq/accounting')
  return { success: true }
}

// 保存總公司補款加減調整。使用 audit_logs 留下每次修改歷程，最新一筆為目前金額。
export async function saveCKHQReimbursementAdjustment(
  ckStoreId: string,
  date: string,
  amount: number,
  note = '',
) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  const profile = await getUserPermissionProfile(ctx.userId)
  if (!canReviewClosings(profile)) return { error: '權限不足，請先開啟帳目審核權限' }
  if (!Number.isFinite(amount) || Math.abs(amount) > 100_000_000) return { error: '補款調整金額不正確' }

  const { error } = await recordCKReimbursementAdjustment({
    ckStoreId,
    date,
    userId: ctx.userId,
    userName: ctx.userName,
    userEmail: ctx.userEmail,
    amount,
    note,
  })
  if (error) return { error: error.message }

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
