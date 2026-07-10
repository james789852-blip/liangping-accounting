'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessStore, getAuthContext } from '@/lib/permissions'

type ActionResult = { success?: true; merged?: boolean; error?: string }

type ActualVendorRow = {
  id: string
  store_id: string
  vendor_group: string
  name: string
}

function normalizeActualVendorName(name?: string | null) {
  return (name ?? '').replace(/[\s　]+/g, '').trim()
}

async function getVendorForAction(id: string): Promise<{ row?: ActualVendorRow; error?: string }> {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('store_actual_vendors')
    .select('id, store_id, vendor_group, name')
    .eq('id', id)
    .single()

  if (error || !data) return { error: '找不到此實際廠商' }
  if (!canAccessStore(ctx, data.store_id as string)) return { error: '無權限存取此店家' }

  return { row: data as ActualVendorRow }
}

function revalidateActualVendorPages() {
  revalidatePath('/manager/settings')
  revalidatePath('/manager/closing')
  revalidatePath('/manager/analytics')
  revalidatePath('/manager/export')
  revalidatePath('/hq/accounting')
}

async function syncReceiptActualVendorName(row: ActualVendorRow, nextName: string) {
  const admin = createAdminClient()
  return admin
    .from('receipts')
    .update({
      actual_vendor_name: nextName,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', row.store_id)
    .eq('vendor_name', row.vendor_group)
    .eq('actual_vendor_name', row.name)
}

export async function updateActualVendorName(id: string, rawName: string): Promise<ActionResult> {
  const { row, error } = await getVendorForAction(id)
  if (error || !row) return { error }

  const nextName = normalizeActualVendorName(rawName)
  if (!nextName) return { error: '請輸入實際廠商名稱' }
  if (nextName === row.name) return { success: true }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('store_actual_vendors')
    .select('id, name')
    .eq('store_id', row.store_id)
    .eq('vendor_group', row.vendor_group)
    .eq('name', nextName)
    .maybeSingle()

  if (existing?.id && existing.id !== row.id) {
    const { error: syncError } = await syncReceiptActualVendorName(row, existing.name as string)
    if (syncError) return { error: syncError.message }

    const { error: deactivateError } = await admin
      .from('store_actual_vendors')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', row.id)

    if (deactivateError) return { error: deactivateError.message }
    revalidateActualVendorPages()
    return { success: true, merged: true }
  }

  const { error: updateError } = await admin
    .from('store_actual_vendors')
    .update({ name: nextName, active: true, updated_at: new Date().toISOString() })
    .eq('id', row.id)

  if (updateError) return { error: updateError.message }

  const { error: syncError } = await syncReceiptActualVendorName(row, nextName)
  if (syncError) return { error: syncError.message }

  revalidateActualVendorPages()
  return { success: true }
}

export async function deactivateActualVendor(id: string): Promise<ActionResult> {
  const { row, error } = await getVendorForAction(id)
  if (error || !row) return { error }

  const admin = createAdminClient()
  const { error: updateError } = await admin
    .from('store_actual_vendors')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', row.id)

  if (updateError) return { error: updateError.message }
  revalidateActualVendorPages()
  return { success: true }
}

