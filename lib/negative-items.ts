/**
 * 名稱屬於「負值」的品項：使用者輸入正數，系統自動存負數。
 * 例如「折扣」「退貨」「退款」等，本來就應該以負數呈現。
 */
const NEGATIVE_KEYWORDS = ['折扣', '退貨', '退款', '退費', '抵扣']

export function isNegativeItem(name: string): boolean {
  if (!name) return false
  return NEGATIVE_KEYWORDS.some(k => name.includes(k))
}

/** 規範化品項金額：屬於負值類就強制負數，否則照原值 */
export function normalizeItemAmount(itemName: string, amount: number): number {
  if (isNegativeItem(itemName)) return -Math.abs(amount)
  return amount
}
