type StoreClosingReport = {
  store_id: string
  status?: string | null
  updated_at?: string | null
  total_cost?: number | null
  order_items?: Array<{ total_amount?: number | null }> | null
}

const STATUS_PRIORITY: Record<string, number> = {
  verified: 4,
  submitted: 3,
  disputed: 2,
  draft: 1,
}

/**
 * 店家自報的正式來源是 daily_closings，不是 ck_store_orders 的同步副本。
 * 同店同日若有多筆資料，取狀態較高、更新較新的那一筆。
 */
export function storeReportedAmountsFromClosings(rows: StoreClosingReport[]) {
  const bestByStore = new Map<string, StoreClosingReport>()
  for (const row of rows) {
    const current = bestByStore.get(row.store_id)
    const rowPriority = STATUS_PRIORITY[row.status ?? ''] ?? 0
    const currentPriority = STATUS_PRIORITY[current?.status ?? ''] ?? 0
    const shouldReplace = !current
      || rowPriority > currentPriority
      || (rowPriority === currentPriority && (row.updated_at ?? '') > (current.updated_at ?? ''))
    if (shouldReplace) bestByStore.set(row.store_id, row)
  }

  const amounts: Record<string, number> = {}
  for (const [storeId, row] of bestByStore) {
    const itemTotal = (row.order_items ?? []).reduce(
      (sum, item) => sum + Number(item.total_amount ?? 0),
      0,
    )
    amounts[storeId] = Number(row.total_cost ?? 0) > 0
      ? Number(row.total_cost)
      : itemTotal
  }
  return amounts
}
