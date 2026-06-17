// 系統內店家顯示順序：鑫耀鑫 → 梁鑫 → 鑫營 → 府中 → 景新 → 心惦 → 大直讚 → 幸福 → 福城 → 巷日
// 未列出的店家排在最後（依名稱字典序）
export const STORE_ORDER = [
  '鑫耀鑫', '梁鑫', '鑫營', '府中', '景新',
  '心惦', '大直讚', '幸福', '福城', '巷日',
]

export function sortStores<T extends { name: string }>(stores: T[]): T[] {
  return [...stores].sort((a, b) => {
    const ai = STORE_ORDER.indexOf(a.name)
    const bi = STORE_ORDER.indexOf(b.name)
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name, 'zh-Hant')
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}
