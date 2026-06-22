'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getAuthContext, canAccessStore, getReceiptStoreId } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import { normalizeItemAmount } from '@/lib/negative-items'

interface ReceiptItemPayload {
  item_name: string
  item_category: string
  amount: number
  excel_column: string
}

interface SaveReceiptPayload {
  storeId: string
  businessDate: string
  vendorName: string
  receiptType: string
  totalAmount: number
  taxAmount: number
  photoUrl: string
  notes: string
  items: ReceiptItemPayload[]
}

export async function saveReceipt(payload: SaveReceiptPayload) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!canAccessStore(ctx, payload.storeId)) return { error: '無權限存取此店家' }

  const admin = createAdminClient()

  const { data: receipt, error: rErr } = await admin
    .from('receipts')
    .insert({
      store_id: payload.storeId,
      business_date: payload.businessDate,
      vendor_name: payload.vendorName,
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

  if (payload.items.length > 0) {
    await admin.from('receipt_items').insert(
      payload.items.map(item => ({ ...item, amount: normalizeItemAmount(item.item_name, item.amount), receipt_id: receipt.id }))
    )
  }

  await logAudit({
    eventType: 'receipt_create',
    storeId: payload.storeId,
    userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} 新增收據（${payload.vendorName} $${Math.round(payload.totalAmount).toLocaleString()}）`,
    metadata: { receipt_id: receipt.id, business_date: payload.businessDate, vendor: payload.vendorName, amount: payload.totalAmount },
  })

  revalidatePath('/manager/receipts')
  return { success: true, id: receipt.id }
}

export async function deleteReceipt(receiptId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  const storeId = await getReceiptStoreId(receiptId)
  if (!storeId) return { error: '找不到此收據' }
  if (!canAccessStore(ctx, storeId)) return { error: '無權限存取此收據' }

  const admin = createAdminClient()
  // 先讀取資料用於 audit
  const { data: existing } = await admin.from('receipts').select('vendor_name, total_amount, business_date').eq('id', receiptId).single()

  await admin.from('receipt_items').delete().eq('receipt_id', receiptId)
  const { error } = await admin.from('receipts').delete().eq('id', receiptId)

  if (error) return { error: error.message }

  await logAudit({
    eventType: 'receipt_delete',
    severity: 'warn',
    storeId,
    userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} 刪除收據（${existing?.vendor_name ?? '?'} $${Math.round((existing?.total_amount as number) ?? 0).toLocaleString()}）`,
    metadata: { receipt_id: receiptId, business_date: existing?.business_date, vendor: existing?.vendor_name, amount: existing?.total_amount },
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
  const storeId = await getReceiptStoreId(receiptId)
  if (!storeId) return { error: '找不到此收據' }
  if (!canAccessStore(ctx, storeId)) return { error: '無權限存取此收據' }

  const admin = createAdminClient()
  const { error: rErr } = await admin
    .from('receipts')
    .update({
      business_date: payload.businessDate,
      vendor_name: payload.vendorName,
      receipt_type: payload.receiptType,
      total_amount: payload.totalAmount,
      tax_amount: payload.taxAmount,
      notes: payload.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', receiptId)

  if (rErr) return { error: rErr.message }

  await admin.from('receipt_items').delete().eq('receipt_id', receiptId)
  if (payload.items.length > 0) {
    await admin.from('receipt_items').insert(
      payload.items.map(item => ({ ...item, amount: normalizeItemAmount(item.item_name, item.amount), receipt_id: receiptId }))
    )
  }

  await logAudit({
    eventType: 'receipt_update',
    storeId,
    userId: ctx.userId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} 修改收據（${payload.vendorName} $${Math.round(payload.totalAmount).toLocaleString()}）`,
    metadata: { receipt_id: receiptId, business_date: payload.businessDate, vendor: payload.vendorName, amount: payload.totalAmount },
  })

  revalidatePath('/manager/receipts')
  revalidatePath('/manager/order')
  return { success: true }
}

export async function updateReceiptStatus(receiptId: string, status: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  const storeId = await getReceiptStoreId(receiptId)
  if (!storeId) return { error: '找不到此收據' }
  if (!canAccessStore(ctx, storeId)) return { error: '無權限存取此收據' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('receipts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', receiptId)

  if (error) return { error: error.message }
  revalidatePath('/manager/receipts')
  return { success: true }
}
