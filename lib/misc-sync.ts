import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 依 mapping 內 vendor_group IN (null, '雜項', '未分類') 的品項清單
 * 同步到 receipt_categories.name='雜項' 的 receipt_vendors。
 * (排除全域繼承 — 僅計算該店 store-specific mapping。)
 */
export async function syncMiscVendorsForStore(storeId: string) {
  const admin = createAdminClient()
  const { data: cat } = await admin
    .from('receipt_categories')
    .select('id, receipt_vendors(id, name, sort_order)')
    .eq('store_id', storeId).eq('name', '雜項').maybeSingle()
  if (!cat) return

  const existing: { id: string; name: string; sort_order: number | null }[] = (cat as any).receipt_vendors ?? []
  const { data: mps } = await admin
    .from('item_column_mappings')
    .select('item_name, vendor_group, sort_order')
    .eq('store_id', storeId)

  // name → mapping.sort_order（用來給 receipt_vendors 排序）
  const shouldBe = new Map<string, number>()
  for (const m of mps ?? []) {
    const vg = (m as any).vendor_group
    if (!vg || vg === '雜項' || vg === '未分類') {
      shouldBe.set((m as any).item_name, (m as any).sort_order ?? 999999)
    }
  }

  const existingByName = new Map(existing.map(v => [v.name, v]))
  const toAdd = [...shouldBe.entries()].filter(([n]) => !existingByName.has(n))

  // 每店獨立 / 尊重使用者改動：只「補新增」缺少的品項到收據雜項下拉，
  // 絕不刪除、不改名、不覆蓋既有 receipt_vendors —— 避免把使用者改過的名稱或排序蓋回。
  if (toAdd.length > 0) {
    await admin.from('receipt_vendors').insert(
      toAdd.map(([n, s]) => ({ category_id: cat.id, store_id: storeId, name: n, sort_order: s }))
    )
  }
}

/** 全域 mapping 變更時，同步所有店家。 */
export async function syncMiscVendorsAllStores() {
  const admin = createAdminClient()
  const { data: stores } = await admin
    .from('stores').select('id')
    .eq('active', true)
  await Promise.all((stores ?? []).map(s => syncMiscVendorsForStore(s.id)))
}

/** 依 mapping row 判斷該 sync 哪些店。 */
export async function syncMiscVendorsFromMappingChange(storeId: string | null | undefined) {
  if (storeId) await syncMiscVendorsForStore(storeId)
  else await syncMiscVendorsAllStores()
}
