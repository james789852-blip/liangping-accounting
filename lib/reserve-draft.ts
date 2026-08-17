export interface ReserveDraftItem {
  id: string
  reason: string
  amount: number
  total_bill?: number
  auto_reserved?: boolean
  source_start_date?: string
  accumulated_before?: number
}

export interface ReserveDraftContext {
  business_date: string
  items: Array<{
    reason: string
    amount: number
    total_bill?: number
    started_date?: string
    remaining_amount?: number
  }>
}

/**
 * 準備店長端的預留款草稿。
 *
 * 未結清帳單只能補上店長已主動建立項目的帳單脈絡，不能替店長新增金額。
 * 舊版自動建立的項目在可編輯草稿中會被移除，避免它從 localStorage 或
 * 備份再次被寫回資料庫；已送出／已審核資料則保留原始紀錄。
 */
export function prepareReserveDraftItems(
  items: ReserveDraftItem[],
  context?: ReserveDraftContext | null,
  editable = true,
): ReserveDraftItem[] {
  let next = editable ? items.filter(item => !item.auto_reserved) : items

  for (const pending of context?.items ?? []) {
    const totalBill = Number(pending.total_bill ?? 0)
    const remaining = pending.remaining_amount ?? (totalBill - pending.amount)
    if (totalBill <= 0 || remaining <= 0) continue

    const exactMatchingIndex = next.findIndex(item =>
      item.reason === pending.reason && Number(item.total_bill ?? 0) === totalBill,
    )
    // 舊版手動草稿可能只存「原因＋今日金額」，沒有 total_bill。
    const legacyMatchingIndex = exactMatchingIndex < 0
      ? next.findIndex(item => item.reason === pending.reason && Number(item.total_bill ?? 0) <= 0)
      : -1
    const matchingIndex = exactMatchingIndex >= 0 ? exactMatchingIndex : legacyMatchingIndex
    if (matchingIndex < 0) continue

    const current = next[matchingIndex]
    const sourceStartDate = current.source_start_date ?? pending.started_date
    const accumulatedBefore = current.accumulated_before ?? pending.amount
    if (
      Number(current.total_bill ?? 0) !== totalBill
      || current.source_start_date !== sourceStartDate
      || current.accumulated_before !== accumulatedBefore
    ) {
      next = next.map((item, index) => index === matchingIndex
        ? {
            ...item,
            total_bill: totalBill,
            source_start_date: sourceStartDate,
            accumulated_before: accumulatedBefore,
          }
        : item)
    }
  }

  return next
}
