export interface PdfRevenuePeriod {
  total: number
  onsite: number
  uber: number
  panda: number
  online: number
  storeDelivery: number
  deliveryTotal: number
}

export interface PdfRevenueComparison {
  current: PdfRevenuePeriod
  previous: PdfRevenuePeriod
  channels: {
    uber: boolean
    panda: boolean
    online: boolean
  }
}

export interface PdfRevenueRow {
  label: string
  current: number
  previous: number
  difference: number
  percentage: string
  emphasized?: boolean
}

export interface PdfDailyRevenueRow {
  date: string
  hasData: boolean
  total: number
  onsite: number
  uber: number
  panda: number
  online: number
  storeDelivery: number
  deliveryTotal: number
}

export interface PdfDailyComparisonRow {
  sequence: number
  current: PdfDailyRevenueRow | null
  previous: PdfDailyRevenueRow | null
}

export interface PdfDensityInput {
  dailyRowCount: number
  entryCount: number
  photoCount: number
  textLength: number
}

export function formatRevenuePercentage(current: number, previous: number) {
  if (previous === 0) return current > 0 ? '本期新增' : '—'
  const value = ((current - previous) / previous) * 100
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

export function buildPdfRevenueRows(comparison: PdfRevenueComparison): PdfRevenueRow[] {
  const source: Array<[string, number, number, boolean?]> = [
    ['總營業額', comparison.current.total, comparison.previous.total, true],
    ['現場', comparison.current.onsite, comparison.previous.onsite],
    ...(comparison.channels.uber
      ? [['優步外送', comparison.current.uber, comparison.previous.uber] as [string, number, number]]
      : []),
    ...(comparison.channels.panda
      ? [['熊貓外送', comparison.current.panda, comparison.previous.panda] as [string, number, number]]
      : []),
    ['店內外送', comparison.current.storeDelivery, comparison.previous.storeDelivery],
    ['外送合計', comparison.current.deliveryTotal, comparison.previous.deliveryTotal, true],
    ...(comparison.channels.online
      ? [['線上點餐', comparison.current.online, comparison.previous.online] as [string, number, number]]
      : []),
  ]

  return source.map(([label, current, previous, emphasized]) => ({
    label,
    current,
    previous,
    difference: current - previous,
    percentage: formatRevenuePercentage(current, previous),
    emphasized,
  }))
}

export function buildPdfDailyComparisonRows(
  current: PdfDailyRevenueRow[],
  previous: PdfDailyRevenueRow[],
): PdfDailyComparisonRow[] {
  const rowCount = Math.max(current.length, previous.length)
  return Array.from({ length: rowCount }, (_, index) => ({
    sequence: index + 1,
    current: current[index] ?? null,
    previous: previous[index] ?? null,
  }))
}

export function choosePdfDensity(input: PdfDensityInput) {
  const score = input.dailyRowCount
    + input.entryCount * 5
    + input.photoCount * 4
    + Math.ceil(input.textLength / 350)
  if (score >= 80) return 'dense'
  if (score >= 42) return 'balanced'
  return 'comfortable'
}

export function photoGridClass(photoCount: number) {
  return photoCount === 1 ? 'photos photos-single' : 'photos'
}
