/**
 * Supabase PostgREST 預設 max-rows=1000，即使 client 端寫 .limit(10000) 也會被伺服器蓋掉。
 * 這個 helper 用 .range() 分頁撈到完整資料。
 *
 * 用法：
 *   const rows = await fetchAllPaged(() => admin.from('item_column_mappings').select('*'))
 */
export async function fetchAllPaged<T = any>(
  buildQuery: () => any,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}
