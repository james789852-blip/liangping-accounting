'use server'

import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { canManageCKReceipts } from '@/lib/user-permissions'

async function checkHqAuth() {
  const supabase = await createClient()
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canManageCKReceipts(profile)) return { error: '無權限' as const }
  return { ok: true as const }
}

export interface CKVendorGroup {
  id: string
  ck_store_id: string
  name: string
  doc_type: string | null
  sort_order: number
  active: boolean
}

export async function fetchCKVendorGroups(ckStoreId: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { data, error } = await admin.from('ck_vendor_groups')
    .select('id, ck_store_id, name, doc_type, sort_order, active')
    .eq('ck_store_id', ckStoreId)
    .eq('active', true)
    .order('sort_order').order('name')
  if (error) return { error: error.message }
  return { success: true as const, groups: (data ?? []) as CKVendorGroup[] }
}

export async function createCKVendorGroup(ckStoreId: string, name: string, docType?: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!name.trim()) return { error: '名稱不能空' as const }
  const admin = createAdminClient()
  const { data: existing } = await admin.from('ck_vendor_groups')
    .select('id').eq('ck_store_id', ckStoreId).eq('name', name.trim()).maybeSingle()
  if (existing) return { error: '該廠商已存在' as const }
  const { data: max } = await admin.from('ck_vendor_groups')
    .select('sort_order').eq('ck_store_id', ckStoreId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = (max?.sort_order ?? 0) + 10
  const { error } = await admin.from('ck_vendor_groups').insert({
    ck_store_id: ckStoreId, name: name.trim(), doc_type: docType?.trim() || null,
    sort_order: nextOrder, active: true,
  })
  if (error) return { error: error.message }
  revalidatePath('/hq/receipt-settings')
  return { success: true as const }
}

export async function updateCKVendorGroup(id: string, patch: { name?: string; doc_type?: string | null; sort_order?: number }) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.doc_type !== undefined) update.doc_type = patch.doc_type
  if (patch.sort_order !== undefined) update.sort_order = patch.sort_order
  const { error } = await admin.from('ck_vendor_groups').update(update).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/hq/receipt-settings')
  return { success: true as const }
}

export async function deleteCKVendorGroup(id: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { error } = await admin.from('ck_vendor_groups').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/hq/receipt-settings')
  return { success: true as const }
}

export async function reorderCKVendorGroups(ids: string[]) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  await Promise.all(ids.map((id, i) =>
    admin.from('ck_vendor_groups').update({ sort_order: (i + 1) * 10, updated_at: new Date().toISOString() }).eq('id', id)
  ))
  revalidatePath('/hq/receipt-settings')
  return { success: true as const }
}
