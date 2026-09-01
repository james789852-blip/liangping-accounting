export interface CKExpenseForReceiptReview {
  category: string
  item_name: string
  amount: number
  payer_name?: string
  vendor_group?: string
  doc_type?: string
  note?: string
  receipt_photo_url?: string
}

export interface CKExpenseReceiptGroup<T extends CKExpenseForReceiptReview = CKExpenseForReceiptReview> {
  key: string
  name: string
  expenses: T[]
  total: number
  categories: string[]
  payerNames: string[]
  docTypes: string[]
  notes: string[]
  photoUrls: string[]
}

/**
 * 有照片的支出以「照片」為核對單位，一張照片只出現在一張卡片並顯示該照片的合計。
 * 沒有照片的手動支出才依類別與廠商合併，避免不同單據的照片和金額錯位。
 */
export function groupCKExpensesByReceipt<T extends CKExpenseForReceiptReview>(
  expenses: T[],
): CKExpenseReceiptGroup<T>[] {
  const groups = new Map<string, CKExpenseReceiptGroup<T>>()

  expenses.forEach(expense => {
    const photoUrl = expense.receipt_photo_url?.trim() ?? ''
    const vendorName = expense.vendor_group?.trim() ?? ''
    const itemName = expense.item_name.trim()
    const key = photoUrl
      ? `photo:${photoUrl}`
      : `manual:${expense.category}:${vendorName || itemName}`
    const current = groups.get(key) ?? {
      key,
      name: vendorName || itemName || '未分類支出',
      expenses: [],
      total: 0,
      categories: [],
      payerNames: [],
      docTypes: [],
      notes: [],
      photoUrls: [],
    }

    current.expenses.push(expense)
    current.total += Number(expense.amount) || 0
    if (expense.category && !current.categories.includes(expense.category)) current.categories.push(expense.category)
    if (expense.payer_name && !current.payerNames.includes(expense.payer_name)) current.payerNames.push(expense.payer_name)
    if (expense.doc_type && !current.docTypes.includes(expense.doc_type)) current.docTypes.push(expense.doc_type)
    if (expense.note && !current.notes.includes(expense.note)) current.notes.push(expense.note)
    if (photoUrl && !current.photoUrls.includes(photoUrl)) current.photoUrls.push(photoUrl)
    groups.set(key, current)
  })

  return Array.from(groups.values())
}
