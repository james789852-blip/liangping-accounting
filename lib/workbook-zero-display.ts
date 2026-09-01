export type WorkbookClosingStatus = 'draft' | 'submitted' | 'verified' | 'disputed' | 'none'

/** 一般數值欄：真正的 0 不佔畫面，但正負數仍完整保留。 */
export function blankWorkbookZero(value: number): number | null {
  return value === 0 ? null : value
}

/**
 * 「結果」欄要區分「已做帳且結果為 0」和「尚未做帳」。
 * 不能只看數值，必須以每日結帳狀態判斷。
 */
export function workbookResultValue(
  value: number,
  closingStatus: WorkbookClosingStatus,
): number | null {
  return closingStatus === 'none' ? null : value
}
