'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

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
      created_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (rErr || !receipt) return { error: rErr?.message ?? '儲存失敗' }

  if (payload.items.length > 0) {
    await admin.from('receipt_items').insert(
      payload.items.map(item => ({ ...item, receipt_id: receipt.id }))
    )
  }

  revalidatePath('/manager/receipts')
  return { success: true, id: receipt.id }
}

export async function deleteReceipt(receiptId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const admin = createAdminClient()
  await admin.from('receipt_items').delete().eq('receipt_id', receiptId)
  const { error } = await admin.from('receipts').delete().eq('id', receiptId)

  if (error) return { error: error.message }
  revalidatePath('/manager/receipts')
  return { success: true }
}

export async function updateReceiptStatus(receiptId: string, status: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('receipts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', receiptId)

  if (error) return { error: error.message }
  revalidatePath('/manager/receipts')
  return { success: true }
}
