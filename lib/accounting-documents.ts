export const ACCOUNTING_DOCUMENT_CATEGORIES = [
  'invoice',
  'company_invoice',
  'receipt',
  'estimate',
  'delivery',
  'sales',
  'remittance',
  'void_invoice',
  'note',
  'other',
] as const

export type AccountingDocumentCategory = typeof ACCOUNTING_DOCUMENT_CATEGORIES[number]

export type AccountingDocument = {
  id: string
  url: string
  locationId: string
  locationName: string
  locationKind: 'store' | 'ck'
  businessDate: string
  category: AccountingDocumentCategory
  title: string
  subtitle?: string
  documentTypeLabel?: string
  vendorGroup?: string
  itemCategory?: string
  actualVendorName?: string
  amount?: number
}

export const ACCOUNTING_DOCUMENT_CATEGORY_LABELS: Record<AccountingDocumentCategory, string> = {
  invoice: '發票',
  company_invoice: '公司開',
  receipt: '收據',
  estimate: '估價單',
  delivery: '配送單',
  sales: '營業額存證',
  remittance: '匯款／補款',
  void_invoice: '作廢發票',
  note: '備註照片',
  other: '未設定／其他',
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string | undefined): value is string {
  if (!value || !ISO_DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T12:00:00+08:00`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function normalizeAccountingDateRange(
  requestedFrom: string | undefined,
  requestedTo: string | undefined,
  fallbackDate: string,
  maxDays = 31,
) {
  let from = isIsoDate(requestedFrom) ? requestedFrom : fallbackDate
  let to = isIsoDate(requestedTo) ? requestedTo : fallbackDate

  if (from > to) [from, to] = [to, from]

  const fromDate = new Date(`${from}T12:00:00+08:00`)
  const toDate = new Date(`${to}T12:00:00+08:00`)
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1
  let wasClamped = false

  if (days > maxDays) {
    const clampedFromDate = new Date(toDate)
    clampedFromDate.setDate(clampedFromDate.getDate() - maxDays + 1)
    from = clampedFromDate.toISOString().slice(0, 10)
    wasClamped = true
  }

  return { from, to, wasClamped }
}

export function accountingCategoryFromReceiptType(receiptType?: string | null): AccountingDocumentCategory {
  if (receiptType === 'invoice') return 'invoice'
  if (receiptType === 'receipt') return 'receipt'
  if (receiptType === 'delivery_note') return 'delivery'
  return 'other'
}

export function accountingCategoryFromDocType(docType?: string | null): AccountingDocumentCategory {
  const normalized = docType?.trim() ?? ''
  if (normalized === '發票') return 'invoice'
  if (normalized === '公司開') return 'company_invoice'
  if (normalized === '收據') return 'receipt'
  if (normalized === '估價單') return 'estimate'
  if (normalized === '配送單' || normalized === '送貨單') return 'delivery'
  return 'other'
}

export function accountingCategoryFromConfiguredDocTypes(docTypes: Array<string | null | undefined>): AccountingDocumentCategory {
  const categories = [...new Set(docTypes
    .map(docType => docType?.trim())
    .filter((docType): docType is string => !!docType)
    .map(accountingCategoryFromDocType))]
  return categories.length === 1 ? categories[0] : 'other'
}

const CHANNEL_LABELS: Record<string, string> = {
  pos: 'POS 現金',
  uber: 'Uber Eats',
  panda: 'foodpanda',
  twpay: '台灣 Pay',
  online: '線上點餐',
  online_cash: '線上點餐（現金）',
  handwrite: '手寫訂單',
}

export function accountingChannelLabel(key: string) {
  if (key.startsWith('uber_')) return `Uber Eats — ${key.slice(5)}`
  return CHANNEL_LABELS[key] ?? key
}

export function normalizeAccountingPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean))]
}

export function matchesAccountingDocument(
  document: AccountingDocument,
  category: string,
  keyword: string,
  vendorGroup = 'all',
  itemCategory = 'all',
) {
  if (category !== 'all' && document.category !== category) return false
  if (vendorGroup !== 'all' && document.vendorGroup !== vendorGroup) return false
  if (itemCategory !== 'all' && document.itemCategory !== itemCategory) return false
  const query = keyword.trim().toLocaleLowerCase('zh-TW')
  if (!query) return true
  return [
    document.locationName,
    document.businessDate,
    ACCOUNTING_DOCUMENT_CATEGORY_LABELS[document.category],
    document.title,
    document.subtitle ?? '',
    document.documentTypeLabel ?? '',
    document.vendorGroup ?? '',
    document.itemCategory ?? '',
    document.actualVendorName ?? '',
  ].some(value => value.toLocaleLowerCase('zh-TW').includes(query))
}
