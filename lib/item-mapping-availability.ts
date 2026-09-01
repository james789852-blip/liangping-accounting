export interface ItemMappingUnavailablePeriod {
  item_mapping_id?: string
  unavailable_from: string
  unavailable_until?: string | null
}

export const ITEM_MAPPING_DISABLED_EVENT = 'item_mapping_disabled'
export const ITEM_MAPPING_REACTIVATED_EVENT = 'item_mapping_reactivated'
export const ITEM_MAPPING_ARCHIVED_EVENT = 'item_mapping_archived'
export const ITEM_MAPPING_NEGATIVE_ENABLED_EVENT = 'item_mapping_negative_enabled'
export const ITEM_MAPPING_NEGATIVE_DISABLED_EVENT = 'item_mapping_negative_disabled'
export const ITEM_MAPPING_EXPLICIT_ITEM_EVENT = 'item_mapping_explicit_item'

const ITEM_MAPPING_LIFECYCLE_EVENTS = new Set([
  ITEM_MAPPING_DISABLED_EVENT,
  ITEM_MAPPING_REACTIVATED_EVENT,
  ITEM_MAPPING_ARCHIVED_EVENT,
])
const ITEM_MAPPING_NEGATIVE_EVENTS = new Set([
  ITEM_MAPPING_NEGATIVE_ENABLED_EVENT,
  ITEM_MAPPING_NEGATIVE_DISABLED_EVENT,
])

export interface ItemMappingStatusEvent {
  event_type: string
  created_at: string
  metadata?: {
    item_mapping_id?: string
    unavailable_from?: string
    available_from?: string
    [key: string]: unknown
  } | null
}

/** 以台北日曆月份為準，不套用凌晨 5 點的營業日回推。 */
export function taipeiCalendarMonthStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const year = Number(parts.find(part => part.type === 'year')?.value)
  const month = Number(parts.find(part => part.type === 'month')?.value)
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function nextMonthStart(monthStart: string): string {
  const [year, month] = monthStart.slice(0, 7).split('-').map(Number)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
}

/** 區間為 [from, until)，因此重新啟用的月份會立刻恢復報表欄位。 */
export function isUnavailableForReportMonth(
  reportMonth: string,
  periods: ItemMappingUnavailablePeriod[],
): boolean {
  return periods.some(period => {
    const fromMonth = String(period.unavailable_from ?? '').slice(0, 7)
    const untilMonth = period.unavailable_until
      ? String(period.unavailable_until).slice(0, 7)
      : null
    return fromMonth <= reportMonth && (!untilMonth || reportMonth < untilMonth)
  })
}

export function mappingIdFromStatusEvent(event: ItemMappingStatusEvent): string | null {
  const mappingId = event.metadata?.item_mapping_id
  return typeof mappingId === 'string' && mappingId ? mappingId : null
}

export function disabledAtFromStatusEvents(events: ItemMappingStatusEvent[]): string | null {
  const latest = events
    .filter(event => ITEM_MAPPING_LIFECYCLE_EVENTS.has(event.event_type))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return latest && [ITEM_MAPPING_DISABLED_EVENT, ITEM_MAPPING_ARCHIVED_EVENT].includes(latest.event_type)
    ? latest.created_at
    : null
}

/** 封存只從管理清單移除；mapping 本身與歷史帳目都必須保留。 */
export function isArchivedFromStatusEvents(events: ItemMappingStatusEvent[]): boolean {
  const latest = events
    .filter(event => ITEM_MAPPING_LIFECYCLE_EVENTS.has(event.event_type))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return latest?.event_type === ITEM_MAPPING_ARCHIVED_EVENT
}

/** 此設定只影響後續輸入；歷史帳目的金額仍以當時已儲存的正負值為準。 */
export function isNegativeFromStatusEvents(events: ItemMappingStatusEvent[]): boolean {
  const latest = events
    .filter(event => ITEM_MAPPING_NEGATIVE_EVENTS.has(event.event_type))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return latest?.event_type === ITEM_MAPPING_NEGATIVE_ENABLED_EVENT
}

/** 分類同名品項若由管理者明確新增，就不可再當成內部廠商佔位資料隱藏。 */
export function isExplicitItemFromStatusEvents(events: ItemMappingStatusEvent[]): boolean {
  return events.some(event => event.event_type === ITEM_MAPPING_EXPLICIT_ITEM_EVENT)
}

/** 把稽核事件還原成月報不可用區間，支援重複停用與重新啟用。 */
export function unavailablePeriodsFromStatusEvents(
  events: ItemMappingStatusEvent[],
): ItemMappingUnavailablePeriod[] {
  const periods: ItemMappingUnavailablePeriod[] = []
  let openFrom: string | null = null
  for (const event of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if ([ITEM_MAPPING_DISABLED_EVENT, ITEM_MAPPING_ARCHIVED_EVENT].includes(event.event_type)) {
      if (!openFrom) openFrom = String(event.metadata?.unavailable_from ?? '').slice(0, 10) || nextMonthStart(taipeiCalendarMonthStart(new Date(event.created_at)))
      continue
    }
    if (event.event_type !== ITEM_MAPPING_REACTIVATED_EVENT || !openFrom) continue
    const availableFrom = String(event.metadata?.available_from ?? '').slice(0, 10) || taipeiCalendarMonthStart(new Date(event.created_at))
    // 在停用尚未影響任何月報前重新啟用，這段區間等同不存在。
    if (availableFrom > openFrom) {
      periods.push({ unavailable_from: openFrom, unavailable_until: availableFrom })
    }
    openFrom = null
  }
  if (openFrom) periods.push({ unavailable_from: openFrom, unavailable_until: null })
  return periods
}
