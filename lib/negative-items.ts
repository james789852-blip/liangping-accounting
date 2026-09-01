/**
 * 名稱屬於「負值」的品項：使用者輸入正數，系統自動存負數。
 * 例如「折扣」「退貨」「退款」等，本來就應該以負數呈現。
 */
const NEGATIVE_KEYWORDS = ['折扣', '退貨', '退款', '退費', '抵扣', '賣東西給分店']

function compactItemName(name: string): string {
  return name.replace(/[\s　()（）【】\[\]－—–_]/g, '')
}

export function isNegativeItem(name: string): boolean {
  if (!name) return false
  const compact = compactItemName(name)
  return NEGATIVE_KEYWORDS.some(k => compact.includes(compactItemName(k)))
    || compact.includes('賣給分店食材')
}

/** 沿用系統上線前既有規則：賣給分店固定負數；店面「其他／其他」每筆可自行切換。 */
export function defaultItemSignMode(
  itemName: string,
  vendorGroup?: string | null,
  preserveLegacyStoreOther = false,
): 'positive' | 'negative' | 'flexible' {
  if (isNegativeItem(itemName)) return 'negative'
  if (preserveLegacyStoreOther && itemName.trim() === '其他' && (vendorGroup ?? '').trim() === '其他') return 'flexible'
  return 'positive'
}

/** 規範化品項金額：屬於負值類就強制負數，否則照原值 */
export function normalizeItemAmount(itemName: string, amount: number, configuredNegative = false): number {
  if (configuredNegative || isNegativeItem(itemName)) return -Math.abs(amount)
  return amount
}
