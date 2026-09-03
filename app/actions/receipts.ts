'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getAuthContext, canAccessStore } from '@/lib/permissions'
import { buildAuditChanges, logAudit } from '@/lib/audit'
import { normalizeItemAmount } from '@/lib/negative-items'
import { getNegativeItemMappingIds } from '@/lib/item-mapping-negative'
import { receiptDateWriteError } from '@/lib/receipt-write-access'
import { syncSingleReceiptItemAmount } from '@/lib/receipt-amount-consistency'

interface ReceiptItemPayload {
  item_name: string
  item_category: string
  amount: number
  excel_column: string
  quantity?: number
  unit?: string
  unit_price?: number
  item_mapping_id?: string | null
  vendor_group_snapshot?: string | null
}

interface SaveReceiptPayload {
  storeId: string
  businessDate: string
  vendorName: string
  actualVendorName?: string
  receiptType: string
  totalAmount: number
  taxAmount: number
  photoUrl: string
  notes: string
  items: ReceiptItemPayload[]
  expectedUpdatedAt?: string | null
}

const RECEIPT_AUDIT_LABELS: Record<string, string> = {
  business_date: '帳目日期',
  vendor_name: '廠商／分類',
  actual_vendor_name: '實際廠商',
  receipt_type: '單據類型',
  total_amount: '單據總額',
  tax_amount: '稅額',
  notes: '備註',
  has_photo: '是否有照片',
  items: '品項明細',
  status: '狀態',
}

function receiptAuditSnapshot(
  receipt: Record<string, unknown>,
  items: Array<Record<string, unknown>>,
) {
  return {
    business_date: receipt.business_date ?? null,
    vendor_name: receipt.vendor_name ?? null,
    actual_vendor_name: receipt.actual_vendor_name ?? null,
    receipt_type: receipt.receipt_type ?? null,
    total_amount: receipt.total_amount ?? null,
    tax_amount: receipt.tax_amount ?? null,
    notes: receipt.notes ?? null,
    has_photo: Boolean(receipt.photo_url),
    status: receipt.status ?? null,
    items: items.map(item => ({
      item_name: item.item_name ?? null,
      item_category: item.item_category ?? null,
      amount: item.amount ?? null,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      unit_price: item.unit_price ?? null,
      excel_column: item.excel_column ?? null,
    })),
  }
}

function normalizeActualVendorName(name?: string | null) {
  return (name ?? '').replace(/[\s　]+/g, '').trim()
}

async function rememberActualVendor(admin: ReturnType<typeof createAdminClient>, storeId: string, vendorGroup: string, name?: string) {
  const trimmed = normalizeActualVendorName(name)
  if (!trimmed) return
  await admin.from('store_actual_vendors').upsert({
    store_id: storeId,
    vendor_group: vendorGroup.trim() || '未分類',
    name: trimmed,
    active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'store_id,vendor_group,name' })
}

export async function saveReceipt(payload: SaveReceiptPayload) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!canAccessStore(ctx, payload.storeId)) return { error: '無權限存取此店家' }

  const admin = createAdminClient()
  const lockError = await receiptDateWriteError(admin, payload.storeId, payload.businessDate)
  if (lockError) return { error: lockError }

  const { data: receipt, error: rErr } = await admin
    .from('receipts')
    .insert({
      store_id: payload.storeId,
      business_date: payload.businessDate,
      vendor_name: payload.vendorName,
      actual_vendor_name: normalizeActualVendorName(payload.actualVendorName) || null,
      receipt_type: payload.receiptType,
      total_amount: payload.totalAmount,
      tax_amount: payload.taxAmount,
      photo_url: payload.photoUrl,
      notes: payload.notes,
      status: 'draft',
      created_by: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (rErr || !receipt) return { error: rErr?.message ?? '儲存失敗' }

  const normalizedItems = syncSingleReceiptItemAmount(payload.items, payload.totalAmount, payload.taxAmount)
  let persistedItems: Array<Record<string, unknown>> = []
  if (normalizedItems.length > 0) {
    const negativeMappingIds = await getNegativeItemMappingIds(admin, payload.storeId)
    persistedItems = normalizedItems.map(item => ({
      ...item,
      amount: normalizeItemAmount(item.item_name, item.amount, !!item.item_mapping_id && negativeMappingIds.has(item.item_mapping_id)),
      receipt_id: receipt.id,
    }))
    const { error: itemError } = await admin.from('receipt_items').insert(persistedItems)
    if (itemError) {
      // receipts -> receipt_items 是 cascade 關聯；刪除主檔可完整回滾本次新增。
      await admin.from('receipts').delete().eq('id', receipt.id)
      return { error: `品項儲存失敗：${itemError.message}` }
    }
  }

  await rememberActualVendor(admin, payload.storeId, payload.vendorName, payload.actualVendorName)

  const after = receiptAuditSnapshot({
    business_date: payload.businessDate,
    vendor_name: payload.vendorName,
    actual_vendor_name: normalizeActualVendorName(payload.actualVendorName) || null,
    receipt_type: payload.receiptType,
    total_amount: payload.totalAmount,
    tax_amount: payload.taxAmount,
    photo_url: payload.photoUrl,
    notes: payload.notes,
    status: 'draft',
  }, persistedItems)
  await logAudit({
    eventType: 'receipt_create',
    storeId: payload.storeId,
    userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} 新增收據（${payload.vendorName} $${Math.round(payload.totalAmount).toLocaleString()}）`,
    metadata: {
      entity: { type: 'receipt', id: receipt.id },
      business_date: payload.businessDate,
      after,
      changes: buildAuditChanges({}, after, RECEIPT_AUDIT_LABELS),
    },
  })

  revalidatePath('/manager/receipts')
  return { success: true, id: receipt.id }
}

export async function deleteReceipt(receiptId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .from('receipts')
    .select('store_id, vendor_name, actual_vendor_name, receipt_type, total_amount, tax_amount, business_date, photo_url, notes, status, receipt_items(*)')
    .eq('id', receiptId)
    .single()
  if (readError || !existing) return { error: '找不到此收據' }

  const storeId = existing.store_id as string
  if (!canAccessStore(ctx, storeId)) return { error: '無權限存取此收據' }
  const lockError = await receiptDateWriteError(admin, storeId, existing.business_date as string)
  if (lockError) return { error: lockError }

  const previousItems = Array.isArray(existing.receipt_items) ? existing.receipt_items : []
  const { error: itemDeleteError } = await admin.from('receipt_items').delete().eq('receipt_id', receiptId)
  if (itemDeleteError) return { error: `收據品項刪除失敗：${itemDeleteError.message}` }

  const { error } = await admin.from('receipts').delete().eq('id', receiptId)

  if (error) {
    if (previousItems.length > 0) {
      await admin.from('receipt_items').insert(previousItems.map(item => ({
        receipt_id: receiptId,
        item_name: item.item_name,
        item_category: item.item_category,
        amount: item.amount,
        excel_column: item.excel_column,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        item_mapping_id: item.item_mapping_id,
        vendor_group_snapshot: item.vendor_group_snapshot,
      })))
    }
    return { error: error.message }
  }

  const before = receiptAuditSnapshot(existing, previousItems)
  await logAudit({
    eventType: 'receipt_delete',
    severity: 'warn',
    storeId,
    userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} 刪除收據（${existing?.vendor_name ?? '?'} $${Math.round((existing?.total_amount as number) ?? 0).toLocaleString()}）`,
    metadata: {
      entity: { type: 'receipt', id: receiptId },
      business_date: existing.business_date,
      before,
      changes: buildAuditChanges(before, {}, RECEIPT_AUDIT_LABELS),
    },
  })

  revalidatePath('/manager/receipts')
  return { success: true }
}

export async function updateReceipt(
  receiptId: string,
  payload: Omit<SaveReceiptPayload, 'storeId'>
) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .from('receipts')
    .select('store_id, business_date, vendor_name, actual_vendor_name, receipt_type, total_amount, tax_amount, photo_url, notes, status, updated_at, receipt_items(*)')
    .eq('id', receiptId)
    .single()
  if (readError || !existing) return { error: '找不到此收據' }

  const storeId = existing.store_id as string
  if (!canAccessStore(ctx, storeId)) return { error: '無權限存取此收據' }
  if (payload.expectedUpdatedAt && existing.updated_at !== payload.expectedUpdatedAt) {
    return { error: '這筆單據已被其他人更新，請重新整理後再修改' }
  }

  const currentDateLockError = await receiptDateWriteError(admin, storeId, existing.business_date as string)
  if (currentDateLockError) return { error: currentDateLockError }
  if (payload.businessDate !== existing.business_date) {
    const targetDateLockError = await receiptDateWriteError(admin, storeId, payload.businessDate)
    if (targetDateLockError) return { error: targetDateLockError }
  }

  const receiptUpdatedAt = new Date().toISOString()
  let receiptUpdateQuery = admin
    .from('receipts')
    .update({
      business_date: payload.businessDate,
      vendor_name: payload.vendorName,
      actual_vendor_name: normalizeActualVendorName(payload.actualVendorName) || null,
      receipt_type: payload.receiptType,
      total_amount: payload.totalAmount,
      tax_amount: payload.taxAmount,
      photo_url: payload.photoUrl,
      notes: payload.notes,
      updated_at: receiptUpdatedAt,
    })
    .eq('id', receiptId)
  if (payload.expectedUpdatedAt) receiptUpdateQuery = receiptUpdateQuery.eq('updated_at', payload.expectedUpdatedAt)
  const { data: updatedReceipt, error: rErr } = await receiptUpdateQuery.select('updated_at').maybeSingle()

  if (rErr) return { error: rErr.message }
  if (!updatedReceipt) return { error: '這筆單據已被其他人更新，請重新整理後再修改' }
  const { error: deleteItemsError } = await admin.from('receipt_items').delete().eq('receipt_id', receiptId)
  if (deleteItemsError) {
    await admin.from('receipts').update({
      business_date: existing.business_date,
      vendor_name: existing.vendor_name,
      actual_vendor_name: existing.actual_vendor_name,
      receipt_type: existing.receipt_type,
      total_amount: existing.total_amount,
      tax_amount: existing.tax_amount,
      photo_url: existing.photo_url,
      notes: existing.notes,
      updated_at: existing.updated_at,
    }).eq('id', receiptId)
    return { error: `品項更新失敗：${deleteItemsError.message}` }
  }

  const normalizedItems = syncSingleReceiptItemAmount(payload.items, payload.totalAmount, payload.taxAmount)
  let persistedItems: Array<Record<string, unknown>> = []
  if (normalizedItems.length > 0) {
    const negativeMappingIds = await getNegativeItemMappingIds(admin, storeId)
    persistedItems = normalizedItems.map(item => ({
      ...item,
      amount: normalizeItemAmount(item.item_name, item.amount, !!item.item_mapping_id && negativeMappingIds.has(item.item_mapping_id)),
      receipt_id: receiptId,
    }))
    const { error: itemError } = await admin.from('receipt_items').insert(persistedItems)
    if (itemError) {
      await admin.from('receipts').update({
        business_date: existing.business_date,
        vendor_name: existing.vendor_name,
        actual_vendor_name: existing.actual_vendor_name,
        receipt_type: existing.receipt_type,
        total_amount: existing.total_amount,
        tax_amount: existing.tax_amount,
        photo_url: existing.photo_url,
        notes: existing.notes,
        updated_at: existing.updated_at,
      }).eq('id', receiptId)
      const previousItems = Array.isArray(existing.receipt_items) ? existing.receipt_items : []
      if (previousItems.length > 0) {
        await admin.from('receipt_items').insert(previousItems.map(item => ({
          receipt_id: receiptId,
          item_name: item.item_name,
          item_category: item.item_category,
          amount: item.amount,
          excel_column: item.excel_column,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          item_mapping_id: item.item_mapping_id,
          vendor_group_snapshot: item.vendor_group_snapshot,
        })))
      }
      return { error: `品項儲存失敗：${itemError.message}` }
    }
  }

  await rememberActualVendor(admin, storeId, payload.vendorName, payload.actualVendorName)

  const before = receiptAuditSnapshot(existing, Array.isArray(existing.receipt_items) ? existing.receipt_items : [])
  const after = receiptAuditSnapshot({
    business_date: payload.businessDate,
    vendor_name: payload.vendorName,
    actual_vendor_name: normalizeActualVendorName(payload.actualVendorName) || null,
    receipt_type: payload.receiptType,
    total_amount: payload.totalAmount,
    tax_amount: payload.taxAmount,
    photo_url: payload.photoUrl,
    notes: payload.notes,
    status: existing.status,
  }, persistedItems)
  await logAudit({
    eventType: 'receipt_update',
    storeId,
    userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} 修改收據（${payload.vendorName} $${Math.round(payload.totalAmount).toLocaleString()}）`,
    metadata: {
      entity: { type: 'receipt', id: receiptId },
      business_date: payload.businessDate,
      before,
      after,
      changes: buildAuditChanges(before, after, RECEIPT_AUDIT_LABELS),
    },
  })

  revalidatePath('/manager/receipts')
  revalidatePath('/manager/order')
  return { success: true, updatedAt: updatedReceipt.updated_at ?? receiptUpdatedAt }
}

export async function updateReceiptStatus(receiptId: string, status: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .from('receipts')
    .select('store_id, business_date')
    .eq('id', receiptId)
    .single()
  if (readError || !existing) return { error: '找不到此收據' }

  const storeId = existing.store_id as string
  if (!canAccessStore(ctx, storeId)) return { error: '無權限存取此收據' }
  const lockError = await receiptDateWriteError(admin, storeId, existing.business_date as string)
  if (lockError) return { error: lockError }

  const { error } = await admin
    .from('receipts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', receiptId)

  if (error) return { error: error.message }
  revalidatePath('/manager/receipts')
  return { success: true }
}
