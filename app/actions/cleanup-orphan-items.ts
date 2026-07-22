'use server'

import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function checkHqAuth() {
  const supabase = await createClient()
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '無權限' as const }
  return { ok: true as const }
}

export interface OrphanItem {
  store_item_id: string
  store_id: string
  store_name: string
  system_item_id: string
  item_name: string
  category: string
  vendor_group: string | null
  isSystemReserved: boolean  // 「其他（發票）」等系統必要品項，建議保留
}

/**
 * 撈所有 orphan store_items：
 *   store 有 enable 但該店 item_column_mappings + 全域 mappings 都沒對應
 */
export async function fetchOrphanStoreItems(): Promise<{ error: string } | { success: true; orphans: OrphanItem[] }> {
  const auth = await checkHqAuth()
  if ('error' in auth) return { error: auth.error as string }

  const admin = createAdminClient()
  const { fetchAllPaged } = await import('@/lib/supabase-paged')
  const [mappings, { data: sysItems }, storeItems, { data: stores }, { data: vgs }] = await Promise.all([
    fetchAllPaged<any>(() => admin.from('item_column_mappings').select('item_name, store_id')),
    admin.from('system_items').select('id, name, category, vendor_group_id').eq('active', true),
    fetchAllPaged<any>(() => admin.from('store_items').select('id, store_id, system_item_id').eq('enabled', true)),
    admin.from('stores').select('id, name').eq('active', true),
    admin.from('system_vendor_groups').select('id, name'),
  ])

  const globalNames = new Set((mappings ?? []).filter((m: any) => !m.store_id).map((m: any) => m.item_name))
  const storeMapNames = new Map<string, Set<string>>()
  for (const m of mappings ?? []) {
    if (m.store_id) {
      if (!storeMapNames.has(m.store_id)) storeMapNames.set(m.store_id, new Set())
      storeMapNames.get(m.store_id)!.add(m.item_name)
    }
  }

  const sysById = new Map((sysItems ?? []).map((s: any) => [s.id, s]))
  const vgById = new Map((vgs ?? []).map((v: any) => [v.id, v.name as string]))
  const storeNameById = Object.fromEntries((stores ?? []).map((s: any) => [s.id, s.name as string]))

  const orphans: OrphanItem[] = []
  for (const si of storeItems ?? []) {
    const sys = sysById.get(si.system_item_id)
    if (!sys) continue
    const inGlobal = globalNames.has(sys.name)
    const inStore = storeMapNames.get(si.store_id)?.has(sys.name) ?? false
    if (inGlobal || inStore) continue

    // 系統必要品項（零星購買 catch-all）— 建議保留
    const isSystemReserved = /^其他（(發票|收據|估價單)）$/.test(sys.name)
      || sys.name === '其他稅金'
      || sys.name === 'X總發票'

    orphans.push({
      store_item_id: si.id,
      store_id: si.store_id,
      store_name: storeNameById[si.store_id] ?? si.store_id,
      system_item_id: sys.id,
      item_name: sys.name,
      category: sys.category,
      vendor_group: vgById.get(sys.vendor_group_id) ?? null,
      isSystemReserved,
    })
  }

  // 排序：非系統必要在前 → 依店名 → 依品項名
  orphans.sort((a, b) =>
    Number(a.isSystemReserved) - Number(b.isSystemReserved)
    || a.store_name.localeCompare(b.store_name)
    || a.item_name.localeCompare(b.item_name)
  )

  return { success: true as const, orphans }
}

export async function disableStoreItemsBatch(storeItemIds: string[]): Promise<{ error: string } | { success: true; count: number }> {
  const auth = await checkHqAuth()
  if ('error' in auth) return { error: auth.error as string }
  if (!storeItemIds.length) return { success: true, count: 0 }
  const admin = createAdminClient()
  const { error } = await admin.from('store_items').update({ enabled: false }).in('id', storeItemIds)
  if (error) return { error: error.message }
  revalidatePath('/hq/cleanup-orphan-items')
  return { success: true as const, count: storeItemIds.length }
}
