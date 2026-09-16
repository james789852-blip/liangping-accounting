export type ReserveDisplayItem = {
  reason?: unknown
  description?: unknown
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

/** 總公司審核畫面統一顯示預留原因與店長填寫的備註。 */
export function formatReserveDisplayLabel(item: ReserveDisplayItem, prefix = '預留 ') {
  const reason = cleanText(item.reason) || '款項'
  const description = cleanText(item.description)
  const base = `${prefix}${reason}`
  return description ? `${base}｜備註：${description}` : base
}
