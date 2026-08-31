export interface StoreDeliveryEntry {
  date: string
  amount: number
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function normalizeStoreDeliveryEntries(value: unknown): StoreDeliveryEntry[] {
  if (!Array.isArray(value)) return []
  const byDate = new Map<string, number>()
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const date = typeof record.date === 'string' ? record.date.trim() : ''
    const amount = typeof record.amount === 'number' ? record.amount : Number(record.amount ?? 0)
    if (!ISO_DATE.test(date) || !Number.isFinite(amount) || amount < 0) continue
    if (amount === 0) byDate.delete(date)
    else byDate.set(date, Math.round(amount))
  }
  return [...byDate].map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date))
}

export function storeDeliveryMap(value: unknown) {
  return new Map(normalizeStoreDeliveryEntries(value).map(entry => [entry.date, entry.amount]))
}
