'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, revalidateTag } from 'next/cache'

async function requireHQManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入', user: null }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && !['老闆', '經理', '總監'].includes(profile?.role ?? '')) {
    return { error: '權限不足，僅限總公司管理人員', user: null }
  }
  return { error: null, user }
}

// ───────────────────────────────────────────────────
// system_vendor_groups CRUD
// ───────────────────────────────────────────────────
export async function createVendorGroup(input: { name: string; kind: string; sort_order?: number; description?: string }) {
  const { error: authErr } = await requireHQManager()
  if (authErr) return { error: authErr }
  if (!input.name?.trim()) return { error: '請填寫分類名稱' }

  const admin = createAdminClient()
  const { data, error } = await admin.from('system_vendor_groups').insert({
    name: input.name.trim(),
    kind: input.kind,
    sort_order: input.sort_order ?? 100,
    description: input.description,
  }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/hq/system-config')
  return { success: true, id: data.id }
}

export async function updateVendorGroup(id: string, patch: { name?: string; kind?: string; sort_order?: number; active?: boolean; description?: string; doc_type?: string | null; tax_mode?: 'inclusive' | 'free' }) {
  const { error: authErr } = await requireHQManager()
  if (authErr) return { error: authErr }
  const admin = createAdminClient()
  const cleanPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) cleanPatch.name = patch.name.trim()
  if (patch.kind !== undefined) cleanPatch.kind = patch.kind
  if (patch.sort_order !== undefined) cleanPatch.sort_order = patch.sort_order
  if (patch.active !== undefined) cleanPatch.active = patch.active
  if (patch.description !== undefined) cleanPatch.description = patch.description
  if (patch.doc_type !== undefined) cleanPatch.doc_type = patch.doc_type
  if (patch.tax_mode !== undefined) cleanPatch.tax_mode = patch.tax_mode
  const { error } = await admin.from('system_vendor_groups').update(cleanPatch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/hq/system-config')
  return { success: true }
}

export async function deleteVendorGroup(id: string) {
  const { error: authErr } = await requireHQManager()
  if (authErr) return { error: authErr }
  const admin = createAdminClient()
  // 檢查是否有 system_items 引用
  const { count } = await admin.from('system_items').select('id', { count: 'exact', head: true }).eq('vendor_group_id', id)
  if ((count ?? 0) > 0) return { error: `此分類下還有 ${count} 個品項，請先移除或改分類` }
  const { error } = await admin.from('system_vendor_groups').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/hq/system-config')
  return { success: true }
}

export async function reorderVendorGroups(ids: string[]) {
  const { error: authErr } = await requireHQManager()
  if (authErr) return { error: authErr }
  const admin = createAdminClient()
  for (let i = 0; i < ids.length; i++) {
    await admin.from('system_vendor_groups').update({ sort_order: (i + 1) * 10 }).eq('id', ids[i])
  }
  revalidatePath('/hq/system-config')
  return { success: true }
}

// ───────────────────────────────────────────────────
// system_items CRUD
// ───────────────────────────────────────────────────
export async function createSystemItem(input: { name: string; category: string; vendor_group_id: string | null; default_enabled?: boolean; sort_order?: number }) {
  const { error: authErr } = await requireHQManager()
  if (authErr) return { error: authErr }
  if (!input.name?.trim()) return { error: '請填寫品項名稱' }

  const admin = createAdminClient()
  const { data, error } = await admin.from('system_items').insert({
    name: input.name.trim(),
    category: input.category,
    vendor_group_id: input.vendor_group_id,
    default_enabled: input.default_enabled ?? false,
    sort_order: input.sort_order ?? 100,
  }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/hq/system-config')
  return { success: true, id: data.id }
}

export async function updateSystemItem(id: string, patch: { name?: string; category?: string; vendor_group_id?: string | null; default_enabled?: boolean; sort_order?: number; active?: boolean }) {
  const { error: authErr } = await requireHQManager()
  if (authErr) return { error: authErr }
  const admin = createAdminClient()
  const cleanPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) cleanPatch.name = patch.name.trim()
  if (patch.category !== undefined) cleanPatch.category = patch.category
  if (patch.vendor_group_id !== undefined) cleanPatch.vendor_group_id = patch.vendor_group_id
  if (patch.default_enabled !== undefined) cleanPatch.default_enabled = patch.default_enabled
  if (patch.sort_order !== undefined) cleanPatch.sort_order = patch.sort_order
  if (patch.active !== undefined) cleanPatch.active = patch.active
  const { error } = await admin.from('system_items').update(cleanPatch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/hq/system-config')
  return { success: true }
}

export async function deleteSystemItem(id: string) {
  const { error: authErr } = await requireHQManager()
  if (authErr) return { error: authErr }
  const admin = createAdminClient()
  // 檢查是否有 store_items 引用
  const { count } = await admin.from('store_items').select('id', { count: 'exact', head: true }).eq('system_item_id', id)
  if ((count ?? 0) > 0) {
    // 軟刪除：active=false
    await admin.from('system_items').update({ active: false }).eq('id', id)
    return { success: true, soft: true, message: `已有 ${count} 個店家在用此品項，已停用而非刪除` }
  }
  const { error } = await admin.from('system_items').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/hq/system-config')
  return { success: true }
}

export async function reorderSystemItems(ids: string[]) {
  const { error: authErr } = await requireHQManager()
  if (authErr) return { error: authErr }
  const admin = createAdminClient()
  // 平行跑所有 update（比 for loop 序列快 10 倍以上），不再 revalidatePath（client 自己用 optimistic state）
  await Promise.all(
    ids.map((id, i) => admin.from('system_items').update({ sort_order: (i + 1) * 10 }).eq('id', id))
  )
  return { success: true }
}
