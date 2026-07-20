'use client'

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, memo, startTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { Store, CKPrice } from '@/lib/types'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import ClosingHelp from './closing-help'
import { Save, Send, Calculator, Package, Banknote, BarChart3, Loader2, Trash2, Plus, Wallet, X, AlertCircle, CheckCircle2, RefreshCw, Camera, Pencil, UploadCloud, FileText, ZoomIn, PiggyBank } from 'lucide-react'
import { saveCashCounts, submitClosing, savePettyCounts } from '@/app/actions/closings'
import { syncStoreCKOrder } from '@/app/actions/ck'
import { createSignedUploadUrl, uploadToStorage } from '@/app/actions/upload'
import { compressImage } from '@/lib/compress-image'
import { normalizeItemAmount } from '@/lib/negative-items'
import { getPreReservedExpenseTotal } from '@/lib/pre-reserved-expenses'
import type { CategoryWithVendors } from '@/app/actions/receipt-settings'
import SharedSafePhotoImage from '@/components/shared/safe-photo-image'
import { storePhotoPath } from '@/lib/storage-paths'

interface RemittanceAdjustment {
  id: string
  type: 'advance' | 'reimburse' | 'customer_transfer' | 'carryover' | 'other'
  label: string
  amount: number  // positive = adds to envelope, negative = deducts
  person?: string
}

interface ReserveItem {
  id: string
  reason: string
  amount: number
  total_bill?: number  // total bill amount (optional), for showing remaining across days
  auto_reserved?: boolean
  source_start_date?: string
  accumulated_before?: number
}

interface LargeCashExpense {
  id: string
  description: string
  amount: number
  /** 已由前幾日預留款支付，今天不應再從現金扣除。 */
  preReserved?: boolean
}

interface TodayReceipt {
  id: string
  vendor_name: string
  actual_vendor_name?: string | null
  total_amount: number
  tax_amount?: number
  receipt_type: string
  photo_url?: string
  notes?: string
  receipt_items?: { item_name: string; unit: string; quantity: number; unit_price: number; amount: number }[]
}

interface ChannelPhoto {
  previewUrl?: string
  publicUrl?: string
  status: 'idle' | 'uploading' | 'verifying' | 'matched' | 'mismatch' | 'uploaded'
  recognized?: number
}

function SafeImage({
  src,
  alt,
  className,
  style,
  fallbackText = '照片載入失敗',
}: {
  src?: string | null
  alt: string
  className?: string
  style?: CSSProperties
  fallbackText?: string
}) {
  return <SharedSafePhotoImage src={src} alt={alt} className={className} style={style} fallbackText={fallbackText} thumb width={900} height={600} />
}

async function uploadReceiptPhoto(path: string, rawFile: File): Promise<{ publicUrl: string } | { error: string }> {
  const file = await compressImage(rawFile)
  const uploadPath = file.type === 'image/jpeg' ? path.replace(/\.[^.]+$/, '.jpg') : path
  const signed = await createSignedUploadUrl('receipts', uploadPath)
  if (!('error' in signed)) {
    const supabase = createClient()
    const { error } = await supabase.storage
      .from('receipts')
      .uploadToSignedUrl(uploadPath, signed.token, file, { contentType: file.type })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(uploadPath)
      return { publicUrl }
    }
  }

  const fd = new FormData()
  fd.append('file', file)
  return uploadToStorage(fd, 'receipts', uploadPath)
}


interface ReceiptFormItem {
  id: string
  item_name: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  vendor_group_hint?: string
}

interface ReceiptForm {
  id: string
  file?: File
  previewUrl?: string
  uploadedPhotoUrl?: string
  category: string
  vendor_name: string
  actual_vendor_name: string
  total_amount: number
  has_tax: boolean
  tax_amount: number
  notes: string
  uploading: boolean
  items: ReceiptFormItem[]
}

interface VerifyItem {
  key: string
  type: 'receipt' | 'channel' | 'ck' | 'envelope' | 'void_invoice' | 'note'
  label: string
  photoUrl: string
  inputAmount: number
  confirmed: boolean
  notes?: string
  items?: { item_name: string; unit: string; quantity: number; unit_price: number; amount: number }[]
}

function getVerifySignature(item: VerifyItem): string {
  const items = (item.items ?? [])
    .filter(i => i.item_name?.trim())
    .map(i => ({
      item_name: i.item_name,
      unit: i.unit,
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      amount: Number(i.amount) || 0,
    }))

  return JSON.stringify({
    key: item.key,
    type: item.type,
    label: item.label,
    photoUrl: item.photoUrl,
    inputAmount: Number(item.inputAmount) || 0,
    notes: item.notes ?? '',
    items,
  })
}

function isCKReceipt(receipt: TodayReceipt, ckPrices: CKPrice[]): boolean {
  if (!receipt.receipt_items || receipt.receipt_items.length === 0) return false
  const ckNames = ckPrices.map(p => p.item_name)
  return receipt.receipt_items.some(item =>
    ckNames.some(ck => item.item_name === ck || item.item_name.includes(ck) || ck.includes(item.item_name))
  )
}

interface PrevDayReserve {
  business_date: string
  items: {
    reason: string
    amount: number
    total_bill?: number
    started_date?: string
    remaining_amount?: number
  }[]
}

interface PreReservedExpenseHint {
  reason: string
  amount: number
  total_bill?: number
}

interface Props {
  store: Store
  ckPrices: CKPrice[]
  existingClosing: any
  userId: string
  today: string
  todayReceipts?: TodayReceipt[]
  receiptCategories?: CategoryWithVendors[]
  mappingColumns?: MappingColumn[]
  actualVendors?: { id: string; vendor_group: string; name: string }[]
  prevDayReserves?: PrevDayReserve | null
  preReservedExpenseHints?: PreReservedExpenseHint[]
  isBackfill?: boolean  // 是否為補做過往帳目（非今日業務日）
  realToday?: string    // 真實今日業務日，用於日期切換器顯示「回到今日」
  calendarToday?: string
  isEarlyMorningBusinessDate?: boolean
  latestBackfillDraftDate?: string
}

const NEW_ACTUAL_VENDOR_VALUE = '__new_actual_vendor__'

function normalizeActualVendorName(name?: string | null) {
  return (name ?? '').replace(/[\s　]+/g, '').trim()
}

interface FormData {
  pos_cash: number
  uber_amounts: Record<string, number>
  panda_amount: number
  twpay_amount: number
  online_amount: number
  online_cash_amount: number
  ck_total: number
  bills_1000: number; bills_500: number; bills_100: number
  coins_50: number; coins_10: number; coins_5: number; coins_1: number
  lump_1000: number; lump_500: number; lump_100: number
  lump_50: number; lump_10: number; lump_5: number; lump_1: number
  note: string
}

interface Expense {
  id: string
  description: string
  amount: number
}

interface HandwriteOrder {
  id: string
  order_number: string
  amount: number
  voided: boolean
  void_reason: string
}

const MAX_HANDWRITE_BATCH = 1000

function initFormData(store: Store, ckPrices: CKPrice[], existing: any, todayReceipts?: TodayReceipt[]): FormData {
  const uber_amounts: Record<string, number> = {}
  ;(store.uber_accounts ?? []).forEach(acc => { uber_amounts[acc] = 0 })

  if (!existing) {
    const ck_total = todayReceipts
      ? todayReceipts.filter(r => isCKReceipt(r, ckPrices)).reduce((s, r) => s + r.total_amount, 0)
      : 0
    return {
      pos_cash: 0, uber_amounts, panda_amount: 0, twpay_amount: 0,
      online_amount: 0, online_cash_amount: 0, ck_total,
      bills_1000: 0, bills_500: 0, bills_100: 0,
      coins_50: 0, coins_10: 0, coins_5: 0, coins_1: 0,
      lump_1000: 0, lump_500: 0, lump_100: 0,
      lump_50: 0, lump_10: 0, lump_5: 0, lump_1: 0,
      note: '',
    }
  }

  const rev = existing.revenue_items ?? []
  const cash = existing.cash_counts?.[0] ?? {}
  const orders = existing.order_items ?? []

  ;(store.uber_accounts ?? []).forEach(acc => {
    const r = rev.find((x: any) => x.channel === 'uber' && x.account_name === acc)
    uber_amounts[acc] = r?.gross_amount ?? 0
  })
  const ckFromReceipts = todayReceipts
    ? todayReceipts.filter(r => isCKReceipt(r, ckPrices)).reduce((s, r) => s + r.total_amount, 0)
    : null
  // Compute ck_total from quantity × unit_price (DB total_amount may be stale/0)
  const ckFromSaved = orders
    .filter((x: any) => x.vendor === '央廚' && x.item_name !== '央廚配送')
    .reduce((s: number, o: any) => {
      const price = ckPrices.find(p => p.item_name === o.item_name)
      return s + (price?.unit_price ?? 0) * (o.quantity ?? 0)
    }, 0)
  const ck_total = (ckFromReceipts !== null && ckFromReceipts > 0) ? ckFromReceipts : ckFromSaved

  return {
    pos_cash: rev.find((x: any) => x.channel === 'pos')?.gross_amount ?? 0,
    uber_amounts,
    panda_amount: rev.find((x: any) => x.channel === 'panda')?.gross_amount ?? 0,
    twpay_amount: rev.find((x: any) => x.channel === 'twpay')?.gross_amount ?? 0,
    online_amount: rev.find((x: any) => x.channel === 'online')?.gross_amount ?? 0,
    online_cash_amount: rev.find((x: any) => x.channel === 'online_cash')?.gross_amount ?? 0,
    ck_total,
    bills_1000: cash.bills_1000 ?? 0, bills_500: cash.bills_500 ?? 0, bills_100: cash.bills_100 ?? 0,
    coins_50: cash.coins_50 ?? 0, coins_10: cash.coins_10 ?? 0, coins_5: cash.coins_5 ?? 0, coins_1: cash.coins_1 ?? 0,
    lump_1000: cash.lump_1000 ?? 0, lump_500: cash.lump_500 ?? 0, lump_100: cash.lump_100 ?? 0,
    lump_50: cash.lump_50 ?? 0, lump_10: cash.lump_10 ?? 0, lump_5: cash.lump_5 ?? 0, lump_1: cash.lump_1 ?? 0,
    note: existing.note ?? '',
  }
}

function initExpenses(existing: any, ckPrices: CKPrice[], todayReceipts?: TodayReceipt[]): Expense[] {
  // Receipts are the source of truth — re-derive when any non-CK receipts exist,
  // so stale expense_items saved from a previous draft don't override updated receipt amounts.
  if (todayReceipts) {
    const nonCK = todayReceipts.filter(r => !isCKReceipt(r, ckPrices))
    if (nonCK.length > 0) {
      return nonCK.map(r => ({
        id: crypto.randomUUID(),
        description: r.vendor_name || (r.receipt_items ?? []).filter(i => i.item_name.trim()).map(i => i.item_name).join('、') || '（未填廠商）',
        amount: r.total_amount,
      }))
    }
  }
  // No receipts → fall back to saved expense_items (manual entry without receipts)
  return (existing?.expense_items ?? []).map((e: any) => ({
    id: e.id, description: e.description, amount: e.amount,
  }))
}

function receiptsToExpenses(receipts: TodayReceipt[], ckPrices: CKPrice[]): Expense[] {
  return receipts
    .filter(r => !isCKReceipt(r, ckPrices))
    .map(r => ({
      id: crypto.randomUUID(),
      description: r.vendor_name || (r.receipt_items ?? []).filter(i => i.item_name.trim()).map(i => i.item_name).join('、') || '（未填廠商）',
      amount: r.total_amount,
    }))
}

function initHandwriteOrders(existing: any): HandwriteOrder[] {
  return (existing?.handwrite_orders ?? []).map((o: any) => ({
    id: o.id, order_number: o.order_number, amount: o.amount,
    voided: o.voided ?? false, void_reason: o.void_reason ?? '',
  }))
}

function initLargeCashExpenses(existing: any): LargeCashExpense[] {
  const saved = existing?.cash_counts?.[0]?.large_expenses
  if (!Array.isArray(saved)) return []
  return saved
    .map((item: unknown) => {
      const row = item as Partial<LargeCashExpense>
      return {
        id: typeof row.id === 'string' ? row.id : crypto.randomUUID(),
        description: typeof row.description === 'string' ? row.description : '',
        amount: Math.abs(Number(row.amount) || 0),
        // 舊資料的 false 可能只是尚未套用自動判定，不能當成使用者明確取消。
        preReserved: row.preReserved === true ? true : undefined,
      }
    })
    .filter(item => item.amount > 0 || item.description.trim())
}

function calcSummary(data: FormData, store: Store, ckPrices: CKPrice[], totalExpenses: number, handwriteTotal: number, adjustments: RemittanceAdjustment[], reserves: ReserveItem[], largeCashExpenses: LargeCashExpense[]) {
  const uberTotal = Object.values(data.uber_amounts).reduce((a, b) => a + b, 0)
  // platformTotal = 全部平台名目金額（含線上點餐的「現金部分」），算進總營業額
  const platformTotal = uberTotal + data.panda_amount + data.twpay_amount + data.online_amount
  // platformPaid = 真的進到平台帳戶（不在收銀台現金內）的金額
  // 線上點餐(現金) 是負數，代表「線上點餐裡有 X 元是客人付現金」，所以從 platformTotal 扣回
  const platformPaid = platformTotal + data.online_cash_amount

  const totalRevenue = store.ichef_uber_linked
    ? data.pos_cash
    : data.pos_cash + handwriteTotal + platformTotal

  const deliveryFee = data.ck_total
  // 應包進信封 = 總營業額 - 真實平台收款 - 現金支出
  const shouldEnvelope = totalRevenue - platformPaid - totalExpenses
  const netToHQ = shouldEnvelope - deliveryFee

  const cashSubtotal =
    (data.bills_1000 * 1000 + data.lump_1000) +
    (data.bills_500  * 500  + data.lump_500)  +
    (data.bills_100  * 100  + data.lump_100)  +
    (data.coins_50   * 50   + data.lump_50)   +
    (data.coins_10   * 10   + data.lump_10)   +
    (data.coins_5    * 5    + data.lump_5)    +
    (data.coins_1    * 1    + data.lump_1)
  const largeExpenseTotal = largeCashExpenses.reduce((sum, item) => sum + Math.abs(item.amount || 0), 0)
  // 現金清點、實匯入、誤差與 Excel 維持原始邏輯：大額支出一律先從今日現金扣除。
  // 「前幾日已預留」只在最後包回 HQ 的金額加回，不改動上述原始帳務數字。
  const preReservedExpenseTotal = getPreReservedExpenseTotal(largeCashExpenses)
  const cashExpenseTotal = largeExpenseTotal
  // 顧客已完成轉帳但不在現金鈔箱；現金清點的總額仍要呈現這筆收入，
  // 下一步再透過負的匯款調整扣回，得到實際要包回公司的金額。
  const customerTransferTotal = adjustments
    .filter(item => item.type === 'customer_transfer')
    .reduce((sum, item) => sum + Math.abs(Number(item.amount) || 0), 0)
  const cashTotal = cashSubtotal - cashExpenseTotal + customerTransferTotal

  const actualRemit = cashTotal - store.petty_cash
  const variance = actualRemit - shouldEnvelope
  const storeRevenue = totalRevenue - platformPaid
  const adjustmentTotal = adjustments.reduce((sum, a) => sum + a.amount, 0)
  const finalRemit = actualRemit + adjustmentTotal
  const netVariance = finalRemit - shouldEnvelope
  const totalReserved = reserves.reduce((sum, r) => sum + r.amount, 0)
  const remitToHQ = finalRemit - totalReserved + preReservedExpenseTotal
  return { totalRevenue, platformTotal, platformPaid, storeRevenue, deliveryFee, totalExpenses, shouldEnvelope, netToHQ, cashSubtotal, largeExpenseTotal, preReservedExpenseTotal, cashExpenseTotal, cashTotal, actualRemit, variance, adjustmentTotal, finalRemit, netVariance, totalReserved, remitToHQ }
}

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

function normalizeReserveReason(value: string) {
  return value.replace(/[\s　]+/g, '').trim()
}

function displayItemName(name: string, vendorGroup?: string | null) {
  const vg = vendorGroup?.trim()
  if (!vg || !name.startsWith(vg) || name === vg) return name
  const rest = name.slice(vg.length)
  return /^[\s　\-－—–_]/.test(rest) ? name : rest
}

const DIRECT_RECEIPT_CATEGORIES = ['日常用品', '買東西或維修', '其他'] as const

function isDirectReceiptCategory(categoryName: string | undefined) {
  return DIRECT_RECEIPT_CATEGORIES.includes((categoryName ?? '').trim() as typeof DIRECT_RECEIPT_CATEGORIES[number])
}

function isOtherReceiptItem(itemName: string | undefined, categoryName: string | undefined, expectedName: string) {
  return (categoryName ?? '').trim() === '其他' && (itemName ?? '').trim() === expectedName
}

function normalizeOtherReceiptItemName(value: string | undefined) {
  return (value ?? '').replace(/[\s　()（）]/g, '').trim()
}

function isAutoNegativeOtherReceiptItem(itemName: string | undefined, categoryName: string | undefined) {
  return (categoryName ?? '').trim() === '其他'
    && normalizeOtherReceiptItemName(itemName) === '賣給分店食材'
}

function canUseNegativeOtherReceiptItem(itemName: string | undefined, categoryName: string | undefined) {
  return isOtherReceiptItem(itemName, categoryName, '其他') || isAutoNegativeOtherReceiptItem(itemName, categoryName)
}

function receiptFormForcesNegativeTotal(form: Pick<ReceiptForm, 'category' | 'items'>) {
  return (form.items ?? []).some(item => isAutoNegativeOtherReceiptItem(item.item_name, form.category))
}

function editReceiptForcesNegativeTotal(category: string, items: ReceiptFormItem[]) {
  return items.some(item => isAutoNegativeOtherReceiptItem(item.item_name, category))
}

function requiresPurchaseRepairNote(categoryName: string | undefined) {
  return (categoryName ?? '').trim() === '買東西或維修'
}

function receiptFormAllowsNegativeTotal(form: Pick<ReceiptForm, 'category' | 'items'>) {
  return (form.items ?? []).some(item => canUseNegativeOtherReceiptItem(item.item_name, form.category))
}

function isReceiptFormAmountValid(form: Pick<ReceiptForm, 'category' | 'items' | 'total_amount'>) {
  const amount = Number(form.total_amount) || 0
  if (amount > 0) return true
  return amount < 0 && receiptFormAllowsNegativeTotal(form)
}

function editReceiptAllowsNegativeTotal(category: string, items: ReceiptFormItem[]) {
  return items.some(item => canUseNegativeOtherReceiptItem(item.item_name, category))
}

function deriveReceiptCategory(
  vendorName: string | undefined,
  items: { item_name?: string }[] | undefined,
  categories: CategoryWithVendors[],
  mappingColumns: MappingColumn[],
) {
  const vendor = vendorName?.trim() ?? ''
  if (vendor) {
    const byVendor = categories.find(c => c.vendors.some(v =>
      v.name === vendor
      || (c.name === '其他' && normalizeOtherReceiptItemName(v.name) === normalizeOtherReceiptItemName(vendor)),
    ))
    if (byVendor) return byVendor.name
    const byCategoryName = categories.find(c => c.name === vendor)
    if (byCategoryName) return byCategoryName.name
  }

  const itemNames = (items ?? []).map(i => i.item_name?.trim()).filter(Boolean) as string[]
  for (const itemName of itemNames) {
    const mapping =
      mappingColumns.find(c => c.name === itemName && c.vendor_group === vendor)
      ?? mappingColumns.find(c => c.name === itemName)
    if (!mapping) continue

    if (mapping.vendor_group) {
      const byMappingVendor = categories.find(c => c.vendors.some(v => v.name === mapping.vendor_group))
      if (byMappingVendor) return byMappingVendor.name
      const byMappingGroup = categories.find(c => c.name === mapping.vendor_group)
      if (byMappingGroup) return byMappingGroup.name
    }

    const byMappingCategory = categories.find(c => c.name === mapping.category)
    if (byMappingCategory) return byMappingCategory.name
  }

  return ''
}

function findReceiptItemMapping(
  itemName: string,
  vendorName: string,
  categoryName: string,
  mappingColumns: MappingColumn[],
) {
  const name = itemName.trim()
  const vendor = vendorName.trim()
  const category = categoryName.trim()
  return (
    mappingColumns.find(c => c.name === name && c.vendor_group === vendor)
    ?? mappingColumns.find(c => c.name === name && c.vendor_group === category)
    ?? mappingColumns.find(c => c.name === name && c.category === category)
    ?? mappingColumns.find(c => c.name === name)
    // 兼容舊資料曾將「（賣）」括號省略的情況；新資料仍完整儲存設定名稱。
    ?? (category === '其他'
      ? mappingColumns.find(c =>
        normalizeOtherReceiptItemName(c.name) === normalizeOtherReceiptItemName(name)
        && (c.category === category || c.vendor_group === category),
      )
      : undefined)
  )
}

/**
 * Return the item mappings shown by a receipt item's dropdown for the current
 * category/vendor context.  Keeping this in one place is important: when the
 * category or vendor changes, the existing item value must be checked against
 * the same list that the dropdown renders.
 */
function receiptItemMappingsForContext(
  mappingColumns: MappingColumn[],
  categoryName: string,
  vendorName: string,
  vendorGroupHint?: string,
  allowTaxItems = false,
): MappingColumn[] {
  const baseAll = mappingColumns.filter(c =>
    !c.is_tax_addon && c.vendor_group !== '央廚配送' && (c.vendor_group !== '退稅' || allowTaxItems),
  )
  let base = baseAll
  if (vendorGroupHint) {
    const filtered = baseAll.filter(c => c.vendor_group === vendorGroupHint)
    if (filtered.length > 0) base = filtered
  } else if (vendorName) {
    const filtered = baseAll.filter(c => c.vendor_group === vendorName)
    if (filtered.length > 0) base = filtered
  } else if (categoryName) {
    const merged = new Map<string, MappingColumn>()
    for (const c of baseAll) {
      if (c.vendor_group === categoryName || c.category === categoryName || c.name === categoryName) {
        const key = `${c.vendor_group ?? c.category}|${c.name}`
        if (!merged.has(key)) merged.set(key, c)
      }
    }
    if (merged.size > 0) base = Array.from(merged.values())
  }
  return base
}

function findTaxAddonMapping(
  mappingColumns: MappingColumn[],
  vendorName: string,
  categoryName: string,
  items: ReceiptFormItem[],
) {
  const groups = new Set<string>([vendorName.trim(), categoryName.trim()].filter(Boolean))
  for (const item of items) {
    if (item.vendor_group_hint) groups.add(item.vendor_group_hint)
    const mapping = mappingColumns.find(column =>
      !column.is_tax_addon && column.name === item.item_name
      && (!item.vendor_group_hint || column.vendor_group === item.vendor_group_hint),
    )
    if (mapping?.vendor_group) groups.add(mapping.vendor_group)
  }
  return mappingColumns.find(column => column.is_tax_addon && !!column.vendor_group && groups.has(column.vendor_group))
}

function resetReceiptItemsForContext(
  items: ReceiptFormItem[],
  categoryName: string,
  vendorName: string,
  mappingColumns: MappingColumn[],
): ReceiptFormItem[] {
  return items.map(item => {
    const name = item.item_name.trim()
    if (!name) return { ...item, vendor_group_hint: undefined }
    const options = receiptItemMappingsForContext(mappingColumns, categoryName, vendorName, undefined, vendorName === '退稅' || categoryName === '退稅')
    const stillValid = options.some(c => c.name === name && (!item.vendor_group_hint || c.vendor_group === item.vendor_group_hint))
    return stillValid ? item : { ...item, item_name: '', vendor_group_hint: undefined }
  })
}

function fillSingleReceiptItemAmount(items: ReceiptFormItem[], totalAmount: number, taxAmount = 0): ReceiptFormItem[] {
  const validItems = items.filter(i => i.item_name.trim())
  const untaxedTotal = Math.round(totalAmount - taxAmount)
  const itemTotal = validItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  if (validItems.length !== 1 || untaxedTotal === 0 || itemTotal !== 0) return validItems
  return validItems.map(item => ({ ...item, amount: untaxedTotal }))
}

function needsExternalTaxInvoiceReminder(items: ReceiptFormItem[]): boolean {
  return items.some(item => {
    const name = item.item_name.replace(/[\s　（）()]/g, '')
    return name.includes('選擇') && name.includes('商品') && name.includes('維修') && name.includes('單據類型')
  })
}

function ExternalTaxInvoiceReminder() {
  return (
    <div className="rounded-xl px-3 py-2.5 text-xs font-semibold leading-relaxed"
      style={{ background: '#fff7ed', border: '1.5px solid #fb923c', color: '#9a3412' }}>
      ⚠️ 若單據類型選擇「發票」，而且稅金是外加，請新增／選擇
      <span className="font-extrabold">「發票-稅金（稅外加）」</span>品項，並將稅金金額填在該品項內。
    </div>
  )
}

const DENOMINATIONS = [
  { label: '千元鈔', countKey: 'bills_1000' as const, lumpKey: 'lump_1000' as const, unit: 1000, unitLabel: '張' },
  { label: '五百元', countKey: 'bills_500'  as const, lumpKey: 'lump_500'  as const, unit: 500,  unitLabel: '張' },
  { label: '百元鈔', countKey: 'bills_100'  as const, lumpKey: 'lump_100'  as const, unit: 100,  unitLabel: '張' },
  { label: '五十元', countKey: 'coins_50'   as const, lumpKey: 'lump_50'   as const, unit: 50,   unitLabel: '枚' },
  { label: '十元',   countKey: 'coins_10'   as const, lumpKey: 'lump_10'   as const, unit: 10,   unitLabel: '枚' },
  { label: '五元',   countKey: 'coins_5'    as const, lumpKey: 'lump_5'    as const, unit: 5,    unitLabel: '枚' },
  { label: '一元',   countKey: 'coins_1'    as const, lumpKey: 'lump_1'    as const, unit: 1,    unitLabel: '枚' },
]

function SInput({
  value, onChange, placeholder = '0', disabled, step, textRight = true, onKeyDown, inputRef,
}: {
  value: number | string; onChange: (v: number) => void; placeholder?: string
  disabled?: boolean; step?: string; textRight?: boolean; onKeyDown?: React.KeyboardEventHandler
  inputRef?: (el: HTMLInputElement | null) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      ref={inputRef}
      type="number" min="0" inputMode="numeric" disabled={disabled} step={step}
      style={{
        padding: '10px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px',
        fontSize: '14px', background: disabled ? '#fafafa' : 'white', outline: 'none',
        fontFamily: 'inherit', width: '100%', fontVariantNumeric: 'tabular-nums',
        textAlign: textRight ? 'right' : 'left',
        borderColor: focused ? '#F59E0B' : '#e4e4e7',
        boxShadow: focused ? '0 0 0 4px rgba(245,158,11,0.12)' : 'none',
        color: '#18181b', opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'auto',
      }}
      value={typeof value === 'number' ? (value === 0 ? '' : value) : value}
      placeholder={placeholder}
      onFocus={e => { setFocused(true); e.target.select() }}
      onBlur={e => { setFocused(false); onChange(parseFloat(e.target.value) || 0) }}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      onKeyDown={onKeyDown}
    />
  )
}

function SectionCard({ children, icon, title, subtitle, iconColor }: {
  children: React.ReactNode; icon: React.ReactNode; title: string; subtitle?: string; iconColor: string
}) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden"
      style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: iconColor + '18' }}>
            <span style={{ color: iconColor }}>{icon}</span>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#18181b' }}>{title}</p>
            {subtitle && <p className="text-xs" style={{ color: '#a1a1aa' }}>{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  )
}

function Divider() {
  return <div style={{ borderTop: '1px solid #f4f4f5', margin: '12px 0' }} />
}

function GradientTitle({ step, total, title, desc }: { step: number; total: number; title: string; desc: string }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>📍 步驟 {step} / {total}</p>
      <h2 className="text-2xl font-extrabold tracking-tight mb-1"
        style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316,#FBBF24)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
        {title}
      </h2>
      <p className="text-sm" style={{ color: '#52525b' }}>{desc}</p>
    </div>
  )
}

/**
 * 配送單照片卡：用大圖直接展示，避免固定/滑動照片區影響品項輸入。
 */
const StickyPhotoCard = memo(function StickyPhotoCard({ src, alt, onLightbox, onReupload, onDelete }: {
  src: string; alt: string; onLightbox?: () => void; onReupload?: () => void; onDelete?: () => void
}) {
  return (
    <div className="rounded-3xl overflow-hidden shadow-md"
      style={{ border: '1px solid #f4f4f5', background: 'white' }}>
      {/* 工具列 */}
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
        <span className="text-sm font-semibold" style={{ color: '#c2410c' }}>📷 {alt}</span>
        <span className="text-[11px] ml-auto" style={{ color: '#a1a1aa' }}>點照片可放大檢視</span>
        {onReupload && (
          <button type="button" onClick={onReupload}
            className="px-2 py-0.5 rounded-md text-[10px] font-semibold"
            style={{ background: 'white', border: '1px solid #fed7aa', color: '#c2410c', cursor: 'pointer', fontFamily: 'inherit' }}>
            重拍
          </button>
        )}
        {onDelete && (
          <button type="button" onClick={onDelete}
            className="px-2 py-0.5 rounded-md text-[10px] font-semibold inline-flex items-center gap-1"
            style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Trash2 className="h-3 w-3" />刪除
          </button>
        )}
      </div>
      <button type="button" onClick={onLightbox}
        style={{ width: '100%', display: 'block', border: 'none', padding: 0, cursor: 'zoom-in', background: '#f8fafc', overflow: 'hidden' }}>
        <SharedSafePhotoImage src={src} alt={alt} loading="eager"
          style={{
            width: '100%',
            maxHeight: '430px',
            minHeight: '260px',
            objectFit: 'contain',
            display: 'block',
            // 強制讀 EXIF 方向，避免手機直拍照片在瀏覽器上顯示歪掉
            imageOrientation: 'from-image' as any,
            }} />
      </button>
    </div>
  )
})

function PlatformRow({ channelKey, name, hint, value, onChange, disabled, photo, onPhotoClick, onViewPhoto, onClearPhoto, allowNegative, hidePhoto }: {
  channelKey: string; name: string; hint?: string; value: number
  onChange: (v: number) => void; disabled?: boolean
  photo?: ChannelPhoto; onPhotoClick?: () => void; onViewPhoto?: () => void; onClearPhoto?: () => void
  allowNegative?: boolean
  hidePhoto?: boolean
}) {
  const isUploading = photo?.status === 'uploading'
  const hasPhoto = photo && photo.status === 'uploaded' && photo.previewUrl

  return (
    <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f4f4f5' }}>
      <div className="flex justify-between items-center mb-3">
        <span style={{ fontWeight: 600, fontSize: '14px', color: '#18181b' }}>{name}</span>
        {hint && <span style={{ fontSize: '11px', color: '#a1a1aa' }}>{hint}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: hidePhoto ? '1fr' : '1fr 80px', gap: '10px', alignItems: 'center' }}>
        <input type="number" {...(allowNegative ? {} : { min: 0 })} inputMode="numeric" disabled={disabled}
          style={{ padding: '12px 14px', border: '1.5px solid #e4e4e7', borderRadius: '12px', fontSize: '20px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit', background: disabled ? '#fafafa' : '#f8fafc', outline: 'none', color: value < 0 ? '#dc2626' : '#18181b', opacity: disabled ? 0.7 : 1, width: '100%', boxSizing: 'border-box' }}
          value={value || ''} placeholder="0"
          onChange={e => onChange(parseInt(e.target.value) || 0)} />

        {!hidePhoto && <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '80px' }}>
          <button type="button"
            onClick={hasPhoto ? onViewPhoto : (disabled || isUploading ? undefined : onPhotoClick)}
            disabled={!hasPhoto && (disabled || isUploading)}
            style={{
              height: '56px', width: '80px', borderRadius: '12px',
              border: hasPhoto ? '1.5px solid #e4e4e7' : '2px dashed #e4e4e7',
              background: hasPhoto ? 'transparent' : '#f8fafc',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '2px', fontSize: '10px', fontWeight: 600, color: '#a1a1aa',
              position: 'relative', overflow: 'hidden',
              cursor: (hasPhoto || (!disabled && !isUploading)) ? 'pointer' : 'default',
              padding: 0,
            }}>
            {hasPhoto ? (
              <SharedSafePhotoImage src={photo!.previewUrl} alt="preview" thumb width={160} height={112} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '11px' }} />
            ) : (
              <>
                <span>{isUploading ? <Loader2 style={{ width: '18px', height: '18px' }} className="animate-spin" /> : <Camera style={{ width: '18px', height: '18px' }} />}</span>
                <span>{isUploading ? '上傳中' : '存證'}</span>
              </>
            )}
          </button>
          {hasPhoto && !disabled && (
            <div style={{ display: 'flex', gap: '3px' }}>
              <button type="button" onClick={onPhotoClick}
                style={{ flex: 1, padding: '4px 0', borderRadius: '8px', border: '1px solid #e4e4e7', background: 'white', fontSize: '11px', fontWeight: 600, color: '#F59E0B', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                換
              </button>
              <button type="button" onClick={onClearPhoto}
                style={{ padding: '4px 6px', borderRadius: '8px', border: '1px solid #fca5a5', background: 'white', fontSize: '11px', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}>
                ✕
              </button>
            </div>
          )}
        </div>}
      </div>
    </div>
  )
}

function SummaryBlock({ label, value, warm }: { label: string; value: string; warm?: boolean }) {
  return (
    <div className="flex justify-between items-center mt-4 rounded-2xl px-4 py-3"
      style={{ background: warm ? 'linear-gradient(135deg,#ffedd5,#fffbeb)' : 'linear-gradient(135deg,#FFFBEB,#f5f3ff)' }}>
      <span className="text-sm font-medium" style={{ color: warm ? '#7c2d12' : '#312e81' }}>{label}</span>
      <span className="text-2xl font-extrabold tabular-nums" style={{ color: warm ? '#c2410c' : '#92400E' }}>{value}</span>
    </div>
  )
}


const PINNED_CATEGORIES = ['央廚配送', '小雲', '退稅', '菜商', '豆腐', '滷蛋', '雜貨', '免洗', '惠敘', 'Uber', 'Duskin', '翁師傅', '雜項', '瓦斯']

// 收據品項下拉的分類排序：叫貨廠商 → 日用品 → 文件類型 → 退稅 → 未分類
// 央廚配送不在收據錄入中（CK 走另一個流程），由呼叫端過濾
const ORDER_VENDOR_KEYWORDS = ['菜商', '豬肉商', '雞蛋', '滷蛋', '油豆腐', '豆腐商', '雜貨', '免洗', '麵', '振源', '小雲', '海鮮', '冷凍', '飲料']
const DOC_TYPE_GROUPS = ['發票', '收據', '估價單', '公司開']
function dropdownGroupRank(name: string): number {
  if (name === '央廚配送') return 99 // 應該已被過濾，保險起見排到最後
  if (name === '未分類') return 5
  if (name === '退稅' || name === '稅金') return 4
  if (DOC_TYPE_GROUPS.includes(name)) return 3
  if (ORDER_VENDOR_KEYWORDS.some(k => name.includes(k))) return 1
  if (/商$|雲$|源$/.test(name)) return 1
  return 2 // 日用品/維護廠商
}

type MappingColumn = { name: string; category: string; vendor_group?: string; excel_column?: string; is_tax_addon?: boolean }

function directReceiptOptions(categoryName: string, categories: CategoryWithVendors[], mappingColumns: MappingColumn[]) {
  if (categoryName === '其他') {
    const configuredOptions = categories
      .find(category => category.name === categoryName)
      ?.vendors.map(vendor => vendor.name.trim())
      .filter(Boolean) ?? []
    return configuredOptions.length > 0
      ? Array.from(new Set(configuredOptions))
      : ['與分店買食材', '（賣）給分店食材', '其他']
  }

  if (categoryName === '買東西或維修') {
    const mappedOptions = mappingColumns
      .filter(column => !column.is_tax_addon && (column.category === categoryName || column.vendor_group === categoryName))
      .map(column => column.name.trim())
      .filter(Boolean)
    if (mappedOptions.length > 0) return Array.from(new Set(mappedOptions))
    const category = categories.find(item => item.name === categoryName)
    const options = category?.vendors.map(item => item.name).filter(Boolean) ?? []
    return options.length > 0 ? Array.from(new Set(options)) : DOC_TYPE_GROUPS
  }

  if (categoryName === '日常用品') {
    return Array.from(new Set(
      mappingColumns
        .filter(column => !column.is_tax_addon && (column.category === categoryName || column.vendor_group === categoryName))
        .map(column => column.name.trim())
        .filter(Boolean),
    ))
  }

  return []
}

function directReceiptLabel(categoryName: string) {
  if (categoryName === '日常用品') return '品項'
  if (categoryName === '買東西或維修') return '選擇單據類型'
  if (categoryName === '其他') return '請選擇'
  return '廠商'
}

function displayConfiguredOtherReceiptName(vendorName: string | undefined, categories: CategoryWithVendors[]) {
  const name = vendorName?.trim() ?? ''
  if (!name) return name
  const configuredName = categories
    .find(category => category.name === '其他')
    ?.vendors.find(vendor => normalizeOtherReceiptItemName(vendor.name) === normalizeOtherReceiptItemName(name))
    ?.name.trim()
  return configuredName || name
}

function receiptEntryGroups(mappingColumns: MappingColumn[]): string[] {
  const groups = new Set<string>()
  for (const col of mappingColumns) {
    const group = col.vendor_group?.trim()
    if (!group || group === '央廚配送' || group === '退稅') continue
    groups.add(group)
  }
  return Array.from(groups).sort((a, b) =>
    dropdownGroupRank(a) - dropdownGroupRank(b) || a.localeCompare(b, 'zh-Hant'),
  )
}

function CategoryPicker({ categories, value, onChange }: {
  categories: CategoryWithVendors[]
  value: string
  onChange: (v: string) => void
}) {
  // 完全依 HQ 收據設定的順序（server 已按 sort_order 排）
  const sortedAll = categories

  return (
    <select
      className="receipt-field"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', minHeight: 44, padding: '8px 12px',
        border: `1.5px solid ${value ? '#F59E0B' : '#e4e4e7'}`,
        borderRadius: 10, fontSize: 15,
        background: value ? '#FFFBEB' : 'white',
        color: value ? '#92400E' : '#71717a',
        fontWeight: value ? 600 : 400,
        outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
        appearance: 'auto',
      }}>
      <option value="">— 選擇類別 —</option>
      {sortedAll.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
    </select>
  )
}

export default function ClosingForm({ store, ckPrices, existingClosing, userId, today, todayReceipts = [], receiptCategories = [], mappingColumns = [], actualVendors = [], prevDayReserves, preReservedExpenseHints = [], isBackfill = false, realToday, calendarToday, isEarlyMorningBusinessDate = false, latestBackfillDraftDate }: Props) {
  const [data, setData] = useState<FormData>(() => initFormData(store, ckPrices, existingClosing, todayReceipts))
  const [expenses, setExpenses] = useState<Expense[]>(() => initExpenses(existingClosing, ckPrices, todayReceipts))
  const [largeCashExpenses, setLargeCashExpenses] = useState<LargeCashExpense[]>(() => initLargeCashExpenses(existingClosing))
  const [localReceipts, setLocalReceipts] = useState<TodayReceipt[]>(todayReceipts)
  const [syncing, setSyncing] = useState(false)
  const channelPhotoLsKey = `channel_photos_${store.id}_${today}`
  const receiptFormsDraftKey = `receipt_forms_draft_${store.id}_${today}`
  const [channelPhotos, setChannelPhotos] = useState<Record<string, ChannelPhoto>>(() => {
    const savedUrls: Record<string, string> = (existingClosing?.channel_photo_urls as Record<string, string>) ?? {}
    const result: Record<string, ChannelPhoto> = {}
    for (const [key, url] of Object.entries(savedUrls)) {
      if (url) result[key] = { previewUrl: url, publicUrl: url, status: 'uploaded' }
    }
    return result
  })
  useEffect(() => {
    try {
      const localUrls: Record<string, string> = JSON.parse(localStorage.getItem(channelPhotoLsKey) ?? '{}')
      const savedUrls: Record<string, string> = (existingClosing?.channel_photo_urls as Record<string, string>) ?? {}
      const merged = { ...localUrls, ...savedUrls }
      const result: Record<string, ChannelPhoto> = {}
      for (const [key, url] of Object.entries(merged)) {
        if (url) result[key] = { previewUrl: url, publicUrl: url, status: 'uploaded' }
      }
      setChannelPhotos(result)
    } catch {}
  }, [])
  const currentUploadChannelRef = useRef<{ key: string; amount: number } | null>(null)
  const channelFileRef = useRef<HTMLInputElement>(null)
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null)
  const [editVendor, setEditVendor] = useState('')
  const [editActualVendor, setEditActualVendor] = useState('')
  const [editAmount, setEditAmount] = useState(0)
  const [editCategory, setEditCategory] = useState('')
  const [editHasTax, setEditHasTax] = useState(false)
  const [editTaxAmount, setEditTaxAmount] = useState(0)
  const [editNotes, setEditNotes] = useState('')
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null)
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null)
  const [editUploading, setEditUploading] = useState(false)
  const editPhotoInputRef = useRef<HTMLInputElement>(null)
  const [editItems, setEditItems] = useState<ReceiptFormItem[]>([])
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [receiptForms, setReceiptForms] = useState<ReceiptForm[]>([])
  /** 收據卡片內照片預設展開（大圖）— 此 set 紀錄「使用者主動收起」的 receipt id */
  const [collapsedReceiptPhotos, setCollapsedReceiptPhotos] = useState<Set<string>>(new Set())
  /** 展開狀態下的照片高度：S=60(小條) / M=200(中) / L=380(大) */
  const [receiptPhotoSize, setReceiptPhotoSize] = useState<Record<string, 'S' | 'M' | 'L'>>({})
  const [verifyItems, setVerifyItems] = useState<VerifyItem[]>([])
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  const [stepMounted, setStepMounted] = useState(false)
  const [finishingToday, setFinishingToday] = useState(false)
  const [finishError, setFinishError] = useState('')
  const categories = receiptCategories
  const [knownActualVendors, setKnownActualVendors] = useState(actualVendors)
  useEffect(() => { setKnownActualVendors(actualVendors) }, [actualVendors])
  const actualVendorOptions = useCallback((vendorGroup: string) => {
    const group = vendorGroup.trim()
    return knownActualVendors
      .filter(v => !group || v.vendor_group === group)
      .map(v => v.name)
      .filter((name, index, arr) => !!name && arr.indexOf(name) === index)
  }, [knownActualVendors])
  const [ckQuantities, setCkQuantities] = useState<Record<string, number>>(() => {
    const result: Record<string, number> = {}
    ckPrices.forEach(p => { result[p.id] = 0 })
    if (existingClosing) {
      const items = existingClosing.order_items ?? []
      ckPrices.forEach(p => {
        const found = items.find((i: any) => i.vendor === '央廚' && i.item_name === p.item_name)
        if (found) result[p.id] = found.quantity ?? 0
      })
    }
    return result
  })
  const ckQuantitiesRef = useRef(ckQuantities)
  ckQuantitiesRef.current = ckQuantities
  // 央廚單價覆寫：補做過往帳目、退回修改時保留帳目當時輸入的單價。
  // 今日一般草稿重新整理時跟上總公司最新單價，避免舊草稿把新價蓋掉。
  // key = ckPrice.id, value = 覆寫單價（沒覆寫就用 ckPrice.unit_price）
  const [ckPriceOverrides, setCkPriceOverrides] = useState<Record<string, number>>(() => {
    const result: Record<string, number> = {}
    const shouldKeepSavedPrice = isBackfill || existingClosing?.status === 'disputed'
    if (existingClosing && shouldKeepSavedPrice) {
      const items = existingClosing.order_items ?? []
      ckPrices.forEach(p => {
        const found = items.find((i: any) => i.vendor === '央廚' && i.item_name === p.item_name)
        // 補做/退回時，以原帳目實際單價為準，避免退回後單價欄變空或被總公司新價覆蓋。
        if (found && typeof found.unit_price === 'number') {
          result[p.id] = found.unit_price
        }
      })
    }
    return result
  })
  const ckPriceOverridesRef = useRef(ckPriceOverrides)
  ckPriceOverridesRef.current = ckPriceOverrides
  // 取得每個品項的有效單價：先看覆寫、沒有就用 ckPrices 預設
  const effectiveCKPrice = useCallback((p: CKPrice) => ckPriceOverrides[p.id] ?? p.unit_price, [ckPriceOverrides])
  const [ckPhotoPreview, setCkPhotoPreview] = useState<string | undefined>(undefined)
  const ckPhotoLsKey = `ck_photo_${store.id}_${today}`
  const [ckPhotoUrl, setCkPhotoUrl] = useState<string | undefined>(
    existingClosing?.ck_delivery_photo_url ?? undefined
  )
  useEffect(() => {
    if (!existingClosing?.ck_delivery_photo_url) {
      const stored = localStorage.getItem(ckPhotoLsKey)
      if (stored) setCkPhotoUrl(stored)
    }
  }, [])
  const ckPhotoSectionRef = useRef<HTMLDivElement>(null)
  const ckPhotoInputRef = useRef<HTMLInputElement>(null)
  // 只要有任一央廚配送數量，就必須有已成功上傳的配送單照片。
  // 預覽圖不算完成上傳，避免檔案上傳失敗時仍能略過驗證。
  const hasCkDeliveryQuantity = ckPrices.some(p => (ckQuantities[p.id] ?? 0) > 0)
  const hasCkDeliveryPhoto = Boolean(ckPhotoUrl)

  // Envelope bag photo
  const [envelopePhotoPreview, setEnvelopePhotoPreview] = useState<string | undefined>(undefined)
  const envelopePhotoLsKey = `envelope_photo_${store.id}_${today}`
  const [envelopePhotoUrl, setEnvelopePhotoUrl] = useState<string | undefined>(
    (existingClosing as any)?.envelope_photo_url ?? undefined
  )
  useEffect(() => {
    if (!(existingClosing as any)?.envelope_photo_url) {
      const stored = localStorage.getItem(envelopePhotoLsKey)
      if (stored) setEnvelopePhotoUrl(stored)
    }
  }, [])
  const envelopePhotoInputRef = useRef<HTMLInputElement>(null)

  // 更多照片（選填）：零用金核對、其他款項等。結構 [{ url, label }]
  type ExtraPhoto = { url: string; label: string }
  function normalizeExtraPhotoList(saved: unknown): ExtraPhoto[] {
    if (!Array.isArray(saved)) return []
    return saved.flatMap((photo, index) => {
      if (typeof photo === 'string') {
        const url = photo.trim()
        return url ? [{ url, label: `附加照片 ${index + 1}` }] : []
      }
      if (!photo || typeof photo !== 'object') return []
      const row = photo as { url?: unknown; label?: unknown }
      const url = typeof row.url === 'string' ? row.url.trim() : ''
      if (!url) return []
      const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : `附加照片 ${index + 1}`
      return [{ url, label }]
    })
  }
  const [extraPhotos, setExtraPhotos] = useState<ExtraPhoto[]>(() => {
    const saved = (existingClosing as any)?.extra_photo_urls
    return normalizeExtraPhotoList(saved)
  })
  const extraPhotosLsKey = `extra_photos_${store.id}_${today}`
  useEffect(() => {
    const saved = (existingClosing as any)?.extra_photo_urls
    if (!Array.isArray(saved) || saved.length === 0) {
      try {
        const stored = normalizeExtraPhotoList(JSON.parse(localStorage.getItem(extraPhotosLsKey) ?? '[]'))
        if (stored.length > 0) setExtraPhotos(stored)
      } catch {}
    }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(extraPhotosLsKey, JSON.stringify(extraPhotos)) } catch {}
  }, [extraPhotos])
  const extraPhotoInputRef = useRef<HTMLInputElement>(null)
  const [extraPhotoUploadLabel, setExtraPhotoUploadLabel] = useState<string>('零用金核對')
  const [extraPhotoUploading, setExtraPhotoUploading] = useState(false)
  const [extraPhotosOpen, setExtraPhotosOpen] = useState(false)

  // Void invoice photos (multiple)
  const [voidInvoicePhotos, setVoidInvoicePhotos] = useState<string[]>(() => {
    const saved = (existingClosing as any)?.void_invoice_photo_urls
    if (Array.isArray(saved) && saved.length > 0) return saved
    return []
  })
  const voidInvoiceLsKey = `void_invoice_photos_${store.id}_${today}`
  useEffect(() => {
    const saved = (existingClosing as any)?.void_invoice_photo_urls
    if (!Array.isArray(saved) || saved.length === 0) {
      try {
        const stored = JSON.parse(localStorage.getItem(voidInvoiceLsKey) ?? '[]')
        if (Array.isArray(stored) && stored.length > 0) setVoidInvoicePhotos(stored)
      } catch {}
    }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(voidInvoiceLsKey, JSON.stringify(voidInvoicePhotos)) } catch {}
  }, [voidInvoicePhotos])
  const voidInvoiceInputRef = useRef<HTMLInputElement>(null)
  const [voidInvoiceUploading, setVoidInvoiceUploading] = useState(false)

  // Note photo
  const [notePhotoPreview, setNotePhotoPreview] = useState<string | undefined>(undefined)
  const notePhotoLsKey = `note_photo_${store.id}_${today}`
  const [notePhotoUrl, setNotePhotoUrl] = useState<string | undefined>(
    (existingClosing as any)?.note_photo_url ?? undefined
  )
  useEffect(() => {
    if (!(existingClosing as any)?.note_photo_url) {
      const stored = localStorage.getItem(notePhotoLsKey)
      if (stored) setNotePhotoUrl(stored)
    }
  }, [])
  const notePhotoInputRef = useRef<HTMLInputElement>(null)

  const [handwriteOrders, setHandwriteOrders] = useState<HandwriteOrder[]>(() => initHandwriteOrders(existingClosing))
  // 初始化時先讀取本機草稿，再允許寫回。否則首次 render 的空陣列會先覆蓋
  // 使用者剛輸入的手寫菜單金額，造成重新整理後資料消失。
  const [handwriteOrdersHydrated, setHandwriteOrdersHydrated] = useState(false)
  const handwriteOrdersRef = useRef(handwriteOrders)
  handwriteOrdersRef.current = handwriteOrders
  const handwriteOrdersLsKey = `handwrite_orders_${store.id}_${today}`
  useEffect(() => {
    if ((existingClosing?.handwrite_orders ?? []).length === 0) {
      try {
        const stored = JSON.parse(localStorage.getItem(handwriteOrdersLsKey) ?? '[]')
        if (Array.isArray(stored) && stored.length > 0) setHandwriteOrders(stored)
      } catch {}
    }
    setHandwriteOrdersHydrated(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [adjustments, setAdjustments] = useState<RemittanceAdjustment[]>(() => {
    const saved = existingClosing?.remittance_adjustments
    if (Array.isArray(saved) && saved.length > 0) {
      // 顧客匯款在現金清點是「正的收入」；進入匯款調整後才以負數扣除非現金。
      return saved.map(item => item.type === 'customer_transfer'
        ? { ...item, amount: -Math.abs(Number(item.amount) || 0) }
        : item)
    }
    return []
  })
  const [showAdjForm, setShowAdjForm] = useState(false)
  const [adjForm, setAdjForm] = useState<Omit<RemittanceAdjustment, 'id'>>({ type: 'advance', label: '', amount: 0, person: '' })
  const customerTransferAmount = useMemo(
    () => adjustments
      .filter(item => item.type === 'customer_transfer')
      .reduce((sum, item) => sum + Math.abs(Number(item.amount) || 0), 0),
    [adjustments],
  )
  function updateCustomerTransferAmount(amount: number) {
    const normalized = Math.abs(Number(amount) || 0)
    setAdjustments(prev => {
      const existing = prev.find(item => item.type === 'customer_transfer')
      const withoutCustomerTransfers = prev.filter(item => item.type !== 'customer_transfer')
      if (normalized <= 0) return withoutCustomerTransfers
      return [
        ...withoutCustomerTransfers,
        {
          id: existing?.id ?? crypto.randomUUID(),
          type: 'customer_transfer' as const,
          label: '顧客匯款收入',
          amount: -normalized,
          person: existing?.person ?? '',
        },
      ]
    })
  }
  const adjLsKey = `remit_adj_${store.id}_${today}`
  useEffect(() => {
    if (existingClosing?.remittance_adjustments && (existingClosing.remittance_adjustments as any[]).length > 0) return
    try {
      const stored = JSON.parse(localStorage.getItem(adjLsKey) ?? '[]')
      if (Array.isArray(stored) && stored.length > 0) setAdjustments(stored)
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem(adjLsKey, JSON.stringify(adjustments)) } catch {}
  }, [adjustments])
  const [reserves, setReserves] = useState<ReserveItem[]>(() => {
    const saved = existingClosing?.reserve_items
    if (Array.isArray(saved) && saved.length > 0) return saved
    return []
  })
  const [showReserveForm, setShowReserveForm] = useState(false)
  const [reserveForm, setReserveForm] = useState<Omit<ReserveItem, 'id'>>({ reason: '電費', amount: 0, total_bill: 0 })
  const reserveLsKey = `reserve_items_${store.id}_${today}`
  useEffect(() => {
    if (existingClosing?.reserve_items && (existingClosing.reserve_items as any[]).length > 0) return
    try {
      const stored = JSON.parse(localStorage.getItem(reserveLsKey) ?? '[]')
      if (Array.isArray(stored) && stored.length > 0) setReserves(stored)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    try { localStorage.setItem(reserveLsKey, JSON.stringify(reserves)) } catch {}
  }, [reserves])
  const cashLsKey = `cash_counts_${store.id}_${today}`
  const CASH_KEYS = ['bills_1000','bills_500','bills_100','coins_50','coins_10','coins_5','coins_1','lump_1000','lump_500','lump_100','lump_50','lump_10','lump_5','lump_1'] as const
  useEffect(() => {
    const dbTotal = CASH_KEYS.reduce((s, k) => s + ((existingClosing?.cash_counts?.[0]?.[k] ?? 0) as number), 0)
    const dbLargeExpenses = existingClosing?.cash_counts?.[0]?.large_expenses
    if (dbTotal > 0 || (Array.isArray(dbLargeExpenses) && dbLargeExpenses.length > 0)) return
    try {
      const stored = JSON.parse(localStorage.getItem(cashLsKey) ?? 'null')
      if (stored && typeof stored === 'object') {
        setData(prev => ({ ...prev, ...Object.fromEntries(CASH_KEYS.map(k => [k, stored[k] ?? 0])) }))
        if (Array.isArray(stored.large_expenses)) setLargeCashExpenses(stored.large_expenses)
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const h = setTimeout(() => {
      try {
        const normalizedLargeExpenses = largeCashExpenses
          .map(item => ({ ...item, description: item.description.trim(), amount: Math.abs(item.amount || 0) }))
          .filter(item => item.amount > 0 || item.description)
        const cashData = {
          ...Object.fromEntries(CASH_KEYS.map(k => [k, data[k]])),
          large_expenses: normalizedLargeExpenses,
        }
        const total = CASH_KEYS.reduce((s, k) => s + (data[k] as number), 0)
        if (total > 0 || normalizedLargeExpenses.length > 0) localStorage.setItem(cashLsKey, JSON.stringify(cashData))
      } catch {}
    }, 300)
    return () => clearTimeout(h)
  }, [...CASH_KEYS.map(k => data[k]), largeCashExpenses])
  // Bug fix: 需在 restore 完成後才允許 persist
  //   原因：receiptForms 初始 []，persist useEffect on mount 會先執行→把 localStorage 清空
  //   再 restore 就找不到 draft → 類別/廠商全消失
  const [receiptFormsHydrated, setReceiptFormsHydrated] = useState(false)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(receiptFormsDraftKey)
      if (stored) {
        const parsed = JSON.parse(stored) as ReceiptForm[]
        setReceiptForms(parsed.map(f => ({ ...f, actual_vendor_name: f.actual_vendor_name ?? '', file: undefined, previewUrl: undefined, uploading: false })))
      }
    } catch {}
    setReceiptFormsHydrated(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!receiptFormsHydrated) return
    try {
      const toStore = receiptForms
        .filter(f => !f.uploading)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ file, previewUrl, ...rest }) => rest)
      if (toStore.length > 0) localStorage.setItem(receiptFormsDraftKey, JSON.stringify(toStore))
      else localStorage.removeItem(receiptFormsDraftKey)
    } catch {}
  }, [receiptForms, receiptFormsHydrated, receiptFormsDraftKey])
  const stepLsKey = `closing_step_${store.id}_${today}`
  const submitDoneSsKey = `submit_done_${store.id}_${today}`
  const saveBkKey = `save_bk_${store.id}_${today}`
  const verifyDoneLsKey = `verify_done_${store.id}_${today}`
  const verifyResetLsKey = `verify_reset_${store.id}_${today}`
  const summaryHref = `/manager/summary?date=${encodeURIComponent(today)}`
  const [currentStep, setCurrentStep] = useState(0)
  const [hqDeletedReset, setHqDeletedReset] = useState(false)
  const stepButtonRefs = useRef<(HTMLButtonElement | null)[]>([])
  // useLayoutEffect runs synchronously before browser paint → user never sees step-0 flash
  // On SSR it's silently skipped (no window), so no hydration mismatch
  useLayoutEffect(() => {
    const totalStepsEstimate = (store.mode !== 'ichef') ? 10 : 9
    const pettyIdx = totalStepsEstimate - 3

    // 偵測零用金是否已完成
    const dbPetty = (existingClosing as { petty_counts?: { verified_at?: string } } | null)?.petty_counts
    const dbPettyDone = !!dbPetty?.verified_at
    let donePressed = false
    try { donePressed = localStorage.getItem(`petty_done_${store.id}_${today}`) === '1' } catch {}
    let submitFlag = false
    try { submitFlag = localStorage.getItem(`submit_done_${store.id}_${today}`) === '1' } catch {}
    const pettyDone = dbPettyDone || donePressed
    const wasFinishedBefore = submitFlag || donePressed
    const stale = [
      stepLsKey, submitDoneSsKey,
      `petty_counts_${store.id}_${today}`,
      `petty_done_${store.id}_${today}`,
      cashLsKey, adjLsKey, reserveLsKey,
      ckPhotoLsKey, channelPhotoLsKey, envelopePhotoLsKey,
      extraPhotosLsKey, voidInvoiceLsKey, notePhotoLsKey,
      receiptFormsDraftKey, saveBkKey, verifyDoneLsKey, verifyResetLsKey,
    ]
    let hasFinishedTrace = wasFinishedBefore
    try {
      hasFinishedTrace =
        hasFinishedTrace ||
        localStorage.getItem(submitDoneSsKey) === '1' ||
        localStorage.getItem(verifyDoneLsKey) === '1'
    } catch {}

    // 偵測「HQ 刪除帳目」情境：只有已完成/送出的本機痕跡，但 DB 卻沒有 closing 記錄時才清空。
    // 單純上傳照片或草稿不代表總公司刪除，否則尚未輸入內容的照片會在返回時被清掉。
    if (!existingClosing && hasFinishedTrace) {
      for (const k of stale) try { localStorage.removeItem(k) } catch {}
      setCurrentStep(0)
      setHqDeletedReset(true)
      toast.warning('總公司已刪除此日帳目，請重新完成今日帳目')
      setStepMounted(true)
      return
    }

    if (existingClosing?.status === 'disputed') {
      localStorage.removeItem(stepLsKey)
      localStorage.removeItem(submitDoneSsKey)
    } else if (existingClosing?.status === 'submitted' || existingClosing?.status === 'verified') {
      localStorage.removeItem(stepLsKey)
      if (pettyDone) {
        router.replace(summaryHref)
        return
      }
      setCurrentStep(pettyIdx)
    } else {
      const saved = parseInt(localStorage.getItem(stepLsKey) ?? '0') || 0
      if (saved > 0) {
        setCurrentStep(saved)
      }
    }
    setStepMounted(true)
  }, [])
  const [submitDone, setSubmitDone] = useState(() => {
    // Treat already-submitted/verified closings as submitDone regardless of localStorage,
    // so navigation (tabs, bottom bar, petty step) is always accessible across sessions/devices
    if (existingClosing?.status === 'submitted' || existingClosing?.status === 'verified') return true
    if (existingClosing?.status === 'draft' || existingClosing?.status === 'disputed') return false
    try { return localStorage.getItem(`submit_done_${store.id}_${today}`) === '1' } catch { return false }
  })
  // On mount: if a previous save was interrupted, automatically restore backed-up form data.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(saveBkKey)
      if (!raw) return
      const bk = JSON.parse(raw)
      if (bk?.storeId && bk.storeId !== store.id) { localStorage.removeItem(saveBkKey); return }
      if (bk?.date && bk.date !== today) { localStorage.removeItem(saveBkKey); return }
      if (bk?.submitted || bk?.status === 'submitted' || bk?.status === 'verified') { localStorage.removeItem(saveBkKey); return }
      if (existingClosing?.status === 'submitted' || existingClosing?.status === 'verified' || submitDone) {
        localStorage.removeItem(saveBkKey)
        return
      }
      // 退回帳目延長備份保留至 7 天；一般草稿 24 小時
      const maxAge = existingClosing?.status === 'disputed' ? 7 * 86400000 : 86400000
      if (!bk?.ts || Date.now() - bk.ts > maxAge) { localStorage.removeItem(saveBkKey); return }
      const dbUpdatedAt = (existingClosing as any)?.updated_at ? new Date((existingClosing as any).updated_at).getTime() : 0
      // 退回帳目：若 DB 現金清點全為 0（total公司 dispute 只改 status，不影響 cash_counts）
      // 且備份有現金資料 → 一律彈出恢復（不受 timestamp 比較限制）
      const dbCashEmpty = CASH_KEYS.every(k => ((existingClosing?.cash_counts as any)?.[0]?.[k] ?? 0) === 0)
      const bkHasCash = bk.data && CASH_KEYS.some(k => (bk.data[k] ?? 0) > 0)
      const isDisputedWithLostCash = existingClosing?.status === 'disputed' && dbCashEmpty && bkHasCash
      if (!isDisputedWithLostCash && bk.ts <= dbUpdatedAt + 3000) return  // DB 較新（含 3 秒容差） → 不套用暫存

      if (bk.data) setData(bk.data)
      if (Array.isArray(bk.expenses)) setExpenses(bk.expenses)
      if (Array.isArray(bk.handwriteOrders)) setHandwriteOrders(bk.handwriteOrders)
      if (Array.isArray(bk.adjustments)) setAdjustments(bk.adjustments)
      if (Array.isArray(bk.reserves)) setReserves(bk.reserves)
      if (Array.isArray(bk.largeCashExpenses)) setLargeCashExpenses(bk.largeCashExpenses)
      if (bk.ckQuantities && typeof bk.ckQuantities === 'object') setCkQuantities(bk.ckQuantities)
      if (bk.ckPriceOverrides && typeof bk.ckPriceOverrides === 'object') setCkPriceOverrides(bk.ckPriceOverrides)
      if (bk.pettyCounts && typeof bk.pettyCounts === 'object') setPettyCounts(bk.pettyCounts)
      if (bk.pettyLumps && typeof bk.pettyLumps === 'object') setPettyLumps(bk.pettyLumps)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const pettyLsKey = `petty_counts_${store.id}_${today}`
  // 優先用 DB 的 petty_counts（換裝置仍能看到），fallback 到 localStorage
  const dbPettyCounts = (existingClosing as { petty_counts?: { counts?: Record<string, number>; lumps?: Record<string, number> } } | null)?.petty_counts
  const [pettyCounts, setPettyCounts] = useState<Record<string, number>>(() => dbPettyCounts?.counts ?? {})
  const [pettyLumps, setPettyLumps] = useState<Record<string, number>>(() => dbPettyCounts?.lumps ?? {})
  const [pettyFinished, setPettyFinished] = useState(() => {
    const dbDone = !!(existingClosing as { petty_counts?: { verified_at?: string } } | null)?.petty_counts?.verified_at
    if (dbDone) return true
    try { return localStorage.getItem(`petty_done_${store.id}_${today}`) === '1' } catch { return false }
  })
  useEffect(() => {
    if (dbPettyCounts?.counts || dbPettyCounts?.lumps) return  // 已從 DB 初始化
    try {
      const stored = JSON.parse(localStorage.getItem(pettyLsKey) ?? 'null')
      if (stored?.counts && Object.keys(stored.counts).length > 0) setPettyCounts(stored.counts)
      if (stored?.lumps && Object.keys(stored.lumps).length > 0) setPettyLumps(stored.lumps)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // localStorage 雙寫（離線/暫存用，debounce 300ms 減少頻繁 stringify）
  useEffect(() => {
    const h = setTimeout(() => {
      const total = Object.values(pettyCounts).reduce((s, v) => s + v, 0) + Object.values(pettyLumps).reduce((s, v) => s + v, 0)
      if (total > 0) try { localStorage.setItem(pettyLsKey, JSON.stringify({ counts: pettyCounts, lumps: pettyLumps })) } catch {}
    }, 300)
    return () => clearTimeout(h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pettyCounts), JSON.stringify(pettyLumps)])
  const [newOrderNum, setNewOrderNum] = useState('')
  const [newOrderAmt, setNewOrderAmt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savingPetty, setSavingPetty] = useState(false)
  const savingRef = useRef(false)  // mutex 防止並發 handleSave 衝突（自動存 + 手動下一步）
  const backgroundSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (backgroundSaveTimerRef.current) clearTimeout(backgroundSaveTimerRef.current)
  }, [])
  const [submitting, setSubmitting] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(existingClosing?.id ?? null)
  // DB 寫入零用金清點：debounced 1.5 秒（放在 closingId 宣告後）
  useEffect(() => {
    const cid = existingClosing?.id ?? closingId
    if (!cid) return
    const total = Object.values(pettyCounts).reduce((s, v) => s + v, 0) + Object.values(pettyLumps).reduce((s, v) => s + v, 0)
    if (total === 0) return
    const t = setTimeout(() => { void savePettyCounts(cid, pettyCounts, pettyLumps) }, 1500)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pettyCounts), JSON.stringify(pettyLumps), closingId])
  const [status, setStatus] = useState(existingClosing?.status ?? 'draft')
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(0)
  const [replaceRangeStart, setReplaceRangeStart] = useState(0)
  const [replaceRangeEnd, setReplaceRangeEnd] = useState(0)
  const [replaceRangeNewStart, setReplaceRangeNewStart] = useState(0)
  const [replaceRangeNewEnd, setReplaceRangeNewEnd] = useState(0)
  const router = useRouter()
  const newOrderNumRef = useRef<HTMLInputElement>(null)
  const newOrderAmtRef = useRef<HTMLInputElement>(null)
  const amtRefsMap = useRef<Map<string, HTMLInputElement>>(new Map())
  const ckQtyRefsMap = useRef<Map<string, HTMLInputElement>>(new Map())
  const cashCountRefs = useRef<(HTMLInputElement | null)[]>(Array(14).fill(null))
  const pettyRefs = useRef<(HTMLInputElement | null)[]>(Array(14).fill(null))
  const dataRef = useRef(data)
  dataRef.current = data

  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + (e.amount || 0), 0), [expenses])
  const handwriteTotal = useMemo(() => handwriteOrders.reduce((sum, o) => sum + (o.voided ? 0 : (o.amount || 0)), 0), [handwriteOrders])
  const s = useMemo(
    () => calcSummary(data, store, ckPrices, totalExpenses, handwriteTotal, adjustments, reserves, largeCashExpenses),
    [data, store, ckPrices, totalExpenses, handwriteTotal, adjustments, reserves, largeCashExpenses],
  )
  const hasRemittanceChange = s.totalReserved > 0 || s.adjustmentTotal !== 0 || s.preReservedExpenseTotal > 0
  // 信封袋實際裝的是完成匯款調整、扣除預留款後要交回 HQ 的金額。
  // 例如整筆現金預留營業稅時 remitToHQ = 0，當天不會有信封，也不應要求照片。
  const requiresEnvelopePhoto = s.remitToHQ > 0
  const isLocked = (status === 'submitted' || status === 'verified') && !submitDone
  const isDisputed = status === 'disputed'
  const disputeNote = existingClosing?.dispute_note ?? ''
  const pendingRentReserve = useMemo(() => {
    const items = prevDayReserves?.items ?? []
    return items.find(item =>
      item.reason === '房租' &&
      (item.total_bill ?? 0) > 0 &&
      (item.remaining_amount ?? ((item.total_bill ?? 0) - item.amount)) > 0
    ) ?? null
  }, [prevDayReserves])

  // 若前幾日已有同名預留款，且本日輸入相同的大額支出，預設視為由預留款支付。
  // 只有尚未明確設定過的資料才自動判定；使用者取消勾選後不會被重新勾回。
  useEffect(() => {
    if (isLocked || submitDone || preReservedExpenseHints.length === 0) return
    setLargeCashExpenses(prev => {
      let changed = false
      const next = prev.map(item => {
        if (item.preReserved === true || item.amount <= 0 || !item.description.trim()) return item
        const reason = normalizeReserveReason(item.description)
        const hint = preReservedExpenseHints.find(candidate => normalizeReserveReason(candidate.reason) === reason)
        if (!hint) return item
        // 有帳單總額時只自動套用到同額支出；沒有總額的舊預留資料則以同名為準。
        if (hint.total_bill && Math.abs(Math.abs(item.amount) - hint.total_bill) > 1) return item
        changed = true
        return { ...item, preReserved: true }
      })
      return changed ? next : prev
    })
  }, [isLocked, submitDone, preReservedExpenseHints, largeCashExpenses])

  useEffect(() => {
    if (!pendingRentReserve || isLocked || submitDone) return
    const savedReserves = Array.isArray(existingClosing?.reserve_items) ? existingClosing.reserve_items as ReserveItem[] : []
    const savedManualMatching = savedReserves.find(item =>
      item.reason === '房租' && item.total_bill === pendingRentReserve.total_bill && !item.auto_reserved,
    )
    if (savedManualMatching) return
    try {
      const stored = JSON.parse(localStorage.getItem(reserveLsKey) ?? '[]')
      // 初次掛載等待 localStorage 還原；還原完成後允許自動預留金額跟著實匯入更新。
      if (reserves.length === 0 && Array.isArray(stored) && stored.length > 0) return
    } catch {}

    const remaining = Math.max(0, pendingRentReserve.remaining_amount ?? ((pendingRentReserve.total_bill ?? 0) - pendingRentReserve.amount))
    const amount = Math.min(Math.max(0, Math.round(s.finalRemit)), remaining)
    setReserves(prev => {
      const existingAuto = prev.find(item =>
        item.reason === '房租' && item.total_bill === pendingRentReserve.total_bill && item.auto_reserved,
      )
      if (existingAuto) {
        if (amount <= 0) return prev.filter(item => item.id !== existingAuto.id)
        return prev.map(item => item.id === existingAuto.id
          ? {
              ...item,
              amount,
              source_start_date: pendingRentReserve.started_date,
              accumulated_before: pendingRentReserve.amount,
            }
          : item)
      }
      // 使用者若已手動建立同一筆預留，保留手動金額。
      if (prev.some(item => item.reason === '房租' && item.total_bill === pendingRentReserve.total_bill)) return prev
      if (amount <= 0) return prev
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          reason: '房租',
          amount,
          total_bill: pendingRentReserve.total_bill,
          auto_reserved: true,
          source_start_date: pendingRentReserve.started_date,
          accumulated_before: pendingRentReserve.amount,
        },
      ]
    })
  }, [pendingRentReserve, isLocked, submitDone, existingClosing?.reserve_items, reserves, reserveLsKey, s.finalRemit])

  // 歷史資料補足後，舊草稿可能還留著前一版自動帶入的房租預留。
  // 沒有未結清帳單時移除這筆暫存，避免畫面仍顯示已完成的差額。
  useEffect(() => {
    if (pendingRentReserve || isLocked || submitDone) return
    setReserves(prev => {
      const next = prev.filter(item => !(item.auto_reserved && item.reason.trim() === '房租'))
      return next.length === prev.length ? prev : next
    })
  }, [pendingRentReserve, isLocked, submitDone])

  useEffect(() => {
    if (!handwriteOrdersHydrated || isLocked || submitDone) return
    try {
      if (handwriteOrders.length > 0) localStorage.setItem(handwriteOrdersLsKey, JSON.stringify(handwriteOrders))
      else localStorage.removeItem(handwriteOrdersLsKey)
    } catch {}
  }, [handwriteOrders, handwriteOrdersHydrated, handwriteOrdersLsKey, isLocked, submitDone])

  const absVar = Math.abs(s.variance)
  const varColor = absVar === 0 ? '#047857' : absVar <= 200 ? '#b45309' : '#be123c'
  const varBg    = absVar === 0 ? '#d1fae5' : absVar <= 200 ? '#fef3c7' : '#ffe4e6'
  const varBorder = absVar === 0 ? '#6ee7b7' : absVar <= 200 ? '#fcd34d' : '#fda4af'
  const varMsg   = absVar === 0 ? '完美對帳！✓' : absVar <= 200 ? '差距微小，請確認' : '差距過大，請重新核查'

  const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    draft:     { bg: '#f4f4f5', color: '#71717a', label: '草稿' },
    submitted: { bg: '#FFFBEB', color: '#92400E', label: '已送出' },
    verified:  { bg: '#d1fae5', color: '#047857', label: '已審核' },
    disputed:  { bg: '#ffe4e6', color: '#be123c', label: '退回修改' },
  }
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.draft

  const set = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setData(prev => ({ ...prev, [key]: value }))
  }, [])
  const addLargeCashExpense = useCallback(() => {
    setLargeCashExpenses(prev => [...prev, { id: crypto.randomUUID(), description: '', amount: 0 }])
  }, [])
  const updateLargeCashExpense = useCallback(<K extends keyof LargeCashExpense>(id: string, key: K, value: LargeCashExpense[K]) => {
    setLargeCashExpenses(prev => prev.map(item => item.id === id ? { ...item, [key]: value } : item))
  }, [])
  const removeLargeCashExpense = useCallback((id: string) => {
    setLargeCashExpenses(prev => prev.filter(item => item.id !== id))
  }, [])
  useEffect(() => {
    if (isLocked || submitDone) return
    const t = setInterval(() => handleSave(true), 60000)
    return () => clearInterval(t)
    // 任何會寫進 handleSave payload 的 state 都要列依賴，否則 60 秒定時器拿到的是 stale closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, expenses, handwriteOrders, adjustments, reserves, largeCashExpenses, channelPhotos, ckPhotoUrl, envelopePhotoUrl, extraPhotos, voidInvoicePhotos, notePhotoUrl, ckQuantities, ckPriceOverrides, isLocked, isDisputed, submitDone])

  // 主要 state 變動 debounced 寫 localStorage backup（每 500ms）— 切頁前一定有最新 snapshot
  useEffect(() => {
    if (isLocked || submitDone) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(saveBkKey, JSON.stringify({
          storeId: store.id, date: today, status, submitted: false,
          data, expenses, handwriteOrders, adjustments, reserves, largeCashExpenses,
          ckQuantities: ckQuantitiesRef.current, ckPriceOverrides: ckPriceOverridesRef.current,
          pettyCounts, pettyLumps, ts: Date.now(),
        }))
      } catch {}
    }, 500)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, expenses, handwriteOrders, adjustments, reserves, largeCashExpenses, ckPriceOverrides, pettyCounts, pettyLumps])

  // 頁面切換 / 關閉前立即 flush + 離頁警告
  useEffect(() => {
    if (isLocked || submitDone) return
    function flush() {
      try {
        localStorage.setItem(saveBkKey, JSON.stringify({
          storeId: store.id, date: today, status, submitted: false,
          data: dataRef.current, expenses, handwriteOrders, adjustments, reserves,
          largeCashExpenses, ckQuantities: ckQuantitiesRef.current, ckPriceOverrides: ckPriceOverridesRef.current,
          pettyCounts, pettyLumps, ts: Date.now(),
        }))
      } catch {}
    }
    function onVisibilityChange() { if (document.visibilityState === 'hidden') flush() }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      flush()
      // 彈出離頁確認（瀏覽器內建對話框，文字無法自訂）
      e.preventDefault()
      e.returnValue = '做帳尚未送出，確定要離開？資料已自動備份，下次進入可恢復。'
    }
    window.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, handwriteOrders, adjustments, reserves, largeCashExpenses, ckPriceOverrides, pettyCounts, pettyLumps, isLocked, submitDone])

  useEffect(() => {
    const fromQty = ckPrices.reduce((sum, p) => sum + (ckQuantities[p.id] || 0) * effectiveCKPrice(p), 0)
    // Only override when quantities produce a positive total (handles both current and legacy order_items format)
    if (fromQty > 0) set('ck_total', fromQty)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ckQuantities, ckPriceOverrides])




  async function handleCkPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setCkPhotoPreview(URL.createObjectURL(file))
    const ext = file.name.split('.').pop() || 'jpg'
    const path = storePhotoPath(store.id, today, 'closing/ck-delivery', `ck-delivery.${ext}`)
    const result = await uploadReceiptPhoto(path, file)
    if ('error' in result) { toast.error('照片上傳失敗：' + result.error); return }
    setCkPhotoUrl(result.publicUrl)
    localStorage.setItem(ckPhotoLsKey, result.publicUrl)
    toast.success('配送單照片已上傳')
  }

  function handleClearCkPhoto() {
    setCkPhotoPreview(undefined)
    setCkPhotoUrl(undefined)
    try { localStorage.removeItem(ckPhotoLsKey) } catch {}
    toast.success('配送單照片已刪除')
  }

  async function handleEnvelopePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setEnvelopePhotoPreview(URL.createObjectURL(file))
    const ext = file.name.split('.').pop() || 'jpg'
    const path = storePhotoPath(store.id, today, 'closing/envelope', `envelope.${ext}`)
    const result = await uploadReceiptPhoto(path, file)
    if ('error' in result) { toast.error('照片上傳失敗：' + result.error); return }
    setEnvelopePhotoUrl(result.publicUrl)
    localStorage.setItem(envelopePhotoLsKey, result.publicUrl)
    toast.success('信封袋照片已上傳')
  }

  async function handleExtraPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setExtraPhotoUploading(true)
    const ext = file.name.split('.').pop() || 'jpg'
    // 用 UUID 確保檔名唯一，避免連續上傳時 length 取到舊值造成路徑衝突
    const uniqueId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const path = storePhotoPath(store.id, today, 'closing/extra', `extra-${uniqueId}.${ext}`)
    const result = await uploadReceiptPhoto(path, file)
    setExtraPhotoUploading(false)
    if ('error' in result) { toast.error('照片上傳失敗：' + result.error); return }
    setExtraPhotos(prev => [...prev, { url: result.publicUrl, label: extraPhotoUploadLabel }])
    toast.success(`${extraPhotoUploadLabel}照片已上傳`)
  }

  async function handleVoidInvoicePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setVoidInvoiceUploading(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const idx = voidInvoicePhotos.length
    const path = storePhotoPath(store.id, today, 'closing/void-invoice', `void-invoice-${idx}.${ext}`)
    const result = await uploadReceiptPhoto(path, file)
    setVoidInvoiceUploading(false)
    if ('error' in result) { toast.error('照片上傳失敗：' + result.error); return }
    setVoidInvoicePhotos(prev => [...prev, result.publicUrl])
    toast.success('作廢發票照片已上傳')
  }

  async function handleNotePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setNotePhotoPreview(URL.createObjectURL(file))
    const ext = file.name.split('.').pop() || 'jpg'
    const path = storePhotoPath(store.id, today, 'closing/note', `note.${ext}`)
    const result = await uploadReceiptPhoto(path, file)
    if ('error' in result) { toast.error('照片上傳失敗：' + result.error); return }
    setNotePhotoUrl(result.publicUrl)
    localStorage.setItem(notePhotoLsKey, result.publicUrl)
    toast.success('備註照片已上傳')
  }

  async function syncFromReceipts() {
    setSyncing(true)
    const supabase = createClient()
    const { data: receipts } = await supabase
      .from('receipts')
      .select('id, vendor_name, actual_vendor_name, total_amount, tax_amount, receipt_type, photo_url, notes, receipt_items(item_name, unit, quantity, unit_price, amount)')
      .eq('store_id', store.id)
      .eq('business_date', today)
      .order('created_at')
    if (receipts) {
      const typed = receipts as TodayReceipt[]
      setLocalReceipts(typed)
      setExpenses(receiptsToExpenses(typed, ckPrices))
      const ckReceipts = typed.filter(r => isCKReceipt(r, ckPrices))
      const ckTotal = ckReceipts.reduce((s, r) => s + r.total_amount, 0)
      set('ck_total', ckTotal)
      const ckCount = ckReceipts.length
      const nonCKCount = typed.length - ckCount
      const parts: string[] = []
      if (nonCKCount > 0) parts.push(`${nonCKCount} 筆現金支出`)
      if (ckCount > 0) parts.push(`${ckCount} 筆央廚配送`)
      toast.success(parts.length > 0 ? `已同步：${parts.join('、')}` : '今日尚無收據')
    }
    setSyncing(false)
  }

  async function handleSaveReceiptEdit() {
    if (!editingReceiptId) return
    const editAmountValid = editAmount > 0 || (editAmount < 0 && editReceiptAllowsNegativeTotal(editCategory, editItems))
    if (!editAmountValid) {
      toast.error(editAmount < 0 ? '只有「其他」類別的「其他」或「賣給分店食材」可輸入負數' : '請填寫金額')
      return
    }
    if (requiresPurchaseRepairNote(editCategory) && !editNotes.trim()) {
      toast.error('請在備註輸入購買或維修內容')
      return
    }
    const configuredEditTaxMapping = findTaxAddonMapping(mappingColumns, editVendor, editCategory, editItems)
    if (configuredEditTaxMapping && editHasTax && editTaxAmount <= 0) {
      toast.error('請輸入稅外加金額')
      return
    }
    const vendorHasSubItems = !!editVendor && mappingColumns.some(c => c.vendor_group === editVendor)
    const isNoItemMode = !!editVendor && !vendorHasSubItems
    if (!isNoItemMode && !editItems.some(i => i.item_name.trim())) { toast.error('請至少選擇一個品項'); return }
    const oldReceipt = localReceipts.find(r => r.id === editingReceiptId)
    if (!oldReceipt) return
    setEditUploading(true)
    const supabase = createClient()

    // 照片上傳
    let newPhotoUrl = oldReceipt.photo_url
    if (editPhotoFile) {
      const ext = editPhotoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = storePhotoPath(store.id, today, 'receipts', `${editingReceiptId}.${ext}`)
      const uploadResult = await uploadReceiptPhoto(path, editPhotoFile)
      if (!('error' in uploadResult)) newPhotoUrl = uploadResult.publicUrl
    }

    const taxMapping = findTaxAddonMapping(mappingColumns, editVendor, editCategory, editItems)
    const taxAmount = taxMapping && editHasTax ? Math.max(0, editTaxAmount) : 0
    const finalTotal = editAmount + taxAmount
    let validItems = fillSingleReceiptItemAmount(editItems.filter(item => !mappingColumns.some(column => column.is_tax_addon && column.name === item.item_name)), finalTotal, taxAmount)
    if (validItems.length === 0 && (isNoItemMode || mappingColumns.some(c => c.name === editVendor.trim()))) {
      validItems = [{ id: crypto.randomUUID(), item_name: editVendor.trim(), unit: '', quantity: 1, unit_price: 0, amount: editAmount }]
    }
    if (taxMapping && taxAmount > 0) {
      validItems.push({ id: crypto.randomUUID(), item_name: taxMapping.name, unit: '', quantity: 1, unit_price: 0, amount: taxAmount, vendor_group_hint: taxMapping.vendor_group })
    }
    const resolveEditItemMapping = (item: ReceiptFormItem) => item.vendor_group_hint
      ? mappingColumns.find(c => c.name === item.item_name && c.vendor_group === item.vendor_group_hint)
      : findReceiptItemMapping(item.item_name, editVendor, editCategory, mappingColumns)

    const updatedReceipts = localReceipts.map(r =>
      r.id === editingReceiptId ? {
        ...r, vendor_name: editVendor, actual_vendor_name: normalizeActualVendorName(editActualVendor) || null, total_amount: finalTotal,
        tax_amount: taxAmount,
        receipt_type: r.receipt_type,
        photo_url: newPhotoUrl,
        notes: editNotes.trim() || undefined,
        receipt_items: validItems.map(i => ({ item_name: i.item_name, unit: i.unit ?? '', quantity: i.quantity ?? 1, unit_price: i.unit_price ?? 0, amount: normalizeItemAmount(i.item_name, i.amount) })),
      } : r
    )
    setLocalReceipts(updatedReceipts)
    setExpenses(receiptsToExpenses(updatedReceipts, ckPrices))
    const ckTotal = updatedReceipts.filter(r => isCKReceipt(r, ckPrices)).reduce((s, r) => s + r.total_amount, 0)
    set('ck_total', ckTotal)

    await supabase.from('receipts').update({
      vendor_name: editVendor,
      actual_vendor_name: normalizeActualVendorName(editActualVendor) || null,
      total_amount: finalTotal,
      tax_amount: taxAmount,
      photo_url: newPhotoUrl,
      notes: editNotes.trim() || null,
    }).eq('id', editingReceiptId)
    await rememberActualVendor(supabase, editVendor, editActualVendor)
    await supabase.from('receipt_items').delete().eq('receipt_id', editingReceiptId)
    if (validItems.length > 0) {
      await supabase.from('receipt_items').insert(
        validItems.map(i => {
          const match = resolveEditItemMapping(i)
          return {
            receipt_id: editingReceiptId,
            item_name: i.item_name,
            unit: i.unit ?? '',
            quantity: i.quantity ?? 1,
            unit_price: i.unit_price ?? 0,
            amount: normalizeItemAmount(i.item_name, i.amount),
            item_category: match?.category ?? '食材',
            excel_column: match?.excel_column ?? match?.name ?? '',
          }
        })
      )
    }
    setEditUploading(false)
    setEditingReceiptId(null)
    setEditPhotoFile(null)
    toast.success('已更新')
  }

  function handleMultiUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ''
    const newForms: ReceiptForm[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      category: '',
      vendor_name: '',
      actual_vendor_name: '',
      total_amount: 0,
      has_tax: false,
      tax_amount: 0,
      notes: '',
      uploading: false,
      items: [{ id: crypto.randomUUID(), item_name: '', unit: '', quantity: 1, unit_price: 0, amount: 0 }],
    }))
    setReceiptForms(prev => [...prev, ...newForms])
    // 立即背景上傳照片，URL 存入 uploadedPhotoUrl 以便 localStorage 保存
    newForms.forEach(async form => {
      if (!form.file) return
      const ext = form.file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = storePhotoPath(store.id, today, 'receipts', `${form.id}.${ext}`)
      const result = await uploadReceiptPhoto(path, form.file)
      if (!('error' in result)) {
        setReceiptForms(prev => prev.map(f => f.id === form.id ? { ...f, uploadedPhotoUrl: result.publicUrl } : f))
      }
    })
  }

  function addNoPhotoReceipt() {
    setReceiptForms(prev => [...prev, {
      id: crypto.randomUUID(),
      category: '',
      vendor_name: '',
      actual_vendor_name: '',
      total_amount: 0,
      has_tax: false,
      tax_amount: 0,
      notes: '',
      uploading: false,
      items: [{ id: crypto.randomUUID(), item_name: '', unit: '', quantity: 1, unit_price: 0, amount: 0 }],
    }])
  }

  function updateReceiptForm(id: string, field: keyof ReceiptForm, value: any) {
    setReceiptForms(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f))
  }

  function updateReceiptFormContext(id: string, category: string, vendorName: string) {
    setReceiptForms(prev => prev.map(f => {
      if (f.id !== id) return f
      if (isDirectReceiptCategory(category)) {
        const first = f.items?.[0]
        const mapping = mappingColumns.find(column =>
          column.name === vendorName && (column.category === category || column.vendor_group === category),
        )
        const forceNegative = isAutoNegativeOtherReceiptItem(vendorName, category)
        return {
          ...f,
          category,
          vendor_name: vendorName,
          actual_vendor_name: '',
          total_amount: forceNegative ? -Math.abs(f.total_amount || 0) : f.total_amount,
          items: [{
            id: first?.id ?? crypto.randomUUID(),
            item_name: vendorName,
            unit: first?.unit ?? '',
            quantity: first?.quantity ?? 1,
            unit_price: first?.unit_price ?? 0,
            amount: forceNegative ? -Math.abs(first?.amount ?? 0) : first?.amount ?? 0,
            vendor_group_hint: mapping?.vendor_group,
          }],
        }
      }
      let items = resetReceiptItemsForContext(f.items ?? [], category, vendorName, mappingColumns)
      // Categories without configured sub-items are themselves the item. Keep
      // the amount already entered, but never carry an item from the previous
      // category into the new context.
      if (category && !vendorName && mappingColumns.length > 0) {
        const hasSubItems = mappingColumns.some(c => c.vendor_group === category)
        const isDirectItem = mappingColumns.some(c => c.name === category)
        if (!hasSubItems && !isDirectItem) {
          const first = items[0]
          items = [{
            id: first?.id ?? crypto.randomUUID(),
            item_name: category,
            unit: first?.unit ?? '',
            quantity: first?.quantity ?? 1,
            unit_price: first?.unit_price ?? 0,
            amount: first?.amount ?? 0,
          }]
        }
      }
      return { ...f, category, vendor_name: vendorName, items }
    }))
  }

  function updateEditContext(category: string, vendorName: string) {
    setEditCategory(category)
    setEditVendor(vendorName)
    if (isDirectReceiptCategory(category)) {
      setEditActualVendor('')
      setEditItems(prev => {
        const first = prev[0]
        const mapping = mappingColumns.find(column =>
          column.name === vendorName && (column.category === category || column.vendor_group === category),
        )
        const forceNegative = isAutoNegativeOtherReceiptItem(vendorName, category)
        return [{
          id: first?.id ?? crypto.randomUUID(),
          item_name: vendorName,
          unit: first?.unit ?? '',
          quantity: first?.quantity ?? 1,
          unit_price: first?.unit_price ?? 0,
          amount: forceNegative ? -Math.abs(first?.amount ?? 0) : first?.amount ?? 0,
          vendor_group_hint: mapping?.vendor_group,
        }]
      })
      if (isAutoNegativeOtherReceiptItem(vendorName, category)) {
        setEditAmount(value => -Math.abs(value || 0))
      }
      return
    }
    setEditItems(prev => {
      let items = resetReceiptItemsForContext(prev, category, vendorName, mappingColumns)
      if (category && !vendorName && mappingColumns.length > 0) {
        const hasSubItems = mappingColumns.some(c => c.vendor_group === category)
        const isDirectItem = mappingColumns.some(c => c.name === category)
        if (!hasSubItems && !isDirectItem) {
          const first = items[0]
          items = [{
            id: first?.id ?? crypto.randomUUID(),
            item_name: category,
            unit: first?.unit ?? '',
            quantity: first?.quantity ?? 1,
            unit_price: first?.unit_price ?? 0,
            amount: first?.amount ?? 0,
          }]
        }
      }
      return items
    })
  }

  function addKnownActualVendor(vendorGroup: string, rawName: string) {
    const name = normalizeActualVendorName(rawName)
    if (!name) return ''
    const group = vendorGroup.trim() || '未分類'
    setKnownActualVendors(prev => {
      if (prev.some(v => v.vendor_group === group && normalizeActualVendorName(v.name) === name)) return prev
      return [...prev, { id: `local-${group}-${name}`, vendor_group: group, name }]
    })
    return name
  }

  function requestNewActualVendor(vendorGroup: string, onSelect: (name: string) => void) {
    const name = addKnownActualVendor(vendorGroup, window.prompt('請輸入新的實際廠商名稱') ?? '')
    if (name) onSelect(name)
  }

  async function rememberActualVendor(supabase: ReturnType<typeof createClient>, vendorGroup: string, name?: string) {
    const trimmed = normalizeActualVendorName(name)
    if (!trimmed) return
    addKnownActualVendor(vendorGroup, trimmed)
    await supabase.from('store_actual_vendors').upsert({
      store_id: store.id,
      vendor_group: vendorGroup.trim() || '未分類',
      name: trimmed,
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'store_id,vendor_group,name' })
  }



  function removeReceiptForm(id: string) {
    setReceiptForms(prev => {
      const form = prev.find(f => f.id === id)
      if (form?.previewUrl) URL.revokeObjectURL(form.previewUrl)
      return prev.filter(f => f.id !== id)
    })
  }

  async function saveReceiptForm(form: ReceiptForm) {
    const amountValid = isReceiptFormAmountValid(form)
    if (!amountValid) {
      toast.error(form.total_amount < 0 ? '只有「其他」類別的「其他」或「賣給分店食材」可輸入負數' : '請填寫金額')
      return
    }
    if (requiresPurchaseRepairNote(form.category) && !form.notes.trim()) {
      toast.error('請在備註輸入購買或維修內容')
      return
    }
    const configuredTaxMapping = findTaxAddonMapping(mappingColumns, form.vendor_name, form.category, form.items ?? [])
    if (configuredTaxMapping && form.has_tax && form.tax_amount <= 0) {
      toast.error('請輸入稅外加金額')
      return
    }
    // 判別「無品項模式」：廠商下沒有子品項（廠商本身即品項，例：瓦斯 / 水費 / 電費）
    const vendorHasSubItems = !!form.vendor_name && mappingColumns.some(c => c.vendor_group === form.vendor_name)
    const isNoItemMode = !!form.vendor_name && !vendorHasSubItems
    if (!isNoItemMode) {
      const hasValidItem = (form.items ?? []).some(i => i.item_name.trim())
      if (!hasValidItem) {
        toast.error('請至少選擇一個品項')
        return
      }
    }
    if (isNoItemMode && !form.vendor_name.trim()) {
      toast.error('請選廠商')
      return
    }
    setReceiptForms(prev => prev.map(f => f.id === form.id ? { ...f, uploading: true } : f))
    const supabase = createClient()
    let photo_url = form.uploadedPhotoUrl ?? ''
    if (!photo_url && form.file) {
      const ext = form.file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = storePhotoPath(store.id, today, 'receipts', `${form.id}.${ext}`)
      const uploadResult = await uploadReceiptPhoto(path, form.file)
      if (!('error' in uploadResult)) photo_url = uploadResult.publicUrl
    }
    const taxMapping = findTaxAddonMapping(mappingColumns, form.vendor_name, form.category, form.items ?? [])
    const taxAmount = taxMapping && form.has_tax ? Math.max(0, form.tax_amount) : 0
    const finalTotal = form.total_amount + taxAmount
    const { data: saved, error } = await supabase.from('receipts').insert({
      store_id: store.id,
      business_date: today,
      vendor_name: form.vendor_name.trim(),
      actual_vendor_name: normalizeActualVendorName(form.actual_vendor_name) || null,
      receipt_type: 'receipt',
      total_amount: finalTotal,
      tax_amount: taxAmount,
      photo_url: photo_url || null,
      notes: form.notes.trim() || null,
    }).select('id').single()
    if (error) {
      toast.error('儲存失敗：' + error.message)
      setReceiptForms(prev => prev.map(f => f.id === form.id ? { ...f, uploading: false } : f))
      return
    }
    await rememberActualVendor(supabase, form.vendor_name, form.actual_vendor_name)
    let validItems = fillSingleReceiptItemAmount((form.items ?? []).filter(item => !mappingColumns.some(column => column.is_tax_addon && column.name === item.item_name)), finalTotal, taxAmount)
    if (validItems.length === 0 && (isNoItemMode || mappingColumns.some(c => c.name === form.vendor_name.trim()))) {
      // 廠商本身就是品項 → 自動用 vendor_name 建 1 個 item
      validItems = [{ id: crypto.randomUUID(), item_name: form.vendor_name.trim(), unit: '', quantity: 1, unit_price: 0, amount: form.total_amount }]
    }
    if (taxMapping && taxAmount > 0) {
      validItems.push({ id: crypto.randomUUID(), item_name: taxMapping.name, unit: '', quantity: 1, unit_price: 0, amount: taxAmount, vendor_group_hint: taxMapping.vendor_group })
    }
    const resolveFormItemMapping = (item: ReceiptFormItem) => item.vendor_group_hint
      ? mappingColumns.find(c => c.name === item.item_name && c.vendor_group === item.vendor_group_hint)
      : findReceiptItemMapping(item.item_name, form.vendor_name, form.category, mappingColumns)
    if (validItems.length > 0) {
      await supabase.from('receipt_items').insert(
        validItems.map(i => {
          const match = resolveFormItemMapping(i)
          return {
            receipt_id: saved.id,
            item_name: i.item_name.trim(),
            unit: i.unit,
            quantity: i.quantity,
            unit_price: i.unit_price ?? 0,
            amount: normalizeItemAmount(i.item_name, i.amount),
            item_category: match?.category ?? '食材',
            excel_column: match?.excel_column ?? match?.name ?? '',
          }
        })
      )
    }

    const newR: TodayReceipt = {
      id: saved.id,
      vendor_name: form.vendor_name.trim(),
      actual_vendor_name: normalizeActualVendorName(form.actual_vendor_name) || null,
      total_amount: finalTotal,
      tax_amount: taxAmount,
      receipt_type: 'receipt',
      photo_url,
      notes: form.notes.trim() || undefined,
      receipt_items: validItems,
    }
    const updated = [...localReceipts, newR]
    setLocalReceipts(updated)
    const ckTotal = updated.filter(r => isCKReceipt(r, ckPrices)).reduce((s, r) => s + r.total_amount, 0)
    set('ck_total', ckTotal)
    setExpenses(receiptsToExpenses(updated, ckPrices))
    if (form.previewUrl) URL.revokeObjectURL(form.previewUrl)
    setReceiptForms(prev => prev.filter(f => f.id !== form.id))
    toast.success(`已儲存：${form.vendor_name} $${fmt(form.total_amount)}`)
  }

  async function handleDeleteReceipt(receiptId: string) {
    const supabase = createClient()
    await supabase.from('receipts').delete().eq('id', receiptId)
    const updated = localReceipts.filter(r => r.id !== receiptId)
    setLocalReceipts(updated)
    setExpenses(receiptsToExpenses(updated, ckPrices))
    const ckTotal = updated.filter(r => isCKReceipt(r, ckPrices)).reduce((s, r) => s + r.total_amount, 0)
    set('ck_total', ckTotal)
    toast.success('已刪除')
  }

  function buildVerifyItems() {
    const items: VerifyItem[] = []
    for (const r of localReceipts.filter(r => r.photo_url)) {
      items.push({ key: r.id, type: 'receipt', label: r.vendor_name || '收據', photoUrl: r.photo_url!, inputAmount: r.total_amount, confirmed: false, notes: r.notes, items: r.receipt_items })
    }
    const ckPhotoFinal = ckPhotoUrl || ckPhotoPreview
    if (ckPhotoFinal) {
      const ckItems = ckPrices
        .filter(p => (ckQuantitiesRef.current[p.id] ?? 0) > 0)
        .map(p => {
          const quantity = ckQuantitiesRef.current[p.id] ?? 0
          const unitPrice = ckPriceOverridesRef.current[p.id] ?? p.unit_price
          return {
            item_name: p.item_name,
            unit: p.unit || '份',
            quantity,
            unit_price: unitPrice,
            amount: quantity * unitPrice,
          }
        })
      // 核對畫面必須直接以當下配送品項加總，不能讀可能尚未被 useEffect
      // 同步的 data.ck_total，否則品項正確但右上總額會短暫顯示 $0。
      const ckTotalLive = ckItems.reduce((sum, item) => sum + item.amount, 0)
      items.push({ key: 'ck_delivery', type: 'ck', label: '央廚配送', photoUrl: ckPhotoFinal, inputAmount: ckTotalLive, confirmed: false, items: ckItems })
    }
    const channelLabelMap: Record<string, { label: string; amount: number }> = {}
    if (store.mode !== 'handwrite') channelLabelMap['pos'] = { label: store.ichef_uber_linked ? 'iChef 結帳總金額' : 'iChef 現場 POS', amount: dataRef.current.pos_cash }
    ;(store.uber_accounts ?? []).forEach(acc => { channelLabelMap[`uber_${acc}`] = { label: `Uber Eats${(store.uber_accounts ?? []).length > 1 ? ' — ' + acc : ''}`, amount: dataRef.current.uber_amounts[acc] ?? 0 } })
    if (store.panda_enabled) channelLabelMap['panda'] = { label: '熊貓 foodpanda', amount: dataRef.current.panda_amount }
    if (store.twpay_enabled) channelLabelMap['twpay'] = { label: '台灣 Pay', amount: dataRef.current.twpay_amount }
    if (store.online_enabled) channelLabelMap['online'] = { label: '線上點餐', amount: dataRef.current.online_amount }
    if (store.online_cash_enabled) channelLabelMap['online_cash'] = { label: '線上點餐（現金）', amount: dataRef.current.online_cash_amount }
    for (const [key, photo] of Object.entries(channelPhotos)) {
      if (photo.publicUrl && channelLabelMap[key]) {
        const info = channelLabelMap[key]
        items.push({ key, type: 'channel', label: info.label, photoUrl: photo.publicUrl, inputAmount: info.amount, confirmed: false })
      }
    }
    const envelopeFinal = envelopePhotoUrl || envelopePhotoPreview
    if (envelopeFinal) {
      items.push({ key: 'envelope', type: 'envelope', label: '信封袋', photoUrl: envelopeFinal, inputAmount: s.remitToHQ, confirmed: false })
    }
    voidInvoicePhotos.forEach((url, i) => {
      items.push({ key: `void_invoice_${i}`, type: 'void_invoice', label: `作廢發票 ${i + 1}`, photoUrl: url, inputAmount: 0, confirmed: false })
    })
    const noteFinal = notePhotoUrl || notePhotoPreview
    if (noteFinal) {
      items.push({ key: 'note', type: 'note', label: '備註照片', photoUrl: noteFinal, inputAmount: 0, confirmed: false })
    }
    let confirmedSignatures = new Set<string>()
    try {
      const disputeToken = existingClosing?.status === 'disputed'
        ? `${existingClosing?.id ?? 'closing'}:${existingClosing?.disputed_at ?? existingClosing?.dispute_note ?? 'disputed'}`
        : ''

      if (disputeToken) {
        const lastResetToken = localStorage.getItem(verifyResetLsKey)
        if (lastResetToken !== disputeToken) {
          localStorage.removeItem(verifyDoneLsKey)
          localStorage.setItem(verifyResetLsKey, disputeToken)
        }
      } else {
        localStorage.removeItem(verifyResetLsKey)
      }

      const saved = JSON.parse(localStorage.getItem(verifyDoneLsKey) ?? '[]')
      if (Array.isArray(saved)) {
        confirmedSignatures = new Set(saved.filter((v): v is string => typeof v === 'string'))
      }
    } catch {}

    const hydratedItems = items.map(item => ({
      ...item,
      confirmed: confirmedSignatures.has(getVerifySignature(item)),
    }))

    setVerifyItems(hydratedItems)
    setReviewIndex(null)
  }

  function openChannelUpload(key: string, amount: number) {
    currentUploadChannelRef.current = { key, amount }
    channelFileRef.current?.click()
  }

  async function handleChannelFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !currentUploadChannelRef.current) return
    const { key } = currentUploadChannelRef.current
    e.target.value = ''

    const previewUrl = URL.createObjectURL(file)
    setChannelPhotos(prev => ({ ...prev, [key]: { previewUrl, status: 'uploading' } }))

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const safeKey = [...key].map(c => /[\w-]/.test(c) ? c : c.codePointAt(0)!.toString()).join('')
    const path = storePhotoPath(store.id, today, 'closing/revenue', `rev-${safeKey}.${ext}`)
    const uploadResult = await uploadReceiptPhoto(path, file)
    if ('error' in uploadResult) {
      toast.error(`照片上傳失敗：${uploadResult.error}`)
      setChannelPhotos(prev => ({ ...prev, [key]: { previewUrl, status: 'idle' } }))
      return
    }
    const { publicUrl } = uploadResult
    setChannelPhotos(prev => ({ ...prev, [key]: { previewUrl, publicUrl, status: 'uploaded' } }))
    try {
      const stored = JSON.parse(localStorage.getItem(channelPhotoLsKey) ?? '{}')
      stored[key] = publicUrl
      localStorage.setItem(channelPhotoLsKey, JSON.stringify(stored))
    } catch {}
  }

  function addExpense() {
    setExpenses(prev => [...prev, { id: crypto.randomUUID(), description: '', amount: 0 }])
  }
  function updateExpense(id: string, field: 'description' | 'amount', value: string | number) {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e))
  }
  function removeExpense(id: string) {
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  function addHandwriteOrder() {
    const num = newOrderNum.trim()
    if (!num) { toast.error('請填寫單號'); return }
    if (newOrderAmt <= 0) { toast.error('請填寫金額'); return }
    if (handwriteOrders.some(o => o.order_number === num)) { toast.error('該單號已存在'); return }
    setHandwriteOrders(prev => [...prev, { id: crypto.randomUUID(), order_number: num, amount: newOrderAmt, voided: false, void_reason: '' }])
    scheduleBackgroundSave()
    setNewOrderNum('')
    setNewOrderAmt(0)
    setTimeout(() => newOrderNumRef.current?.focus(), 50)
  }

  function generateRange() {
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) { toast.error('請輸入有效的起始和結束單號'); return }
    if (rangeEnd - rangeStart + 1 > MAX_HANDWRITE_BATCH) { toast.error(`單次最多建立 ${MAX_HANDWRITE_BATCH} 筆`); return }
    const existingNums = new Set(handwriteOrders.map(o => o.order_number))
    const newOrders: HandwriteOrder[] = []
    for (let n = rangeStart; n <= rangeEnd; n++) {
      if (!existingNums.has(String(n)))
        newOrders.push({ id: crypto.randomUUID(), order_number: String(n), amount: 0, voided: false, void_reason: '' })
    }
    if (newOrders.length === 0) { toast.info('該範圍內的單號已全部存在'); return }
    setHandwriteOrders(prev => [...prev, ...newOrders])
    scheduleBackgroundSave()
    toast.success(`已建立 ${newOrders.length} 筆單號`)
  }

  function replaceHandwriteOrderRange() {
    if (!replaceRangeStart || !replaceRangeEnd || !replaceRangeNewStart || !replaceRangeNewEnd) {
      toast.error('請完整輸入原單號與新單號範圍')
      return
    }
    if (replaceRangeStart > replaceRangeEnd || replaceRangeNewStart > replaceRangeNewEnd) {
      toast.error('請輸入有效的單號範圍')
      return
    }
    const oldCount = replaceRangeEnd - replaceRangeStart + 1
    const newCount = replaceRangeNewEnd - replaceRangeNewStart + 1
    if (oldCount !== newCount) {
      toast.error('原範圍與新範圍的筆數必須相同')
      return
    }
    if (oldCount > MAX_HANDWRITE_BATCH) {
      toast.error(`單次最多更換 ${MAX_HANDWRITE_BATCH} 筆`)
      return
    }

    const oldNumbers = Array.from({ length: oldCount }, (_, index) => String(replaceRangeStart + index))
    const newNumbers = Array.from({ length: newCount }, (_, index) => String(replaceRangeNewStart + index))
    const oldSet = new Set(oldNumbers)
    const orderByNumber = new Map(handwriteOrders.map(order => [order.order_number, order] as const))
    const selected = oldNumbers.map(number => orderByNumber.get(number))
    if (selected.some(order => !order)) {
      toast.error('找不到完整的原單號範圍，請確認已建立的單號')
      return
    }
    if (newNumbers.some(number => orderByNumber.has(number) && !oldSet.has(number))) {
      toast.error('新的單號範圍會與既有單號重複，請換一個範圍')
      return
    }

    const replacementMap = new Map(oldNumbers.map((number, index) => [number, newNumbers[index]] as const))
    setHandwriteOrders(prev => prev.map(order => replacementMap.has(order.order_number)
      ? { ...order, order_number: replacementMap.get(order.order_number)! }
      : order))
    scheduleBackgroundSave()
    setReplaceRangeStart(0)
    setReplaceRangeEnd(0)
    setReplaceRangeNewStart(0)
    setReplaceRangeNewEnd(0)
    toast.success(`已將 ${replaceRangeStart}–${replaceRangeEnd} 更換為 ${replaceRangeNewStart}–${replaceRangeNewEnd}`)
  }

  function updateHandwriteOrderAmount(id: string, amount: number) {
    setHandwriteOrders(prev => prev.map(o => o.id === id ? { ...o, amount } : o))
    scheduleBackgroundSave()
  }
  function toggleVoidOrder(id: string) {
    setHandwriteOrders(prev => prev.map(o => o.id === id ? { ...o, voided: !o.voided } : o))
    scheduleBackgroundSave()
  }
  function updateVoidReason(id: string, reason: string) {
    setHandwriteOrders(prev => prev.map(o => o.id === id ? { ...o, void_reason: reason } : o))
    scheduleBackgroundSave()
  }
  function removeHandwriteOrder(id: string) {
    setHandwriteOrders(prev => prev.filter(o => o.id !== id))
    scheduleBackgroundSave()
  }
  function clearHandwriteOrders() {
    if (handwriteOrders.length === 0) return
    if (!window.confirm(`確定刪除今天全部 ${handwriteOrders.length} 筆手寫單號嗎？此操作會保留其他結帳資料。`)) return
    setHandwriteOrders([])
    scheduleBackgroundSave()
    toast.success('今天的手寫單號已全部刪除')
  }

  async function handleSave(silent = false) {
    if (status === 'submitted' || status === 'verified') return null
    if (savingRef.current) return closingId  // 已有 save 進行中，直接 return（防 race）
    savingRef.current = true
    setSaving(true)
    const supabase = createClient()
    const d = dataRef.current
    try {
      let cid = closingId
      // 直接從 ref 計算最新 CK 金額，避免 useEffect 延遲造成 data.ck_total stale
      const ckTotalLive = ckPrices.reduce(
        (sum, p) => sum + (ckQuantitiesRef.current[p.id] || 0) * (ckPriceOverridesRef.current[p.id] ?? p.unit_price), 0
      )
      const payload = {
        store_id: store.id, manager_id: userId, business_date: today, status: isDisputed ? 'disputed' : 'draft',
        total_revenue: s.totalRevenue, total_cost: ckTotalLive > 0 ? ckTotalLive : s.deliveryFee, total_expenses: totalExpenses,
        expected_remit: s.netToHQ, actual_remit: s.actualRemit,
        should_include_delivery: s.shouldEnvelope, variance: s.variance, note: d.note,
        remittance_adjustments: adjustments,
        reserve_items: reserves,
        ck_delivery_photo_url: ckPhotoUrl ?? null,
        channel_photo_urls: Object.fromEntries(
          Object.entries(channelPhotos)
            .filter(([, v]) => v.publicUrl)
            .map(([k, v]) => [k, v.publicUrl])
        ),
        envelope_photo_url: envelopePhotoUrl ?? null,
        void_invoice_photo_urls: voidInvoicePhotos,
        note_photo_url: notePhotoUrl ?? null,
        extra_photo_urls: extraPhotos,
      }
      if (!cid) {
        // 防呆：當日可能已有 closing 但 state 沒同步（page race / refresh / multi-tab），
        // 先查 DB 看 (store_id, business_date) 是否已存在，避免硬 INSERT 撞 unique constraint
        const { data: existing } = await supabase
          .from('daily_closings').select('id, status')
          .eq('store_id', store.id).eq('business_date', today).maybeSingle()
        if (existing) {
          if (['submitted', 'verified'].includes(existing.status)) {
            throw new Error('該日帳目已送出，請重新整理頁面')
          }
          cid = existing.id
          setClosingId(cid)
        }
      }
      if (!cid) {
        const { data: nc, error } = await supabase.from('daily_closings').insert(payload).select('id').single()
        if (error) throw error
        cid = nc.id
        setClosingId(cid)
      } else {
        const { error } = await supabase.from('daily_closings').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', cid)
        if (error) throw error
      }
      // Backup full form state before destructive delete-then-insert operations
      try {
        localStorage.setItem(saveBkKey, JSON.stringify({
          storeId: store.id, date: today, status, submitted: false,
          data: d, expenses, handwriteOrders, adjustments, reserves, largeCashExpenses,
          ckQuantities: ckQuantitiesRef.current, ckPriceOverrides: ckPriceOverridesRef.current,
          pettyCounts, pettyLumps, ts: Date.now(),
        }))
      } catch {}
      // revenue_items：只有任一通路 > 0 才 wipe-insert，避免 autoSave 在使用者尚未進入該步驟時清空 DB 既有資料
      const revItems = [
        ...(store.mode !== 'handwrite' ? [{ closing_id: cid, channel: 'pos', gross_amount: d.pos_cash, is_cash: true }] : []),
        ...(store.uber_accounts ?? []).map(acc => ({ closing_id: cid, channel: 'uber', account_name: acc, gross_amount: d.uber_amounts[acc] ?? 0, is_cash: false })),
        ...(store.panda_enabled ? [{ closing_id: cid, channel: 'panda', gross_amount: d.panda_amount, is_cash: false }] : []),
        ...(store.twpay_enabled ? [{ closing_id: cid, channel: 'twpay', gross_amount: d.twpay_amount, is_cash: false }] : []),
        ...(store.online_enabled ? [{ closing_id: cid, channel: 'online', gross_amount: d.online_amount, is_cash: false }] : []),
        ...(store.online_cash_enabled ? [{ closing_id: cid, channel: 'online_cash', gross_amount: d.online_cash_amount, is_cash: false }] : []),
        ...(store.mode !== 'ichef' ? [{ closing_id: cid, channel: 'handwrite', gross_amount: handwriteTotal, is_cash: true }] : []),
      ]
      const revTotal = revItems.reduce((s, r: any) => s + (r.gross_amount ?? 0), 0)
      if (revTotal > 0) {
        await supabase.from('revenue_items').delete().eq('closing_id', cid)
        if (revItems.length) await supabase.from('revenue_items').insert(revItems)
      }
      if (!cid) throw new Error('無法取得帳目 ID')
      const cashPayload = {
        bills_1000: d.bills_1000, bills_500: d.bills_500, bills_100: d.bills_100,
        coins_50: d.coins_50, coins_10: d.coins_10, coins_5: d.coins_5, coins_1: d.coins_1,
        lump_1000: d.lump_1000, lump_500: d.lump_500, lump_100: d.lump_100,
        lump_50: d.lump_50, lump_10: d.lump_10, lump_5: d.lump_5, lump_1: d.lump_1,
        large_expenses: largeCashExpenses
          .map(item => ({ ...item, description: item.description.trim(), amount: Math.abs(item.amount || 0) }))
          .filter(item => item.amount > 0 || item.description),
      }
      // 只有 cash 加總 > 0 才寫入，避免 autoSave 把店長尚未輸入的現金（全 0）覆蓋既有資料
      // （HQ 退回後店長重新打開，舊現金清點仍保留，等使用者進 cash step 填寫才更新）
      const cashTotal = CASH_KEYS.reduce((s, k) => s + (cashPayload[k] as number), 0)
      if (cashTotal > 0 || cashPayload.large_expenses.length > 0) {
        const cashResult = await saveCashCounts(cid, cashPayload)
        if (cashResult.error) throw new Error('現金清點儲存失敗：' + cashResult.error)
      }
      // order_items (央廚)：只有 ckItems.length > 0 才 wipe-insert（保留店長尚未重新輸入時的既有資料）
      const ckItems = ckPrices
        .filter(p => (ckQuantitiesRef.current[p.id] || 0) > 0)
        .map(p => {
          const effPrice = ckPriceOverridesRef.current[p.id] ?? p.unit_price
          const qty = ckQuantitiesRef.current[p.id] || 0
          return {
            closing_id: cid,
            vendor: '央廚',
            item_name: p.item_name,
            unit_price: effPrice,
            quantity: qty,
            total_amount: Math.round(effPrice * qty),
          }
        })
      if (ckItems.length > 0) {
        await supabase.from('order_items').delete().eq('closing_id', cid)
        await supabase.from('order_items').insert(ckItems)
      }
      // expense_items：只有 expItems.length > 0 才 wipe-insert
      const expItems = expenses
        .filter(e => e.description.trim() || e.amount !== 0)
        .map(e => ({ closing_id: cid, description: e.description.trim() || '支出', amount: e.amount }))
      if (expItems.length > 0) {
        await supabase.from('expense_items').delete().eq('closing_id', cid)
        await supabase.from('expense_items').insert(expItems)
      }
      // handwrite_orders：每次都先同步刪除，確保「全部刪除」後不會留下舊單號
      const currentHandwriteOrders = handwriteOrdersRef.current
      const hwItems = currentHandwriteOrders
        .filter(o => o.order_number.trim())
        .map(o => ({
          closing_id: cid, store_id: store.id,
          order_number: o.order_number.trim(),
          amount: o.voided ? 0 : o.amount,
          voided: o.voided, void_reason: o.void_reason || null,
        }))
      await supabase.from('handwrite_orders').delete().eq('closing_id', cid)
      if (hwItems.length > 0) {
        await supabase.from('handwrite_orders').insert(hwItems)
      }
      // 同步央廚叫貨金額到央廚每日記錄
      const ckTotal = ckItems.reduce((s, i) => s + i.total_amount, 0)
      if (ckTotal > 0) {
        syncStoreCKOrder(store.id, today, ckTotal).catch(() => {})
      }
      try {
        if (hwItems.length > 0) localStorage.setItem(handwriteOrdersLsKey, JSON.stringify(currentHandwriteOrders))
        else localStorage.removeItem(handwriteOrdersLsKey)
      } catch {}
      try { localStorage.removeItem(saveBkKey) } catch {}
      if (!silent) toast.success('草稿已儲存')
      return cid
    } catch (err: any) {
      toast.error('儲存失敗：' + err.message + '（請勿重新整理頁面，可重試儲存）')
      return null
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function scheduleBackgroundSave() {
    if (isLocked || submitDone || status === 'submitted' || status === 'verified') return
    if (backgroundSaveTimerRef.current) clearTimeout(backgroundSaveTimerRef.current)
    backgroundSaveTimerRef.current = setTimeout(() => {
      backgroundSaveTimerRef.current = null
      void handleSave(true)
    }, 250)
  }

  async function handleSubmit() {
    // 先擋住雙擊：submitting 標記必須在所有 async 之前
    if (submitting) return
    if (status === 'submitted' || status === 'verified') {
      toast.error('此帳目已送出，請勿重複送出')
      return
    }
    if (!pettyIsComplete) {
      toast.error('請先完成零用金核對，才能送出帳目')
      if (pettyStepIdx >= 0) goToStep(pettyStepIdx)
      return
    }
    if (hasCkDeliveryQuantity && !hasCkDeliveryPhoto) {
      toast.error('已有央廚配送數量，請先上傳當日配送單照片')
      goToStep(STEPS.findIndex(s => s.id === 'ck_delivery'))
      return
    }
    setSubmitting(true)
    try {
      const cid = await handleSave(true)
      if (!cid) return
      // 用 server action 做原子性 status 更新（內含權限檢查與 WHERE status in (draft,disputed)）
      const r = await submitClosing(cid)
      if (r.error) {
        toast.error('送出失敗：' + r.error)
        return
      }
      // 先把 UI 狀態一次性批次更新，避免中間 render 出現 isLocked 閃跳
      setStatus('submitted')
      setSubmitDone(true)
      try { localStorage.setItem(submitDoneSsKey, '1') } catch {}
      localStorage.removeItem(saveBkKey)
      localStorage.removeItem(ckPhotoLsKey)
      localStorage.removeItem(channelPhotoLsKey)
      localStorage.removeItem(adjLsKey)
      localStorage.removeItem(reserveLsKey)
      localStorage.removeItem(envelopePhotoLsKey)
      localStorage.removeItem(voidInvoiceLsKey)
      localStorage.removeItem(notePhotoLsKey)
      localStorage.removeItem(receiptFormsDraftKey)
      localStorage.removeItem(handwriteOrdersLsKey)
      localStorage.removeItem(cashLsKey)
      localStorage.removeItem(stepLsKey)
      toast.success('今日結帳已送出！')
      goToStep(currentStep + 1) // advance to 摘要
      // 誤差警報：fire-and-forget
      if (Math.abs(s.variance) > 200) {
        const supabase = createClient()
        void supabase.from('audit_logs').insert({
          event_type: 'variance_alert', severity: 'error',
          store_id: store.id, user_id: userId, closing_id: cid,
          description: `${store.name} ${today} 誤差 ${Math.round(s.variance)} 元`,
          metadata: { variance: s.variance, business_date: today },
        })
      }
    } catch (err) {
      toast.error('送出失敗：' + ((err as Error)?.message ?? '未知錯誤'))
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Wizard ───────────────────────────────────────────────────────────────
  const STEPS = [
    { id: 'receipts',    label: '上傳單據' },
    { id: 'ck_delivery', label: '央廚配送' },
    ...(store.mode !== 'ichef' ? [{ id: 'handwrite', label: '手寫菜單' }] : []),
    { id: 'revenue',   label: '營業額'  },
    { id: 'cash',      label: '現金清點' },
    { id: 'summary',   label: '確認結帳' },
    { id: 'ai_verify', label: '照片核對' },
    { id: 'petty',     label: '零用金核對' },
    { id: 'submit',    label: '送出'    },
    { id: 'result',    label: '摘要'    },
  ]
  const totalSteps = STEPS.length
  const submitStepIdx = STEPS.findIndex(s => s.id === 'submit')
  const pettyStepIdx = STEPS.findIndex(s => s.id === 'petty')
  const ckDeliveryStepIdx = STEPS.findIndex(s => s.id === 'ck_delivery')
  const isPostSubmit = submitDone || status === 'submitted' || status === 'verified'
  const pettyIsComplete = pettyFinished || !!(existingClosing as { petty_counts?: { verified_at?: string } } | null)?.petty_counts?.verified_at
  const step = isLocked && !submitDone
    ? STEPS.findIndex(s => s.id === 'summary')
    : Math.min(currentStep, totalSteps - 1)
  const stepId = STEPS[step]?.id
  const stepNum = step + 1
  const previousStepIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!stepMounted) return
    const button = stepButtonRefs.current[step]
    if (!button) return
    requestAnimationFrame(() => {
      button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    })
  }, [step, stepMounted])

  useEffect(() => {
    if (!stepMounted) return
    if (previousStepIdRef.current === stepId) return
    previousStepIdRef.current = stepId
    if (stepId !== 'ck_delivery') return
    requestAnimationFrame(() => {
      ckPhotoSectionRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' })
    })
  }, [stepId, stepMounted])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (stepId === 'ai_verify') buildVerifyItems()
  }, [stepId])

  function goNext() {
    if (stepId === 'receipts' && !isLocked) {
      if (receiptForms.length > 0) {
        toast.error(`請先儲存 ${receiptForms.length} 筆未儲存的收據`)
        return
      }
    }
    if (stepId === 'ck_delivery' && !isLocked && hasCkDeliveryQuantity && !hasCkDeliveryPhoto) {
      toast.error('已有央廚配送數量，請先上傳當日配送單照片')
      ckPhotoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (stepId === 'revenue' && !isLocked) {
      const missing: string[] = []
      if (store.mode !== 'handwrite' && data.pos_cash > 0 && channelPhotos['pos']?.status !== 'uploaded')
        missing.push(store.ichef_uber_linked ? 'iChef 結帳總金額' : 'iChef 現場 POS');
      (store.uber_accounts ?? []).forEach(acc => {
        if ((data.uber_amounts[acc] ?? 0) > 0 && channelPhotos[`uber_${acc}`]?.status !== 'uploaded')
          missing.push(`Uber Eats${(store.uber_accounts ?? []).length > 1 ? ` — ${acc}` : ''}`)
      })
      if (store.panda_enabled && data.panda_amount > 0 && channelPhotos['panda']?.status !== 'uploaded')
        missing.push('熊貓 foodpanda')
      if (store.twpay_enabled && data.twpay_amount > 0 && channelPhotos['twpay']?.status !== 'uploaded')
        missing.push('台灣 Pay')
      if (missing.length > 0) {
        toast.error(`請上傳以下通路的照片：${missing.join('、')}`)
        return
      }
    }
    if (stepId === 'summary' && !isLocked) {
      if (requiresEnvelopePhoto && !envelopePhotoUrl && !envelopePhotoPreview) {
        toast.error('信封袋有金額，請先上傳信封袋照片')
        return
      }
    }
    if (stepId === 'ai_verify' && !isLocked) {
      const unconfirmed = verifyItems.filter(v => !v.confirmed)
      if (unconfirmed.length > 0) {
        toast.error(`還有 ${unconfirmed.length} 張照片尚未核對，請確認後繼續`)
        return
      }
    }
    if (stepId === 'petty' && !isLocked && !pettyIsComplete) {
      toast.error('請先按下「確認，繼續送出」完成零用金核對')
      return
    }
    if (step >= submitStepIdx) { goToStep(step + 1); return }
    if (step < totalSteps - 1) {
      goToStep(step + 1)
      scheduleBackgroundSave()
    }
  }
  function canNavigateToStep(n: number) {
    if (!isLocked && n > ckDeliveryStepIdx && hasCkDeliveryQuantity && !hasCkDeliveryPhoto) {
      toast.error('已有央廚配送數量，請先上傳當日配送單照片')
      goToStep(ckDeliveryStepIdx)
      return false
    }
    if (!isLocked && n >= submitStepIdx && pettyStepIdx >= 0 && !pettyIsComplete) {
      toast.error('請先完成零用金核對，才能送出帳目')
      goToStep(pettyStepIdx)
      return false
    }
    return true
  }
  function goToStep(n: number) {
    startTransition(() => setCurrentStep(n))
    try { localStorage.setItem(stepLsKey, String(n)) } catch {}
  }
  function goPrev() { if (step > 0) goToStep(step - 1) }

  const pettyVerifyCash = DENOMINATIONS.reduce((sum, { countKey, lumpKey, unit }) =>
    sum + (pettyCounts[countKey] || 0) * unit + (pettyLumps[lumpKey] || 0), 0)
  const pettyDiff = pettyVerifyCash - store.petty_cash
  const pettyOk = pettyDiff === 0
  const hasRequiredPettyInput =
    Object.values(pettyCounts).some(v => Math.abs(Number(v) || 0) > 0) ||
    Object.values(pettyLumps).some(v => Math.abs(Number(v) || 0) > 0) ||
    largeCashExpenses.some(item => Math.abs(Number(item.amount) || 0) > 0) ||
    customerTransferAmount > 0

  // ── Main wizard return ────────────────────────────────────────────────────
  if (!stepMounted || finishingToday) {
    return (
      <div className="min-h-full flex items-center justify-center px-6" style={{ background: '#fafafa' }}>
        <div className="rounded-3xl px-8 py-10 text-center bg-white" style={{ boxShadow: '0 18px 50px rgba(15,23,42,0.08)' }}>
          <Loader2 className="h-9 w-9 mx-auto mb-4 animate-spin" style={{ color: '#F59E0B' }} />
          <p className="text-base font-bold" style={{ color: '#18181b' }}>
            {finishingToday ? '正在完成今日結帳' : '正在準備今日結帳'}
          </p>
          <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>
            {finishingToday ? '完成後會直接前往結帳結果' : '請稍候'}
          </p>
          {finishError && (
            <div className="mt-4 rounded-2xl px-4 py-3 text-left" style={{ background: '#fff1f2', border: '1px solid #fda4af' }}>
              <p className="text-sm font-bold" style={{ color: '#be123c' }}>零用金儲存失敗</p>
              <p className="text-xs mt-1" style={{ color: '#881337' }}>{finishError}</p>
              <button
                type="button"
                onClick={() => { setFinishingToday(false); setFinishError('') }}
                className="mt-3 px-4 py-2 rounded-xl text-sm font-bold"
                style={{ background: 'white', color: '#be123c', border: '1px solid #fda4af' }}>
                返回重試
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* 照片 Lightbox */}
      {photoLightbox && (
        <div className="fixed inset-0 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.92)', zIndex: 9999 }} onClick={() => setPhotoLightbox(null)}>
          <button className="absolute top-4 right-4 p-2 rounded-full" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer' }}
            onClick={() => setPhotoLightbox(null)}>
            <X className="h-6 w-6 text-white" />
          </button>
          <SharedSafePhotoImage src={photoLightbox} alt="receipt" loading="eager"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '12px' }}
            onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* 隱藏 file inputs — 永遠掛載，用 sr-only 隱藏以確保所有瀏覽器可程式觸發 */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple
        style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1px', height: '1px', opacity: 0 }}
        onChange={handleMultiUpload} />
      <input ref={ckPhotoInputRef} type="file" accept="image/*"
        style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1px', height: '1px', opacity: 0 }}
        onChange={handleCkPhotoUpload} />
      <input ref={envelopePhotoInputRef} type="file" accept="image/*"
        style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1px', height: '1px', opacity: 0 }}
        onChange={handleEnvelopePhotoUpload} />
      <input ref={voidInvoiceInputRef} type="file" accept="image/*"
        style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1px', height: '1px', opacity: 0 }}
        onChange={handleVoidInvoicePhotoUpload} />
      <input ref={extraPhotoInputRef} type="file" accept="image/*"
        style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1px', height: '1px', opacity: 0 }}
        onChange={handleExtraPhotoUpload} />
      <input ref={notePhotoInputRef} type="file" accept="image/*"
        style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1px', height: '1px', opacity: 0 }}
        onChange={handleNotePhotoUpload} />
      <input ref={channelFileRef} type="file" accept="image/*"
        style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1px', height: '1px', opacity: 0 }}
        onChange={handleChannelFileChange} />
      <input ref={editPhotoInputRef} type="file" accept="image/*"
        style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1px', height: '1px', opacity: 0 }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (!f) return
          setEditPhotoFile(f)
          setEditPhotoPreview(URL.createObjectURL(f))
        }} />

      {/* Sticky header + stepper */}
      <div className="bg-white sticky top-0 z-50" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        {/* 補做帳目提示橫幅 */}
        {isBackfill && (
          <div className="px-5 py-3 text-sm font-bold flex items-center justify-between gap-3"
            style={{ background: '#FFF7ED', color: '#9A3412', borderBottom: '2px solid #FDBA74' }}>
            <span className="leading-snug">
              注意：目前正在做 <b className="text-base">{today}</b> 的帳目，不是今天 <b>{realToday ?? '今日'}</b>
            </span>
            {realToday && (
              <a href={`/manager/closing?date=${encodeURIComponent(realToday)}`} className="font-bold shrink-0 px-3 py-1.5 rounded-full"
                style={{ color: '#fff', background: '#EA580C' }}>
                切回今日
              </a>
            )}
          </div>
        )}
        {!isBackfill && latestBackfillDraftDate && (
          <div className="px-5 py-2 text-xs font-medium flex items-center justify-between gap-2"
            style={{ background: '#FFFBEB', color: '#92400E', borderBottom: '1px solid #FDE68A' }}>
            <span>有未完成的補做草稿：{latestBackfillDraftDate}。今日結帳不會自動切過去。</span>
            <a href={`/manager/closing?date=${encodeURIComponent(latestBackfillDraftDate)}`} className="font-semibold underline shrink-0" style={{ color: '#78350F' }}>
              前往補做
            </a>
          </div>
        )}
        <div className="px-5 py-2.5 flex items-center justify-between gap-3"
          style={{
            background: isEarlyMorningBusinessDate ? '#FFFBEB' : '#F8FAFC',
            color: isEarlyMorningBusinessDate ? '#92400E' : '#334155',
            borderBottom: '1px solid #f4f4f5',
          }}>
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: isEarlyMorningBusinessDate ? '#F59E0B' : '#64748B' }} />
            <div className="min-w-0">
              <p className="text-sm font-black leading-snug">
                目前正在做：<span className="tabular-nums">{today}</span> 帳目
              </p>
              {isEarlyMorningBusinessDate && (
                <p className="text-xs mt-0.5 leading-snug" style={{ color: '#b45309' }}>
                  現在已是 {calendarToday ?? '隔日'} 凌晨，05:00 前系統仍視為前一日帳目。
                </p>
              )}
            </div>
          </div>
          <span className="text-[11px] font-bold px-2 py-1 rounded-full shrink-0"
            style={{
              background: isEarlyMorningBusinessDate ? '#FED7AA' : '#E2E8F0',
              color: isEarlyMorningBusinessDate ? '#9A3412' : '#475569',
            }}>
            {isEarlyMorningBusinessDate ? '凌晨跨日' : '日期確認'}
          </span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
          <div className="min-w-0">
            <p className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>每日結帳</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold truncate" style={{ color: '#18181b' }}>{store.name} · {today}</p>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{ background: isBackfill ? '#FED7AA' : '#DCFCE7', color: isBackfill ? '#9A3412' : '#047857' }}>
                {isBackfill ? '補做帳目' : '今日帳目'}
              </span>
              <input type="date" value={today} max={realToday ?? today}
                onChange={e => { const v = e.target.value; if (v) router.push(`/manager/closing?date=${v}`) }}
                className="text-xs px-1.5 py-0.5 rounded outline-none border shrink-0"
                style={{ border: '1px solid #e4e4e7', color: '#52525b', background: 'white' }}
                title="切換日期（可補做過往帳目）" />
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ background: st.bg, color: st.color }}>
            {st.label}
          </span>
        </div>
        {!isLocked && (
          <div className="px-4 py-3 overflow-x-auto" style={{ visibility: stepMounted ? 'visible' : 'hidden' }}>
            <div className="flex items-center" style={{ minWidth: 'max-content' }}>
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center">
                  <button
                    ref={el => { stepButtonRefs.current[i] = el }}
                    onClick={() => {
                      if (i === step) return
                      if (!canNavigateToStep(i)) return
                      goToStep(i)
                      scheduleBackgroundSave()
                    }}
                    className="flex flex-col items-center gap-1 px-1.5"
                    style={{ cursor: i === step ? 'default' : 'pointer' }}>
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                      style={{
                        background: i === step ? 'linear-gradient(135deg,#F59E0B,#F97316)' : i < step ? '#10b981' : '#f4f4f5',
                        color: i === step || i < step ? 'white' : '#a1a1aa',
                        boxShadow: i === step ? '0 4px 14px rgba(245,158,11,0.3)' : 'none',
                        transform: i === step ? 'scale(1.1)' : 'scale(1)',
                      }}>
                      {i < step ? '✓' : i + 1}
                    </div>
                    <span className="text-[10px] font-semibold whitespace-nowrap"
                      style={{ color: i === step ? '#F59E0B' : i < step ? '#10b981' : '#a1a1aa' }}>
                      {s.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className="w-6 h-0.5 rounded mx-0.5 mb-4" style={{ background: i < step ? '#10b981' : '#e4e4e7' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4 pb-32" style={{ visibility: stepMounted ? 'visible' : 'hidden' }}>

        {/* HQ 刪除後重做提示 */}
        {hqDeletedReset && (
          <div className="rounded-2xl px-4 py-3.5 flex items-start gap-2.5"
            style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#B45309' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#92400E' }}>總公司已刪除此日帳目，請重新完成</p>
              <p className="text-xs mt-0.5" style={{ color: '#B45309' }}>系統已清除本機暫存，請從第一步重新輸入並送出。</p>
            </div>
          </div>
        )}

        {/* 退回提示 */}
        {isDisputed && (
          <div className="rounded-2xl px-4 py-3.5 flex items-start gap-2.5"
            style={{ background: '#ffe4e6', border: '1px solid #fda4af' }}>
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#be123c' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#be123c' }}>總公司已退回，請修正後重新送出</p>
              {disputeNote && <p className="text-sm mt-0.5" style={{ color: '#be123c' }}>{disputeNote}</p>}
            </div>
          </div>
        )}

        {/* 未完成預留款提醒 */}
        {(stepId === 'receipts' || (isLocked && !submitDone)) && prevDayReserves && prevDayReserves.items.length > 0 && (
          <div className="rounded-2xl px-4 py-3.5" style={{ background: '#fff7ed', border: '1.5px solid #fed7aa' }}>
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="h-4 w-4 shrink-0" style={{ color: '#ea580c' }} />
              <p className="text-sm font-semibold" style={{ color: '#c2410c' }}>
                尚有預留款項未結清
              </p>
            </div>
            <div className="space-y-1.5">
              {prevDayReserves.items.map((r, i) => {
                const remaining = r.remaining_amount ?? (r.total_bill ? r.total_bill - r.amount : null)
                return (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="font-medium" style={{ color: '#c2410c' }}>
                      {r.reason}
                      {r.started_date && <span className="ml-1 text-xs font-normal" style={{ color: '#ea580c' }}>自 {r.started_date}</span>}
                    </span>
                    <div className="text-right">
                      <span className="tabular-nums" style={{ color: '#ea580c' }}>
                        已預留 ${fmt(r.amount)}
                      </span>
                      {remaining !== null && remaining > 0 && (
                        <span className="ml-2 text-xs font-semibold tabular-nums" style={{ color: '#be123c' }}>
                          尚差 ${fmt(remaining)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {(stepId === 'receipts' || (isLocked && !submitDone)) && preReservedExpenseHints.length > 0 && (
          <div className="rounded-2xl px-4 py-3.5 flex items-start gap-2.5" style={{ background: '#fff7ed', border: '1.5px solid #fdba74' }}>
            <FileText className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#c2410c' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#c2410c' }}>預留款提醒</p>
              <p className="text-xs mt-0.5" style={{ color: '#9a3412' }}>
                前幾日有預留款，若今天確實已支付，請在「上傳單據」新增對應支出單據，再到現金清點登記大額支出。
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 1: 上傳單據 ──────────────────────────────────────────── */}
        {(stepId === 'receipts' || (isLocked && !submitDone)) && (
          <>
            {!isLocked && <GradientTitle step={stepNum} total={totalSteps} title="上傳單據"
              desc="上傳今日所有發票與收據，手動填寫金額。" />}

            {/* 隱藏多選上傳 input */}
            {!isLocked && (
              <div className="space-y-2 mb-1">
                {/* 上傳區塊 */}
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-2xl flex flex-col items-center justify-center gap-2 py-6 transition-colors"
                  style={{ border: '2px dashed #FDE68A', background: '#f8f9ff', color: '#F59E0B' }}>
                  <UploadCloud className="h-8 w-8" />
                  <p className="text-sm font-semibold">點此上傳照片（可一次多張）</p>
                  <p className="text-xs" style={{ color: '#a1a1aa' }}>支援 JPG、PNG、HEIC</p>
                </button>

                {/* 無照片新增 */}
                <button onClick={addNoPhotoReceipt}
                  className="w-full h-10 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
                  style={{ border: '1.5px solid #e4e4e7', background: 'white', color: '#52525b' }}>
                  <FileText className="h-4 w-4" />
                  無照片新增收據
                </button>
              </div>
            )}

            {/* 待儲存表單 — 左縮圖 + 右2欄格 */}
            {receiptForms.length > 0 && (
              <div className="bg-white rounded-2xl overflow-hidden"
                style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid #f4f4f5' }}>
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: '#fff7ed' }}>
                      <FileText className="h-4 w-4" style={{ color: '#f97316' }} />
                    </div>
                    <p className="text-sm font-semibold" style={{ color: '#18181b' }}>待填寫單據</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#fff7ed', color: '#c2410c' }}>{receiptForms.length} 筆</span>
                </div>
                <div className="p-4 space-y-4">
                  {receiptForms.map((form, idx) => {
                    const photoSrc = form.previewUrl || form.uploadedPhotoUrl
                    // 預設展開（大圖）；user 主動點「收起」才縮成小縮圖
                    const isExpanded = !collapsedReceiptPhotos.has(form.id)
                    const toggleExpand = () => setCollapsedReceiptPhotos(prev => {
                      const next = new Set(prev)
                      if (next.has(form.id)) next.delete(form.id)
                      else next.add(form.id)
                      return next
                    })
                    return (
                    <div key={form.id} style={{
                      paddingBottom: idx < receiptForms.length - 1 ? '16px' : 0,
                      borderBottom: idx < receiptForms.length - 1 ? '1px solid #f4f4f5' : 'none',
                    }}>
                      {/* 展開時：照片黏在卡片頂端，S/M/L 三段可調 */}
                      {photoSrc && isExpanded && (() => {
                        // 預設 L（大），手機上更容易看清收據文字
                        const size = receiptPhotoSize[form.id] ?? 'L'
                        // L 改用視窗高度自適應，最高 700px；M/S 也跟著放大
                        const photoH: number | string =
                          size === 'S' ? 100 :
                          size === 'L' ? 'min(75vh, 700px)' :
                          360
                        const setSize = (s: 'S' | 'M' | 'L') => setReceiptPhotoSize(p => ({ ...p, [form.id]: s }))
                        return (
                          // 純 inline 大張：捲動下去就消失，不會擋到下方欄位
                          <div style={{ marginBottom: 10 }}>
                            <div className="rounded-xl overflow-hidden shadow-md" style={{ border: '1px solid #f4f4f5', background: 'white' }}>
                              <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa', flexWrap: 'wrap' }}>
                                {/* S/M/L 大小切換 */}
                                <div className="flex gap-0.5 ml-auto rounded-lg p-0.5" style={{ background: 'white', border: '1px solid #fed7aa' }}>
                                  {(['S', 'M', 'L'] as const).map(s => (
                                    <button key={s} type="button" onClick={() => setSize(s)}
                                      style={{
                                        minWidth: 32, minHeight: 28, padding: '0 8px',
                                        background: size === s ? '#fb923c' : 'transparent',
                                        color: size === s ? 'white' : '#c2410c',
                                        border: 'none', borderRadius: 6, cursor: 'pointer',
                                        fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                                      }}>
                                      {s === 'S' ? '小' : s === 'M' ? '中' : '大'}
                                    </button>
                                  ))}
                                </div>
                                <button type="button" onClick={() => setPhotoLightbox(photoSrc)}
                                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold"
                                  style={{ background: 'white', border: '1px solid #fed7aa', color: '#c2410c', cursor: 'pointer', fontFamily: 'inherit', minHeight: 28 }}>
                                  全螢幕
                                </button>
                                <button type="button" onClick={toggleExpand}
                                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold"
                                  style={{ background: 'white', border: '1px solid #fed7aa', color: '#c2410c', cursor: 'pointer', fontFamily: 'inherit', minHeight: 28 }}>
                                  ✕ 收起
                                </button>
                              </div>
                              <button type="button" onClick={() => setPhotoLightbox(photoSrc)}
                                style={{ width: '100%', display: 'block', border: 'none', padding: 0, cursor: 'zoom-in', background: '#f8fafc' }}>
                                <SharedSafePhotoImage src={photoSrc} alt="收據" thumb width={1200} height={900}
                                  style={{
                                    width: '100%',
                                    maxHeight: photoH,
                                    objectFit: size === 'S' ? 'cover' : 'contain',
                                    objectPosition: size === 'S' ? 'top' : 'center',
                                    display: 'block',
                                    transition: 'max-height 0.2s ease',
                                  }} />
                              </button>
                            </div>
                          </div>
                        )
                      })()}

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isExpanded ? '1fr' : '80px 1fr',
                        gap: '14px',
                      }}>
                        {/* 縮圖（展開後隱藏，讓表單佔滿寬度） */}
                        {!isExpanded && (
                          <button type="button" onClick={() => photoSrc && toggleExpand()}
                            style={{
                              width: '80px', height: '100px', borderRadius: '10px', overflow: 'hidden',
                              background: 'linear-gradient(135deg,#f3f4f6,#e5e7eb)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              position: 'relative', flexShrink: 0,
                              cursor: photoSrc ? 'pointer' : 'default',
                              border: 'none', padding: 0,
                            }}>
                          {photoSrc ? (
                            <SharedSafePhotoImage src={photoSrc} alt="receipt" thumb width={180} height={220} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <FileText className="h-8 w-8" style={{ color: '#a1a1aa' }} />
                          )}
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: '9px', padding: '3px', textAlign: 'center', borderRadius: '0 0 10px 10px', pointerEvents: 'none' }}>
                            {photoSrc ? '點圖放大' : '無照片'}
                          </div>
                        </button>
                        )}

                      {/* 表單 */}
                      <div className="receipt-form-fields">
                        {/* 類別 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>類別</label>
                          <CategoryPicker
                            categories={categories}
                            value={form.category}
                            onChange={v => {
                              const catObj = categories.find(c => c.name === v)
                              const autoVendor = !isDirectReceiptCategory(v) && catObj && catObj.vendors.length === 0 ? v : ''
                              updateReceiptFormContext(form.id, v, autoVendor)
                            }}
                          />
                        </div>

                        {/* 廠商／特殊類別的直接選擇 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>{directReceiptLabel(form.category)}</label>
                          {(() => {
                            const catObj = categories.find(c => c.name === form.category)
                            if (isDirectReceiptCategory(form.category)) {
                              const options = directReceiptOptions(form.category, categories, mappingColumns)
                              return (
                                <select value={form.vendor_name}
                                  onChange={e => updateReceiptFormContext(form.id, form.category, e.target.value)}
                                  className="receipt-field"
                                  style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}>
                                  <option value="">— 選擇 —</option>
                                  {options.map(option => <option key={option} value={option}>{option}</option>)}
                                </select>
                              )
                            }
                            if (catObj && catObj.vendors.length > 0) {
                              return (
                                <select value={form.vendor_name}
                                  onChange={e => updateReceiptFormContext(form.id, form.category, e.target.value)}
                                  className="receipt-field"
                                  style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}>
                                  <option value="">— 選擇 —</option>
                                  {catObj.vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                                </select>
                              )
                            }
                            return (
                              <input placeholder="廠商名稱（可空）"
                                className="receipt-field"
                                style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}
                                value={form.vendor_name}
                                onChange={e => updateReceiptFormContext(form.id, form.category, e.target.value)} />
                            )
                          })()}
                        </div>

                        {/* 實際廠商 */}
                        {!isDirectReceiptCategory(form.category) && <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 12px', border: '1.5px solid #93c5fd', borderRadius: '10px', background: '#eff6ff' }}>
                          <label style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: 800 }}>實際廠商名稱（選填）</label>
                          <p style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600 }}>可輸入此類別的廠商名稱，方便後續統計；沒有需要統計時可留白。</p>
                          {(() => {
                            const options = actualVendorOptions(form.vendor_name)
                            const current = normalizeActualVendorName(form.actual_vendor_name)
                            return (
                              <select
                                className="receipt-field"
                                style={{ padding: '10px 12px', minHeight: '42px', border: '2px solid #60a5fa', borderRadius: '8px', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit', background: 'white', outline: 'none', color: current ? '#18181b' : '#1d4ed8' }}
                                value={current}
                                disabled={!form.vendor_name.trim()}
                                onChange={e => {
                                  if (e.target.value === NEW_ACTUAL_VENDOR_VALUE) {
                                    requestNewActualVendor(form.vendor_name, name => updateReceiptForm(form.id, 'actual_vendor_name', name))
                                    return
                                  }
                                  updateReceiptForm(form.id, 'actual_vendor_name', e.target.value)
                                }}
                              >
                                <option value="">{form.vendor_name.trim() ? '— 選擇廠商名稱 —' : '選擇廠商名稱'}</option>
                                {current && !options.includes(current) && <option value={current}>目前：{current}</option>}
                                {options.map(name => <option key={name} value={name}>{name}</option>)}
                                <option value={NEW_ACTUAL_VENDOR_VALUE}>＋新增廠商名稱</option>
                              </select>
                            )
                          })()}
                        </div>}

                        {/* 品項 — 若廠商下沒子品項（廠商本身就是品項，例：瓦斯/水費/電費）→ 隱藏 */}
                        {!isDirectReceiptCategory(form.category) && ((() => {
                          const vendorHasSubItems = !!form.vendor_name && mappingColumns.some(c => c.vendor_group === form.vendor_name)
                          const isNoItemMode = !!form.vendor_name && !vendorHasSubItems
                          return isNoItemMode
                        })() ? (
                          <div style={{ gridColumn: '1/-1', borderTop: '1px solid #f4f4f5', paddingTop: '10px' }}>
                            <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
                              💡「{form.vendor_name}」本身就是品項，不用再選，直接於下方輸入金額即可
                            </p>
                          </div>
                        ) : (() => {
                          function syncItems(newItems: ReceiptFormItem[]) {
                            const total = newItems.filter(i => i.amount !== 0).reduce((s, i) => s + i.amount, 0)
                            setReceiptForms(prev => prev.map(f =>
                              f.id === form.id ? { ...f, items: newItems, ...(total !== 0 ? { total_amount: total } : {}) } : f
                            ))
                          }
                          function addItem() {
                            syncItems([...(form.items ?? []), { id: crypto.randomUUID(), item_name: '', unit: '', quantity: 1, unit_price: 0, amount: 0 }])
                          }
                          function addItemFromVendor(vendorGroup: string) {
                            if (!vendorGroup) return
                            syncItems([...(form.items ?? []), {
                              id: crypto.randomUUID(),
                              item_name: '',
                              unit: '',
                              quantity: 1,
                              unit_price: 0,
                              amount: 0,
                              vendor_group_hint: vendorGroup,
                            }])
                          }
                          function updateItem(itemId: string, field: string, value: any) {
                            syncItems((form.items ?? []).map(i => i.id !== itemId ? i : { ...i, [field]: value }))
                          }
                          function removeItem(itemId: string) {
                            syncItems((form.items ?? []).filter(i => i.id !== itemId))
                          }
                          const vendorGroups = receiptEntryGroups(mappingColumns)

                          return (
                            <div style={{ gridColumn: '1/-1', borderTop: '1px solid #f4f4f5', paddingTop: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                                <div>
                                  <label style={{ fontSize: '14px', color: '#1e3a8a', fontWeight: 800 }}>品項下拉選擇 *</label>
                                  <p style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600, marginTop: '2px' }}>請選擇對應品項。</p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {vendorGroups.length > 0 && (
                                    <select
                                      aria-label="指定廠商品項"
                                      value=""
                                      onChange={e => {
                                        addItemFromVendor(e.target.value)
                                        e.currentTarget.value = ''
                                      }}
                                      style={{ maxWidth: '128px', fontSize: '11px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '4px 7px', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
                                      <option value="">＋指定廠商</option>
                                      {vendorGroups.map(group => <option key={group} value={group}>{group}</option>)}
                                    </select>
                                  )}
                                  <button type="button" onClick={addItem}
                                    style={{ fontSize: '11px', color: '#F59E0B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '3px', padding: 0 }}>
                                    <Plus style={{ width: '12px', height: '12px' }} />新增
                                  </button>
                                </div>
                              </div>

                              {needsExternalTaxInvoiceReminder(form.items ?? []) && (
                                <div className="mb-2"><ExternalTaxInvoiceReminder /></div>
                              )}

                              {/* 細項列表：品項 + 金額 */}
                              <div className="space-y-1.5">
                                {(form.items ?? []).map(item => (
                                  <div key={item.id} className="receipt-item-row">
                                    {mappingColumns.length > 0 ? (
                                      <select
                                        value={(() => {
                                          const hint = item.vendor_group_hint
                                          if (hint && item.item_name) return `${hint}|${item.item_name}`
                                          const match = findReceiptItemMapping(item.item_name, form.vendor_name, form.category, mappingColumns)
                                          return match?.vendor_group ? `${match.vendor_group}|${item.item_name}` : item.item_name
                                        })()}
                                        onChange={e => {
                                          const raw = e.target.value
                                          const sepIdx = raw.indexOf('|')
                                          // 「{vg}|{name}」格式（多個同名品項需要 vg 區分）；無 | 則整字串視為 name
                                          const vg = sepIdx > 0 ? raw.slice(0, sepIdx) : ''
                                          const name = sepIdx > 0 ? raw.slice(sepIdx + 1) : raw
                                          // 一次 syncItems 同時更新兩欄位，避免兩個連續 setState 因 closure 看到舊 state 互相覆蓋
                                          syncItems((form.items ?? []).map(i =>
                                            i.id !== item.id ? i : { ...i, item_name: name, vendor_group_hint: vg || undefined }
                                          ))
                                        }}
                                        className="receipt-field"
                                        style={{ flex: 1, minHeight: '42px', padding: '8px 10px', border: `2px solid ${item.item_name ? '#F59E0B' : '#60A5FA'}`, borderRadius: '8px', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit', outline: 'none', color: item.item_name ? '#18181b' : '#1d4ed8', background: item.item_name ? 'white' : '#eff6ff' }}>
                                        <option value="">— 選擇{item.vendor_group_hint ? item.vendor_group_hint : ''}品項 —</option>
                                        {(() => {
                                          // 央廚配送品項不在收據錄入內
                                          // 退稅品項只有在選到退稅廠商／分類時顯示，避免平常誤選。
                                          const allowTaxItems = form.vendor_name === '退稅' || item.vendor_group_hint === '退稅' || form.category === '退稅'
                                          const base = receiptItemMappingsForContext(mappingColumns, form.category, form.vendor_name, item.vendor_group_hint, allowTaxItems)
                                          const groups: { group: string; items: typeof mappingColumns }[] = []
                                          for (const col of base) {
                                            const g = col.vendor_group ?? col.category
                                            const existing = groups.find(x => x.group === g)
                                            if (existing) existing.items.push(col)
                                            else groups.push({ group: g, items: [col] })
                                          }
                                          // 依分類優先級排序：叫貨廠商→日用品→文件類型→退稅→未分類
                                          groups.sort((a, b) =>
                                            dropdownGroupRank(a.group) - dropdownGroupRank(b.group)
                                            || a.group.localeCompare(b.group, 'zh-Hant'),
                                          )
                                          // 顯示時剝離直接相連的 vendor_group 前綴；有分隔符的名稱保留完整（例：免洗-稅金）
                                          const stripVg = (n: string, vg?: string) =>
                                            displayItemName(n, vg)
                                          return groups.map(({ group, items }) => (
                                            <optgroup key={group} label={group}>
                                              {items.map(c => {
                                                const val = c.vendor_group ? `${c.vendor_group}|${c.name}` : c.name
                                                return <option key={`${group}|${c.name}`} value={val}>{stripVg(c.name, c.vendor_group)}</option>
                                              })}
                                            </optgroup>
                                          ))
                                        })()}
                                      </select>
                                    ) : (
                                      <input placeholder="品項名稱"
                                        className="receipt-field"
                                        style={{ flex: 1, padding: '6px 8px', border: '1px solid #e4e4e7', borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', color: '#18181b', background: 'white' }}
                                        value={item.item_name}
                                        onChange={e => updateItem(item.id, 'item_name', e.target.value)} />
                                    )}
                                    {(() => {
                                      // 「折扣 / 退貨」類品項：使用者輸入正數，系統自動存負數
                                      const neg = ['折扣', '退貨', '退款', '退費', '抵扣'].some(k => (item.item_name ?? '').includes(k)) || isAutoNegativeOtherReceiptItem(item.item_name, form.category)
                                      const allowManualNegative = canUseNegativeOtherReceiptItem(item.item_name, form.category) && !isAutoNegativeOtherReceiptItem(item.item_name, form.category)
                                      const displayed = item.amount === 0 ? '' : (neg ? Math.abs(item.amount) : item.amount)
                                      return (
                                        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                                          <input type="number" placeholder="金額" min={allowManualNegative ? undefined : 0} inputMode={allowManualNegative ? 'decimal' : 'numeric'}
                                            style={{ width: '80px', padding: '6px 8px', border: `1px solid ${neg || item.amount < 0 ? '#fca5a5' : '#FDE68A'}`, borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', textAlign: 'right', color: neg || item.amount < 0 ? '#dc2626' : '#18181b', background: neg || item.amount < 0 ? '#fef2f2' : '#f5f5ff', flexShrink: 0, boxSizing: 'border-box' as const }}
                                            value={displayed}
                                            onChange={e => {
                                              const v = parseInt(e.target.value) || 0
                                              updateItem(item.id, 'amount', neg ? -Math.abs(v) : allowManualNegative ? v : Math.max(0, v))
                                            }} />
                                          {neg && <span style={{ fontSize: 9, color: '#dc2626', textAlign: 'right', marginTop: 1 }}>自動轉負</span>}
                                          {!neg && allowManualNegative && (
                                            <button
                                              type="button"
                                              onClick={() => updateItem(item.id, 'amount', item.amount < 0 ? Math.abs(item.amount) : -Math.abs(item.amount || 0))}
                                              style={{ width: '80px', minHeight: '36px', fontSize: 12, color: item.amount < 0 ? '#047857' : '#dc2626', marginTop: 4, padding: '8px 10px', border: `1px solid ${item.amount < 0 ? '#86efac' : '#fca5a5'}`, borderRadius: 999, background: item.amount < 0 ? '#f0fdf4' : '#fef2f2', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, lineHeight: 1 }}>
                                              {item.amount < 0 ? '轉正' : '轉負'}
                                            </button>
                                          )}
                                        </div>
                                      )
                                    })()}
                                    <button type="button" onClick={() => removeItem(item.id)}
                                      style={{ padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', flexShrink: 0 }}>
                                      <X style={{ width: '14px', height: '14px' }} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })())}

                        {isDirectReceiptCategory(form.category) && (() => {
                          const allowNegativeTotal = receiptFormAllowsNegativeTotal(form)
                          const forceNegativeTotal = receiptFormForcesNegativeTotal(form)
                          const amountValid = isReceiptFormAmountValid(form)
                          return (
                            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 12px', border: '1.5px solid #93c5fd', borderRadius: '10px', background: '#eff6ff' }}>
                              <label style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 700 }}>商品原始金額 *</label>
                              <input type="number" min={allowNegativeTotal ? undefined : 0} inputMode={allowNegativeTotal ? 'decimal' : 'numeric'} placeholder="0"
                                style={{ padding: '8px 10px', border: `1.5px solid ${amountValid ? '#60a5fa' : '#fda4af'}`, borderRadius: '8px', fontSize: '16px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit', background: 'white', outline: 'none', color: form.total_amount < 0 ? '#dc2626' : '#18181b' }}
                                value={form.total_amount || ''}
                                onChange={e => {
                                  const value = parseInt(e.target.value) || 0
                                  updateReceiptForm(form.id, 'total_amount', forceNegativeTotal ? -Math.abs(value) : allowNegativeTotal ? value : Math.max(0, value))
                                }} />
                              {allowNegativeTotal && !forceNegativeTotal && (
                                <button type="button"
                                  onClick={() => updateReceiptForm(form.id, 'total_amount', form.total_amount < 0 ? Math.abs(form.total_amount) : -Math.abs(form.total_amount || 0))}
                                  style={{ alignSelf: 'flex-end', minWidth: 80, minHeight: 36, fontSize: 12, color: form.total_amount < 0 ? '#047857' : '#dc2626', border: `1px solid ${form.total_amount < 0 ? '#86efac' : '#fca5a5'}`, borderRadius: 999, background: form.total_amount < 0 ? '#f0fdf4' : '#fef2f2', padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, lineHeight: 1 }}>
                                  {form.total_amount < 0 ? '轉正' : '轉負'}
                                </button>
                              )}
                            </div>
                          )
                        })()}

                        {(() => {
                          const taxMapping = findTaxAddonMapping(mappingColumns, form.vendor_name, form.category, form.items ?? [])
                          if (!taxMapping) return null
                          return (
                            <div style={{ gridColumn: '1/-1', padding: '10px 12px', border: '1.5px solid #fdba74', borderRadius: '10px', background: '#fff7ed' }}>
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-bold" style={{ color: '#9a3412' }}>稅外加</p>
                                  <p className="text-[11px]" style={{ color: '#c2410c' }}>稅金由結帳人員依發票自行填寫，將自動歸入「{taxMapping.name}」。</p>
                                </div>
                                <button type="button" onClick={() => updateReceiptForm(form.id, 'has_tax', !form.has_tax)}
                                  className="px-3 py-2 rounded-full text-xs font-bold shrink-0"
                                  style={{ background: form.has_tax ? '#f97316' : 'white', color: form.has_tax ? 'white' : '#9a3412', border: '1.5px solid #fb923c' }}>
                                  {form.has_tax ? '已開啟' : '開啟'}
                                </button>
                              </div>
                              {form.has_tax && (
                                <input type="number" min={0} inputMode="numeric" placeholder="自行輸入稅金金額"
                                  value={form.tax_amount || ''}
                                  onChange={event => updateReceiptForm(form.id, 'tax_amount', Math.max(0, parseInt(event.target.value) || 0))}
                                  className="mt-3 w-full rounded-lg px-3 py-2 text-right text-base font-bold outline-none"
                                  style={{ border: '1.5px solid #fb923c', background: 'white', color: '#9a3412' }} />
                              )}
                            </div>
                          )
                        })()}

                        {/* 備註（品項之後） */}
                        {(() => {
                          const NEED_NOTE_NAMES = ['發票', '收據', '估價單']
                          const needNote =
                            requiresPurchaseRepairNote(form.category) ||
                            (!isDirectReceiptCategory(form.category) && (
                              NEED_NOTE_NAMES.includes(form.vendor_name ?? '') ||
                              (form.items ?? []).some(i => NEED_NOTE_NAMES.includes(i.item_name))
                            ))
                          return (
                            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 12px', border: '1.5px solid #93c5fd', borderRadius: '10px', background: '#eff6ff' }}>
                              <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                備註（可空）
                                {needNote && (
                                  <span style={{ fontSize: '10px', color: '#B45309', background: '#FEF3C7', padding: '1px 8px', borderRadius: '8px', fontWeight: 700 }}>
                                    💡 請輸入購買或維修內容
                                  </span>
                                )}
                              </label>
                              <textarea
                                placeholder={needNote ? '請寫下購買或維修內容（例：燈泡、清潔劑、冷氣維修…）' : ''}
                                style={{ padding: '8px 10px', border: `1.5px solid ${needNote && !form.notes?.trim() ? '#FBBF24' : '#e4e4e7'}`, borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b', resize: 'none', minHeight: '64px' }}
                                value={form.notes}
                                onChange={e => updateReceiptForm(form.id, 'notes', e.target.value)} />
                            </div>
                          )
                        })()}

                        {/* 金額（最下） */}
                        {(() => {
                          const itemsTotal = (form.items ?? []).filter(i => i.amount !== 0).reduce((s, i) => s + i.amount, 0)
                          const hasItemsTotal = itemsTotal !== 0
                          const taxMapping = findTaxAddonMapping(mappingColumns, form.vendor_name, form.category, form.items ?? [])
                          const appliedTaxAmount = taxMapping && form.has_tax ? Math.max(0, form.tax_amount) : 0
                          const displayedTotal = form.total_amount + appliedTaxAmount
                          const hasAutoTotal = hasItemsTotal || appliedTaxAmount > 0
                          const isDirectAmountFlow = isDirectReceiptCategory(form.category)
                          const totalReadOnly = hasAutoTotal || isDirectAmountFlow
                          const amountValid = isReceiptFormAmountValid(form)
                          const allowNegativeTotal = receiptFormAllowsNegativeTotal(form)
                          const forceNegativeTotal = receiptFormForcesNegativeTotal(form)
                          return (
                            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 12px', border: '1.5px solid #93c5fd', borderRadius: '10px', background: '#eff6ff' }}>
                              <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {isDirectAmountFlow ? '總金額' : '金額 *'}
                                {totalReadOnly && <span style={{ fontSize: '10px', color: '#F59E0B', background: '#FFFBEB', padding: '1px 6px', borderRadius: '8px' }}>自動加總</span>}
                              </label>
                              <input type="number" min={allowNegativeTotal ? undefined : 0} inputMode={allowNegativeTotal ? 'decimal' : 'numeric'} placeholder="0" readOnly={totalReadOnly}
                                style={{ padding: '8px 10px', border: `1.5px solid ${totalReadOnly ? '#FDE68A' : amountValid ? '#e4e4e7' : '#fda4af'}`, borderRadius: '8px', fontSize: '16px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit', background: totalReadOnly ? '#f5f5ff' : 'white', outline: 'none', color: displayedTotal < 0 ? '#dc2626' : '#18181b', cursor: totalReadOnly ? 'default' : 'text' }}
                                value={displayedTotal || ''}
                                onChange={e => {
                                  if (totalReadOnly) return
                                  const value = parseInt(e.target.value) || 0
                                  updateReceiptForm(form.id, 'total_amount', forceNegativeTotal ? -Math.abs(value) : allowNegativeTotal ? value : Math.max(0, value))
                                }} />
                              {taxMapping && form.has_tax && (
                                <div style={{ fontSize: '11px', color: '#9a3412', textAlign: 'right', fontWeight: 700 }}>
                                  商品 ${form.total_amount.toLocaleString()} ＋ 稅金 ${appliedTaxAmount.toLocaleString()} ＝ ${displayedTotal.toLocaleString()}
                                </div>
                              )}
                              {allowNegativeTotal && !forceNegativeTotal && !hasItemsTotal && !isDirectAmountFlow && (
                                <button
                                  type="button"
                                  onClick={() => updateReceiptForm(form.id, 'total_amount', form.total_amount < 0 ? Math.abs(form.total_amount) : -Math.abs(form.total_amount || 0))}
                                  style={{ alignSelf: 'flex-end', minWidth: 80, minHeight: 36, fontSize: 12, color: form.total_amount < 0 ? '#047857' : '#dc2626', border: `1px solid ${form.total_amount < 0 ? '#86efac' : '#fca5a5'}`, borderRadius: 999, background: form.total_amount < 0 ? '#f0fdf4' : '#fef2f2', padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, lineHeight: 1 }}>
                                  {form.total_amount < 0 ? '轉正' : '轉負'}
                                </button>
                              )}
                            </div>
                          )
                        })()}

                        {/* 刪除 + 儲存 */}
                        <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <button onClick={() => removeReceiptForm(form.id)}
                            className="flex items-center gap-1 text-xs"
                            style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit' }}>
                            <Trash2 className="h-3 w-3" />刪除
                          </button>
                          <button onClick={() => saveReceiptForm(form)} disabled={form.uploading || !isReceiptFormAmountValid(form)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white"
                            style={{
                              background: isReceiptFormAmountValid(form) ? 'linear-gradient(135deg,#F59E0B,#F97316)' : '#d4d4d8',
                              cursor: isReceiptFormAmountValid(form) ? 'pointer' : 'not-allowed',
                              opacity: form.uploading ? 0.7 : 1, border: 'none', fontFamily: 'inherit',
                              boxShadow: isReceiptFormAmountValid(form) ? '0 4px 12px rgba(245,158,11,0.3)' : 'none',
                            }}>
                            {form.uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />儲存中…</> : '儲存'}
                          </button>
                        </div>
                      </div>
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            )}

            {/* 已儲存收據清單 */}
            {localReceipts.length > 0 && (
              <SectionCard icon={<Camera className="h-4 w-4" />}
                title={`今日收據（${localReceipts.filter(r => !isCKReceipt(r, ckPrices)).length} 筆支出${localReceipts.some(r => isCKReceipt(r, ckPrices)) ? ' + 央廚' : ''}）`}
                iconColor="#F59E0B">
                <div className="space-y-2">
                  {localReceipts.map(r => {
                    const isCK = isCKReceipt(r, ckPrices)
                    const isEditing = editingReceiptId === r.id
                    if (isEditing) {
                      return (
                        <div key={r.id} style={{
                          display: 'grid', gridTemplateColumns: '80px 1fr', gap: '14px',
                          background: '#f8f9ff', border: '1.5px solid #FDE68A',
                          borderRadius: '14px', padding: '14px',
                        }}>
                          {/* 縮圖：點照片放大，相機icon重新上傳 */}
                          <div style={{ width: '80px', height: '100px', borderRadius: '10px', overflow: 'hidden', background: 'linear-gradient(135deg,#f3f4f6,#e5e7eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
                            {editPhotoPreview ? (
                              <button type="button" onClick={() => setPhotoLightbox(editPhotoPreview)}
                                style={{ width: '100%', height: '100%', border: 'none', padding: 0, cursor: 'zoom-in', background: 'none' }}>
                                <SharedSafePhotoImage src={editPhotoPreview} alt="收據" thumb width={180} height={220} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </button>
                            ) : (
                              <FileText className="h-8 w-8" style={{ color: '#a1a1aa' }} />
                            )}
                            {/* 重新上傳按鈕 */}
                            <button type="button" onClick={() => editPhotoInputRef.current?.click()}
                              style={{ position: 'absolute', bottom: '4px', right: '4px', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                              <Camera className="h-3 w-3" style={{ color: 'white' }} />
                            </button>
                            {!editPhotoPreview && (
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: '9px', padding: '3px', textAlign: 'center', borderRadius: '0 0 10px 10px' }}>
                                新增照片
                              </div>
                            )}
                          </div>
                          {/* 表單 */}
                          <div className="receipt-form-fields">
                            {/* 類別 */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>類別</label>
                              <CategoryPicker
                                categories={categories}
                                value={editCategory}
                                onChange={v => {
                                  const catObj = categories.find(c => c.name === v)
                                  const autoVendor = !isDirectReceiptCategory(v) && catObj && catObj.vendors.length === 0 ? v : ''
                                  updateEditContext(v, autoVendor)
                                }}
                              />
                            </div>

                            {/* 廠商／特殊類別的直接選擇 */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>{directReceiptLabel(editCategory)}</label>
                              {(() => {
                                const catObj = categories.find(c => c.name === editCategory)
                                if (isDirectReceiptCategory(editCategory)) {
                                  const options = directReceiptOptions(editCategory, categories, mappingColumns)
                                  return (
                                    <select value={editVendor} onChange={e => updateEditContext(editCategory, e.target.value)}
                                      className="receipt-field"
                                      style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}>
                                      <option value="">— 選擇 —</option>
                                      {options.map(option => <option key={option} value={option}>{option}</option>)}
                                    </select>
                                  )
                                }
                                if (catObj && catObj.vendors.length > 0) {
                                  return (
                                    <select value={editVendor} onChange={e => updateEditContext(editCategory, e.target.value)}
                                      className="receipt-field"
                                      style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}>
                                      <option value="">— 選擇 —</option>
                                      {catObj.vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                                    </select>
                                  )
                                }
                                return (
                                  <input placeholder="廠商名稱（可空）"
                                    className="receipt-field"
                                    style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}
                                    value={editVendor} onChange={e => updateEditContext(editCategory, e.target.value)} />
                                )
                              })()}
                            </div>

                            {/* 實際廠商 */}
                            {!isDirectReceiptCategory(editCategory) && <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <label style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: 800 }}>實際廠商名稱（選填）</label>
                              <p style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600 }}>可輸入此類別的廠商名稱，方便後續統計；沒有需要統計時可留白。</p>
                              {(() => {
                                const options = actualVendorOptions(editVendor)
                                const current = normalizeActualVendorName(editActualVendor)
                                return (
                                  <select
                                    className="receipt-field"
                                    style={{ padding: '10px 12px', minHeight: '42px', border: '2px solid #60a5fa', borderRadius: '8px', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit', background: 'white', outline: 'none', color: current ? '#18181b' : '#1d4ed8' }}
                                    value={current}
                                    disabled={!editVendor.trim()}
                                    onChange={e => {
                                      if (e.target.value === NEW_ACTUAL_VENDOR_VALUE) {
                                        requestNewActualVendor(editVendor, setEditActualVendor)
                                        return
                                      }
                                      setEditActualVendor(e.target.value)
                                    }}
                                  >
                                    <option value="">{editVendor.trim() ? '— 選擇廠商名稱 —' : '選擇廠商名稱'}</option>
                                    {current && !options.includes(current) && <option value={current}>目前：{current}</option>}
                                    {options.map(name => <option key={name} value={name}>{name}</option>)}
                                    <option value={NEW_ACTUAL_VENDOR_VALUE}>＋新增廠商名稱</option>
                                  </select>
                                )
                              })()}
                            </div>}

                            {/* 稅外加 UI 已移除 — 稅金請直接選稅金品項輸入金額 */}

                            {/* 品項 — 若廠商下沒子品項（廠商本身就是品項）→ 隱藏 */}
                            {!isDirectReceiptCategory(editCategory) && ((() => {
                              const vendorHasSubItems = !!editVendor && mappingColumns.some(c => c.vendor_group === editVendor)
                              return !!editVendor && !vendorHasSubItems
                            })() ? (
                              <div style={{ gridColumn: '1/-1', borderTop: '1px solid #f4f4f5', paddingTop: '10px' }}>
                                <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
                                  💡「{editVendor}」本身就是品項，不用再選，直接於下方輸入金額
                                </p>
                              </div>
                            ) : (() => {
                              function syncEditItems(newItems: typeof editItems) {
                                setEditItems(newItems)
                                const total = newItems.filter(i => i.amount !== 0).reduce((s, i) => s + i.amount, 0)
                                if (total !== 0) setEditAmount(total)
                              }
                              function addEditItemFn() {
                                syncEditItems([...editItems, { id: crypto.randomUUID(), item_name: '', unit: '', quantity: 1, unit_price: 0, amount: 0 }])
                              }
                              function addEditItemFromVendor(vendorGroup: string) {
                                if (!vendorGroup) return
                                syncEditItems([...editItems, {
                                  id: crypto.randomUUID(),
                                  item_name: '',
                                  unit: '',
                                  quantity: 1,
                                  unit_price: 0,
                                  amount: 0,
                                  vendor_group_hint: vendorGroup,
                                }])
                              }
                              function updateEditItemFn(idx: number, field: string, value: any) {
                                syncEditItems(editItems.map((item, i) => i !== idx ? item : { ...item, [field]: value }))
                              }
                              function removeEditItemFn(idx: number) {
                                syncEditItems(editItems.filter((_, i) => i !== idx))
                              }
                              const vendorGroups = receiptEntryGroups(mappingColumns)

                              return (
                                <div style={{ gridColumn: '1/-1', borderTop: '1px solid #f4f4f5', paddingTop: '10px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>品項 *</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {vendorGroups.length > 0 && (
                                        <select
                                          aria-label="指定廠商品項"
                                          value=""
                                          onChange={e => {
                                            addEditItemFromVendor(e.target.value)
                                            e.currentTarget.value = ''
                                          }}
                                          style={{ maxWidth: '128px', fontSize: '11px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '4px 7px', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
                                          <option value="">＋指定廠商</option>
                                          {vendorGroups.map(group => <option key={group} value={group}>{group}</option>)}
                                        </select>
                                      )}
                                      <button type="button" onClick={() => addEditItemFn()}
                                        style={{ fontSize: '11px', color: '#F59E0B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '3px', padding: 0 }}>
                                        <Plus style={{ width: '12px', height: '12px' }} />新增
                                      </button>
                                    </div>
                                  </div>
                                  {needsExternalTaxInvoiceReminder(editItems) && (
                                    <div className="mb-2"><ExternalTaxInvoiceReminder /></div>
                                  )}
                                  <div className="space-y-1.5">
                                    {editItems.map((item, idx) => (
                                      <div key={item.id} className="receipt-item-row">
                                        {mappingColumns.length > 0 ? (
                                          <select
                                            value={(() => {
                                              const hint = item.vendor_group_hint
                                              if (hint && item.item_name) return `${hint}|${item.item_name}`
                                              const match = findReceiptItemMapping(item.item_name, editVendor, editCategory, mappingColumns)
                                              return match?.vendor_group ? `${match.vendor_group}|${item.item_name}` : item.item_name
                                            })()}
                                            onChange={e => {
                                              const raw = e.target.value
                                              const sepIdx = raw.indexOf('|')
                                              const vg = sepIdx > 0 ? raw.slice(0, sepIdx) : ''
                                              const name = sepIdx > 0 ? raw.slice(sepIdx + 1) : raw
                                              syncEditItems(editItems.map((row, i) =>
                                                i !== idx ? row : { ...row, item_name: name, vendor_group_hint: vg }
                                              ))
                                            }}
                                            className="receipt-field"
                                            style={{ flex: 1, padding: '6px 8px', border: `1px solid ${item.item_name ? '#F59E0B' : '#e4e4e7'}`, borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', color: item.item_name ? '#18181b' : '#a1a1aa', background: 'white' }}>
                                            <option value="">— 選擇{item.vendor_group_hint ? item.vendor_group_hint : ''}品項 —</option>
                                            {(() => {
                                              const base = receiptItemMappingsForContext(mappingColumns, editCategory, editVendor, item.vendor_group_hint)
                                              const groups: { group: string; items: typeof mappingColumns }[] = []
                                              for (const col of base) {
                                                const g = col.vendor_group ?? col.category
                                                const existing = groups.find(x => x.group === g)
                                                if (existing) existing.items.push(col)
                                                else groups.push({ group: g, items: [col] })
                                              }
                                              groups.sort((a, b) =>
                                                dropdownGroupRank(a.group) - dropdownGroupRank(b.group)
                                                || a.group.localeCompare(b.group, 'zh-Hant'),
                                              )
                                              const stripVg = (n: string, vg?: string) =>
                                                displayItemName(n, vg)
                                              return groups.map(({ group, items }) => (
                                                <optgroup key={group} label={group}>
                                                  {items.map(c => {
                                                    const val = c.vendor_group ? `${c.vendor_group}|${c.name}` : c.name
                                                    return <option key={`${group}|${c.name}`} value={val}>{stripVg(c.name, c.vendor_group)}</option>
                                                  })}
                                                </optgroup>
                                              ))
                                            })()}
                                          </select>
                                        ) : (
                                          <input placeholder="品項名稱"
                                            className="receipt-field"
                                            style={{ flex: 1, padding: '6px 8px', border: '1px solid #e4e4e7', borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', color: '#18181b', background: 'white' }}
                                            value={item.item_name}
                                            onChange={e => updateEditItemFn(idx, 'item_name', e.target.value)} />
                                        )}
                                        {(() => {
                                          const neg = ['折扣', '退貨', '退款', '退費', '抵扣'].some(k => (item.item_name ?? '').includes(k)) || isAutoNegativeOtherReceiptItem(item.item_name, editCategory)
                                          const allowManualNegative = canUseNegativeOtherReceiptItem(item.item_name, editCategory) && !isAutoNegativeOtherReceiptItem(item.item_name, editCategory)
                                          const displayed = item.amount === 0 ? '' : (neg ? Math.abs(item.amount) : item.amount)
                                          return (
                                            <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                                              <input type="number" placeholder="金額" min={allowManualNegative ? undefined : 0} inputMode={allowManualNegative ? 'decimal' : 'numeric'}
                                                style={{ width: '80px', padding: '6px 8px', border: `1px solid ${neg || item.amount < 0 ? '#fca5a5' : '#FDE68A'}`, borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', textAlign: 'right', color: neg || item.amount < 0 ? '#dc2626' : '#18181b', background: neg || item.amount < 0 ? '#fef2f2' : '#f5f5ff', flexShrink: 0 }}
                                                value={displayed}
                                                onChange={e => {
                                                  const v = parseInt(e.target.value) || 0
                                                  updateEditItemFn(idx, 'amount', neg ? -Math.abs(v) : allowManualNegative ? v : Math.max(0, v))
                                                }} />
                                              {neg && <span style={{ fontSize: 9, color: '#dc2626', textAlign: 'right', marginTop: 1 }}>自動轉負</span>}
                                              {!neg && allowManualNegative && (
                                                  <button
                                                    type="button"
                                                    onClick={() => updateEditItemFn(idx, 'amount', item.amount < 0 ? Math.abs(item.amount) : -Math.abs(item.amount || 0))}
                                                  style={{ width: '80px', minHeight: '36px', fontSize: 12, color: item.amount < 0 ? '#047857' : '#dc2626', marginTop: 4, padding: '8px 10px', border: `1px solid ${item.amount < 0 ? '#86efac' : '#fca5a5'}`, borderRadius: 999, background: item.amount < 0 ? '#f0fdf4' : '#fef2f2', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, lineHeight: 1 }}>
                                                  {item.amount < 0 ? '轉正' : '轉負'}
                                                </button>
                                              )}
                                            </div>
                                          )
                                        })()}
                                        <button type="button" onClick={() => removeEditItemFn(idx)}
                                          style={{ padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', flexShrink: 0 }}>
                                          <X style={{ width: '14px', height: '14px' }} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )
                            })())}

                            {isDirectReceiptCategory(editCategory) && (() => {
                              const allowNegativeTotal = editReceiptAllowsNegativeTotal(editCategory, editItems)
                              const forceNegativeTotal = editReceiptForcesNegativeTotal(editCategory, editItems)
                              const amountValid = editAmount > 0 || (editAmount < 0 && allowNegativeTotal)
                              return (
                                <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', border: '1.5px solid #93c5fd', borderRadius: '10px', background: '#eff6ff' }}>
                                  <label style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 700 }}>商品原始金額 *</label>
                                  <input type="number" min={allowNegativeTotal ? undefined : 0} inputMode={allowNegativeTotal ? 'decimal' : 'numeric'} placeholder="0"
                                    style={{ padding: '8px 10px', border: `1.5px solid ${amountValid ? '#60a5fa' : '#fda4af'}`, borderRadius: '8px', fontSize: '16px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit', background: 'white', outline: 'none', color: editAmount < 0 ? '#dc2626' : '#18181b' }}
                                    value={editAmount || ''}
                                    onChange={e => {
                                      const value = parseInt(e.target.value) || 0
                                      setEditAmount(forceNegativeTotal ? -Math.abs(value) : allowNegativeTotal ? value : Math.max(0, value))
                                    }} />
                                  {allowNegativeTotal && !forceNegativeTotal && (
                                    <button type="button"
                                      onClick={() => setEditAmount(editAmount < 0 ? Math.abs(editAmount) : -Math.abs(editAmount || 0))}
                                      style={{ alignSelf: 'flex-end', minWidth: 80, minHeight: 36, fontSize: 12, color: editAmount < 0 ? '#047857' : '#dc2626', border: `1px solid ${editAmount < 0 ? '#86efac' : '#fca5a5'}`, borderRadius: 999, background: editAmount < 0 ? '#f0fdf4' : '#fef2f2', padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, lineHeight: 1 }}>
                                      {editAmount < 0 ? '轉正' : '轉負'}
                                    </button>
                                  )}
                                </div>
                              )
                            })()}

                            {(() => {
                              const taxMapping = findTaxAddonMapping(mappingColumns, editVendor, editCategory, editItems)
                              if (!taxMapping) return null
                              return (
                                <div style={{ gridColumn: '1/-1', padding: '10px 12px', border: '1.5px solid #fdba74', borderRadius: '10px', background: '#fff7ed' }}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-bold" style={{ color: '#9a3412' }}>稅外加</p>
                                      <p className="text-[11px]" style={{ color: '#c2410c' }}>自行輸入稅金，系統會歸入「{taxMapping.name}」。</p>
                                    </div>
                                    <button type="button" onClick={() => setEditHasTax(value => !value)}
                                      className="px-3 py-2 rounded-full text-xs font-bold shrink-0"
                                      style={{ background: editHasTax ? '#f97316' : 'white', color: editHasTax ? 'white' : '#9a3412', border: '1.5px solid #fb923c' }}>
                                      {editHasTax ? '已開啟' : '開啟'}
                                    </button>
                                  </div>
                                  {editHasTax && (
                                    <input type="number" min={0} inputMode="numeric" placeholder="自行輸入稅金金額"
                                      value={editTaxAmount || ''}
                                      onChange={event => setEditTaxAmount(Math.max(0, parseInt(event.target.value) || 0))}
                                      className="mt-3 w-full rounded-lg px-3 py-2 text-right text-base font-bold outline-none"
                                      style={{ border: '1.5px solid #fb923c', background: 'white', color: '#9a3412' }} />
                                  )}
                                </div>
                              )
                            })()}

                            {/* 備註（品項之後） */}
                            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                備註（可空）
                                {requiresPurchaseRepairNote(editCategory) && <span style={{ fontSize: '10px', color: '#B45309', background: '#FEF3C7', padding: '1px 8px', borderRadius: '8px', fontWeight: 700 }}>💡 請輸入購買或維修內容</span>}
                              </label>
                              <textarea placeholder={requiresPurchaseRepairNote(editCategory) ? '請寫下購買或維修內容（例：燈泡、清潔劑、冷氣維修…）' : ''}
                                style={{ padding: '8px 10px', border: `1.5px solid ${requiresPurchaseRepairNote(editCategory) && !editNotes.trim() ? '#FBBF24' : '#e4e4e7'}`, borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b', resize: 'none', minHeight: '64px' }}
                                value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                            </div>

                            {/* 金額（最下） */}
                            {(() => {
                              const editItemsTotal = editItems.filter(i => i.amount !== 0).reduce((s, i) => s + i.amount, 0)
                              const editHasItemsTotal = editItemsTotal !== 0
                              const editTaxMapping = findTaxAddonMapping(mappingColumns, editVendor, editCategory, editItems)
                              const appliedEditTaxAmount = editTaxMapping && editHasTax ? Math.max(0, editTaxAmount) : 0
                              const displayedEditTotal = editAmount + appliedEditTaxAmount
                              const editHasAutoTotal = editHasItemsTotal || appliedEditTaxAmount > 0
                              const isDirectAmountFlow = isDirectReceiptCategory(editCategory)
                              const totalReadOnly = editHasAutoTotal || isDirectAmountFlow
                              const allowNegativeTotal = editReceiptAllowsNegativeTotal(editCategory, editItems)
                              const forceNegativeTotal = editReceiptForcesNegativeTotal(editCategory, editItems)
                              const editAmountValid = editAmount > 0 || (editAmount < 0 && allowNegativeTotal)
                              return (
                                <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {isDirectAmountFlow ? '總金額' : '金額 *'}
                                    {totalReadOnly && <span style={{ fontSize: '10px', color: '#F59E0B', background: '#FFFBEB', padding: '1px 6px', borderRadius: '8px' }}>自動加總</span>}
                                  </label>
                                  <input type="number" min={allowNegativeTotal ? undefined : 0} inputMode={allowNegativeTotal ? 'decimal' : 'numeric'} placeholder="0" readOnly={totalReadOnly}
                                    style={{ padding: '8px 10px', border: `1.5px solid ${totalReadOnly ? '#FDE68A' : editAmountValid ? '#e4e4e7' : '#fda4af'}`, borderRadius: '8px', fontSize: '16px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit', background: totalReadOnly ? '#f5f5ff' : 'white', outline: 'none', color: displayedEditTotal < 0 ? '#dc2626' : '#18181b', cursor: totalReadOnly ? 'default' : 'text' }}
                                    value={displayedEditTotal || ''}
                                    onChange={e => {
                                      if (totalReadOnly) return
                                      const value = parseInt(e.target.value) || 0
                                      setEditAmount(forceNegativeTotal ? -Math.abs(value) : allowNegativeTotal ? value : Math.max(0, value))
                                    }} />
                                  {editTaxMapping && editHasTax && (
                                    <div style={{ fontSize: '11px', color: '#9a3412', textAlign: 'right', fontWeight: 700 }}>
                                      商品 ${editAmount.toLocaleString()} ＋ 稅金 ${appliedEditTaxAmount.toLocaleString()} ＝ ${displayedEditTotal.toLocaleString()}
                                    </div>
                                  )}
                                  {allowNegativeTotal && !forceNegativeTotal && !editHasItemsTotal && !isDirectAmountFlow && (
                                    <button
                                      type="button"
                                      onClick={() => setEditAmount(editAmount < 0 ? Math.abs(editAmount) : -Math.abs(editAmount || 0))}
                                      style={{ alignSelf: 'flex-end', minWidth: 80, minHeight: 36, fontSize: 12, color: editAmount < 0 ? '#047857' : '#dc2626', border: `1px solid ${editAmount < 0 ? '#86efac' : '#fca5a5'}`, borderRadius: 999, background: editAmount < 0 ? '#f0fdf4' : '#fef2f2', padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, lineHeight: 1 }}>
                                      {editAmount < 0 ? '轉正' : '轉負'}
                                    </button>
                                  )}
                                </div>
                              )
                            })()}

                            {/* 取消 + 儲存 */}
                            <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <button onClick={() => setEditingReceiptId(null)}
                                className="flex items-center gap-1 text-xs"
                                style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit' }}>
                                <X className="h-3 w-3" />取消
                              </button>
                              <button onClick={handleSaveReceiptEdit} disabled={!(editAmount > 0 || (editAmount < 0 && editReceiptAllowsNegativeTotal(editCategory, editItems))) || editUploading}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white"
                                style={{
                                  background: (editAmount > 0 || (editAmount < 0 && editReceiptAllowsNegativeTotal(editCategory, editItems))) ? 'linear-gradient(135deg,#F59E0B,#F97316)' : '#d4d4d8',
                                  cursor: (editAmount > 0 || (editAmount < 0 && editReceiptAllowsNegativeTotal(editCategory, editItems))) ? 'pointer' : 'not-allowed',
                                  opacity: editUploading ? 0.7 : 1, border: 'none', fontFamily: 'inherit',
                                  boxShadow: (editAmount > 0 || (editAmount < 0 && editReceiptAllowsNegativeTotal(editCategory, editItems))) ? '0 4px 12px rgba(245,158,11,0.3)' : 'none',
                                }}>
                                {editUploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />儲存中…</> : '儲存'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={r.id} className="rounded-xl overflow-hidden"
                        style={{ border: `1px solid ${isCK ? '#fed7aa' : '#f4f4f5'}`, background: isCK ? '#fff7ed' : 'white' }}>
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          {r.photo_url ? (
                            <button onClick={() => setPhotoLightbox(r.photo_url!)}
                              className="h-12 w-12 rounded-lg overflow-hidden shrink-0 transition-opacity hover:opacity-80"
                              style={{ border: '1px solid #f4f4f5', padding: 0 }}>
                              <SafeImage src={r.photo_url} alt="receipt" className="w-full h-full object-cover" fallbackText="照片" />
                            </button>
                          ) : (
                            <div className="h-12 w-12 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: isCK ? '#ffedd5' : '#f4f4f5' }}>
                              <span className="text-xl">{isCK ? '🚚' : '🧾'}</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: '#18181b' }}>
                              {displayConfiguredOtherReceiptName(r.vendor_name, categories) || (r.receipt_items ?? []).filter(i => i.item_name.trim()).map(i => i.item_name).join('、') || '（未填廠商）'}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>
                              {isCK ? '央廚配送' : '現金支出'}
                              {r.actual_vendor_name ? ` · ${r.actual_vendor_name}` : ''}
                              {r.photo_url ? ' · 有照片' : ' · 無照片'}
                            </p>
                          </div>
                          <p className="text-sm font-bold tabular-nums shrink-0" style={{ color: '#18181b' }}>
                            ${fmt(r.total_amount)}
                          </p>
                          {!isLocked && (
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => {
                                const derivedCategory = deriveReceiptCategory(r.vendor_name, r.receipt_items, categories, mappingColumns)
                                const restoredItems = (r.receipt_items ?? []).filter(i => {
                                  const match = findReceiptItemMapping(i.item_name, r.vendor_name || '', derivedCategory, mappingColumns)
                                  return !match?.is_tax_addon
                                }).map(i => {
                                  const match = findReceiptItemMapping(i.item_name, r.vendor_name || '', derivedCategory, mappingColumns)
                                  return {
                                    id: crypto.randomUUID(),
                                    item_name: i.item_name,
                                    unit: i.unit ?? '',
                                    quantity: i.quantity ?? 1,
                                    unit_price: i.unit_price ?? 0,
                                    amount: i.amount,
                                    vendor_group_hint: match?.vendor_group,
                                  }
                                })
                                setEditingReceiptId(r.id)
                                setEditVendor(r.vendor_name || '')
                                setEditActualVendor(r.actual_vendor_name || '')
                                setEditAmount(r.tax_amount ? r.total_amount - r.tax_amount : r.total_amount)
                                setEditCategory(derivedCategory)
                                setEditHasTax(!!(r.tax_amount && r.tax_amount > 0))
                                setEditTaxAmount(r.tax_amount ?? 0)
                                setEditNotes(r.notes || '')
                                setEditPhotoFile(null)
                                setEditPhotoPreview(r.photo_url || null)
                                setEditItems(restoredItems)
                              }}
                                className="p-1.5 rounded-lg" style={{ background: '#f4f4f5', color: '#52525b' }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => handleDeleteReceipt(r.id)}
                                className="p-1.5 rounded-lg" style={{ background: '#ffe4e6', color: '#be123c' }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {totalExpenses !== 0 && (
                  <div className="mt-3">
                    <SummaryBlock label={`今日支出小計（${expenses.length} 筆）`} value={`$${fmt(totalExpenses)}`} />
                  </div>
                )}
              </SectionCard>
            )}

            {localReceipts.length === 0 && receiptForms.length === 0 && !isLocked && (
              <div className="text-center py-6 rounded-2xl" style={{ background: 'white', border: '1px solid #f4f4f5' }}>
                <Camera className="h-8 w-8 mx-auto mb-2" style={{ color: '#a1a1aa' }} />
                <p className="text-sm" style={{ color: '#52525b' }}>尚未上傳任何收據</p>
                <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>點上方「上傳照片」或「無照片新增」</p>
              </div>
            )}

          </>
        )}

        {/* ── STEP 2: 央廚配送 ─────────────────────────────────────────── */}
        {(stepId === 'ck_delivery' || (isLocked && !submitDone)) && (
          <>
            {!isLocked && <GradientTitle step={stepNum} total={totalSteps} title="央廚配送"
              desc="填寫今日各品項配送數量；只要有配送數量，就必須上傳配送單照片供總公司核對。" />}

            {/* 配送單照片用大圖展示，不固定在畫面上，避免影響下面品項輸入。 */}
            {!isLocked && (
              <>
                <div ref={ckPhotoSectionRef} className="ck-photo-pinned">
                  <div className="mx-auto w-full max-w-xl pointer-events-auto">
                    {(ckPhotoPreview || ckPhotoUrl) ? (
                      <StickyPhotoCard
                        src={(ckPhotoPreview || ckPhotoUrl)!}
                        alt="配送單"
                        onLightbox={() => setPhotoLightbox((ckPhotoPreview || ckPhotoUrl)!)}
                        onReupload={() => ckPhotoInputRef.current?.click()}
                        onDelete={handleClearCkPhoto}
                      />
                    ) : (
                      <button onClick={() => ckPhotoInputRef.current?.click()}
                        className="w-full rounded-3xl flex flex-col items-center justify-center gap-2 py-10"
                        style={{ border: '2px dashed #fed7aa', background: '#fff7ed', color: '#f97316' }}>
                        <Camera className="h-9 w-9" />
                        <p className="text-base font-semibold">請上傳當日配送單照片</p>
                        <p className="text-xs" style={{ color: '#fdba74' }}>
                          {hasCkDeliveryQuantity ? '已有配送數量，照片為必填' : '沒有配送數量，可不需上傳照片'}
                        </p>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
            {isLocked && ckPhotoUrl && (
              <>
                <div className="ck-photo-pinned">
                  <div className="mx-auto w-full max-w-xl pointer-events-auto">
                    <StickyPhotoCard src={ckPhotoUrl} alt="配送單" onLightbox={() => setPhotoLightbox(ckPhotoUrl!)} />
                  </div>
                </div>
              </>
            )}

            {/* 品項數量輸入 */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid #f4f4f5' }}>
                <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: '#fff7ed' }}>
                  <Package className="h-4 w-4" style={{ color: '#f97316' }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: '#18181b' }}>配送品項</p>
                <p className="text-xs ml-auto" style={{ color: '#a1a1aa' }}>
                  {isBackfill ? '補做模式：雞肉單價可改' : '單價由總公司設定'}
                </p>
              </div>

              {ckPrices.map((p, idx) => {
                const qty = ckQuantities[p.id] || 0
                const effPrice = effectiveCKPrice(p)
                const subtotal = qty * effPrice
                // 只有雞肉品項在補做模式可以改單價（其他品項單價固定）
                const isPriceEditable = isBackfill && !isLocked && p.item_name.includes('雞肉')
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: idx !== ckPrices.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                    <span className="w-14 text-sm font-semibold shrink-0" style={{ color: '#18181b' }}>{p.item_name}</span>
                    {isLocked ? (
                      <span className="text-sm tabular-nums" style={{ color: qty > 0 ? '#18181b' : '#d4d4d8' }}>
                        {qty > 0 ? qty : '—'}
                      </span>
                    ) : (
                      <input
                        type="number" min="0" inputMode="numeric"
                        placeholder="0"
                        value={qty || ''}
                        ref={el => { if (el) ckQtyRefsMap.current.set(p.id, el); else ckQtyRefsMap.current.delete(p.id) }}
                        onChange={e => setCkQuantities(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const nextPrice = ckPrices[idx + 1]
                            if (nextPrice) ckQtyRefsMap.current.get(nextPrice.id)?.focus()
                          }
                        }}
                        style={{ width: '80px', height: '36px', padding: '0 10px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '15px', textAlign: 'center', outline: 'none', background: 'white', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit' }}
                        onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#f97316'}
                        onBlur={e => (e.target as HTMLInputElement).style.borderColor = '#e4e4e7'}
                      />
                    )}
                    <span className="text-xs shrink-0" style={{ color: '#a1a1aa' }}>{p.unit || '份'}</span>
                    <span className="text-xs shrink-0" style={{ color: '#d4d4d8' }}>×</span>
                    {isPriceEditable ? (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <span className="text-xs" style={{ color: '#71717a' }}>$</span>
                        <input
                          type="number" min="0" step="0.01"
                          placeholder=""
                          value={ckPriceOverrides[p.id] ?? ''}
                          onChange={e => {
                            const v = e.target.value
                            setCkPriceOverrides(prev => {
                              const next = { ...prev }
                              if (v === '' || v === null) delete next[p.id]
                              else next[p.id] = parseFloat(v) || 0
                              return next
                            })
                          }}
                          style={{ width: '64px', height: '28px', padding: '0 6px', border: '1.5px solid #fed7aa', borderRadius: '6px', fontSize: '12px', textAlign: 'right', outline: 'none', background: '#fffbeb', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit' }}
                          title={`預設 $${p.unit_price}（雞肉單價浮動，可填當天實際單價）`}
                        />
                      </div>
                    ) : (
                      <span className="text-xs tabular-nums shrink-0" style={{ color: '#71717a' }}>${effPrice}</span>
                    )}
                    <span className="ml-auto text-sm font-semibold tabular-nums shrink-0"
                      style={{ color: qty > 0 ? '#f97316' : '#d4d4d8' }}>
                      {qty > 0 ? `$${fmt(subtotal)}` : '—'}
                    </span>
                  </div>
                )
              })}

              {(() => {
                // 直接從目前 ckQuantities × unit_price 即時計算，避免 data.ck_total state 延遲或 race
                const liveCkTotal = ckPrices.reduce((s, p) => s + (ckQuantities[p.id] || 0) * effectiveCKPrice(p), 0)
                return (
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid #f4f4f5', background: '#fafafa' }}>
                    <span className="text-sm font-bold" style={{ color: '#18181b' }}>配送總計</span>
                    <span className="text-xl font-bold tabular-nums" style={{ color: liveCkTotal > 0 ? '#f97316' : '#d4d4d8' }}>
                      {liveCkTotal > 0 ? `$${fmt(liveCkTotal)}` : '$0'}
                    </span>
                  </div>
                )
              })()}
            </div>
          </>
        )}

        {/* ── STEP 3: 手寫菜單 ─────────────────────────────────────────── */}
        {(stepId === 'handwrite' || (isLocked && !submitDone)) && store.mode !== 'ichef' && (
          <>
            {!isLocked && <GradientTitle step={stepNum} total={totalSteps} title="手寫菜單訂單"
              desc="每筆訂單輸入單號與金額，作廢訂單請標記原因。iChef 店可跳過此步。" />}

            <SectionCard icon={<Banknote className="h-4 w-4" />} title="手寫訂單" subtitle="金額為 0 的單號不計入合計" iconColor="#10b981">
              {!isLocked && (
                <div className="mb-3 p-3 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #f4f4f5' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#52525b' }}>批量建立單號範圍</p>
                  <div className="flex gap-2 items-center mb-1.5">
                    <input type="number" min="1" inputMode="numeric" placeholder="起始"
                      style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', background: 'white', outline: 'none', width: '88px', textAlign: 'center' }}
                      value={rangeStart || ''} onChange={e => setRangeStart(parseInt(e.target.value) || 0)} />
                    <span style={{ color: '#a1a1aa' }}>—</span>
                    <input type="number" min="1" inputMode="numeric" placeholder="結束"
                      style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', background: 'white', outline: 'none', width: '88px', textAlign: 'center' }}
                      value={rangeEnd || ''} onChange={e => setRangeEnd(parseInt(e.target.value) || 0)} />
                    <button type="button" onClick={generateRange}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-white shrink-0"
                      style={{ background: 'linear-gradient(135deg,#18181b,#3f3f46)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                      <Plus className="h-3.5 w-3.5" /> 建立
                    </button>
                  </div>
                  <p className="text-[10px]" style={{ color: '#a1a1aa' }}>已存在的單號不重複建立 · 單次最多 {MAX_HANDWRITE_BATCH} 筆</p>
                  {handwriteOrders.length > 0 && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid #e4e4e7' }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: '#52525b' }}>批次更換已建立的單號</p>
                      <div className="flex flex-wrap gap-2 items-center">
                        <input type="number" min="1" inputMode="numeric" placeholder="原起始"
                          aria-label="原單號起始"
                          style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '13px', background: 'white', outline: 'none', width: '88px', textAlign: 'center' }}
                          value={replaceRangeStart || ''} onChange={e => setReplaceRangeStart(parseInt(e.target.value) || 0)} />
                        <span style={{ color: '#a1a1aa' }}>—</span>
                        <input type="number" min="1" inputMode="numeric" placeholder="原結束"
                          aria-label="原單號結束"
                          style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '13px', background: 'white', outline: 'none', width: '88px', textAlign: 'center' }}
                          value={replaceRangeEnd || ''} onChange={e => setReplaceRangeEnd(parseInt(e.target.value) || 0)} />
                        <span className="font-semibold" style={{ color: '#a1a1aa' }}>→</span>
                        <input type="number" min="1" inputMode="numeric" placeholder="新起始"
                          aria-label="新單號起始"
                          style={{ padding: '8px 10px', border: '1.5px solid #F59E0B', borderRadius: '10px', fontSize: '13px', background: 'white', outline: 'none', width: '88px', textAlign: 'center' }}
                          value={replaceRangeNewStart || ''} onChange={e => setReplaceRangeNewStart(parseInt(e.target.value) || 0)} />
                        <span style={{ color: '#a1a1aa' }}>—</span>
                        <input type="number" min="1" inputMode="numeric" placeholder="新結束"
                          aria-label="新單號結束"
                          style={{ padding: '8px 10px', border: '1.5px solid #F59E0B', borderRadius: '10px', fontSize: '13px', background: 'white', outline: 'none', width: '88px', textAlign: 'center' }}
                          value={replaceRangeNewEnd || ''} onChange={e => setReplaceRangeNewEnd(parseInt(e.target.value) || 0)} />
                        <button type="button" onClick={replaceHandwriteOrderRange}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold shrink-0"
                          style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                          <Pencil className="h-3.5 w-3.5" /> 更換
                        </button>
                      </div>
                      <p className="text-[10px] mt-1.5" style={{ color: '#a1a1aa' }}>例如：1000–1005 → 2000–2005；金額與作廢狀態會保留</p>
                    </div>
                  )}
                </div>
              )}
              {handwriteOrders.length > 0 && (
                <div className="rounded-xl overflow-hidden mb-3" style={{ border: '1px solid #f4f4f5' }}>
                  <div className="flex items-center gap-2 px-3 py-1.5 sticky top-0 z-10" style={{ background: '#f8fafc', borderBottom: '1px solid #f4f4f5' }}>
                    <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>
                      單號 <span className="ml-1 normal-case" style={{ color: '#71717a' }}>（{handwriteOrders.length} 筆）</span>
                    </span>
                    {!isLocked && <button type="button" onClick={clearHandwriteOrders}
                      className="mr-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold"
                      style={{ color: '#be123c', background: '#fff1f2', border: '1px solid #fecdd3' }}>
                      <Trash2 className="h-3 w-3" /> 全部刪除
                    </button>}
                    <span className="w-20 text-right text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>金額</span>
                    {!isLocked && <span className="w-8" />}
                    {!isLocked && <span className="w-5" />}
                  </div>
                  <div style={{ maxHeight: handwriteOrders.length > 8 ? 400 : 'none', overflowY: handwriteOrders.length > 8 ? 'auto' : 'visible' }}>
                  {handwriteOrders.map((o, idx) => (
                    <div key={o.id} style={{ background: o.voided ? '#fff8f8' : 'white', borderBottom: idx !== handwriteOrders.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                      <div className="flex items-center gap-2 px-3 py-1">
                        <span className="flex-1 text-sm min-w-0 truncate"
                          style={{ fontFamily: 'monospace', color: o.voided ? '#a1a1aa' : '#52525b', textDecoration: o.voided ? 'line-through' : 'none' }}>
                          {o.order_number}
                        </span>
                        {isLocked ? (
                          o.voided
                            ? <span className="w-20 text-right text-xs font-semibold" style={{ color: '#be123c' }}>作廢</span>
                            : <span className="w-20 text-right text-sm tabular-nums font-semibold" style={{ color: o.amount === 0 ? '#d4d4d8' : '#18181b' }}>${fmt(o.amount)}</span>
                        ) : (
                          <input type="number" min="0" inputMode="numeric"
                            style={{ width: '80px', padding: '6px 8px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', textAlign: 'right', outline: 'none', background: o.voided ? '#f4f4f5' : 'white', opacity: o.voided ? 0.4 : 1, fontVariantNumeric: 'tabular-nums' }}
                            value={o.voided ? '' : (o.amount || '')} placeholder="0" disabled={o.voided}
                            ref={el => { if (el) amtRefsMap.current.set(o.id, el); else amtRefsMap.current.delete(o.id) }}
                            onChange={e => updateHandwriteOrderAmount(o.id, parseInt(e.target.value) || 0)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const next = handwriteOrders[idx + 1]; if (next) amtRefsMap.current.get(next.id)?.focus(); else newOrderNumRef.current?.focus() } }}
                          />
                        )}
                        {!isLocked && (
                          <button type="button" onClick={() => toggleVoidOrder(o.id)}
                            className="shrink-0 h-7 w-8 text-[10px] rounded-lg font-semibold"
                            style={{ background: o.voided ? '#ffe4e6' : 'white', color: o.voided ? '#be123c' : '#a1a1aa', border: `1px solid ${o.voided ? '#fda4af' : '#e4e4e7'}` }}>
                            廢
                          </button>
                        )}
                        {!isLocked && (
                          <button type="button" onClick={() => removeHandwriteOrder(o.id)} className="shrink-0" style={{ color: '#d4d4d8' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#be123c')} onMouseLeave={e => (e.currentTarget.style.color = '#d4d4d8')}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {o.voided && (
                        <div className="px-3 pb-2">
                          {isLocked
                            ? <p className="text-xs" style={{ color: '#a1a1aa' }}>{o.void_reason || '未填原因'}</p>
                            : <input placeholder="作廢原因（選填）"
                                style={{ padding: '6px 10px', border: '1.5px solid #fda4af', borderRadius: '8px', fontSize: '12px', background: 'white', outline: 'none', fontFamily: 'inherit', width: '100%' }}
                                value={o.void_reason} onChange={e => updateVoidReason(o.id, e.target.value)} />}
                        </div>
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              )}
              {!isLocked && (
                <div className="flex gap-2 items-end mb-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>手動新增</label>
                    <input ref={newOrderNumRef} type="text" placeholder="單號"
                      style={{ padding: '10px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', background: 'white', outline: 'none', fontFamily: 'monospace', width: '100%' }}
                      value={newOrderNum} onChange={e => setNewOrderNum(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); newOrderAmtRef.current?.focus() } }} />
                  </div>
                  <div style={{ width: '110px' }}>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'transparent' }}>_</label>
                    <input ref={newOrderAmtRef} type="number" min="0" inputMode="numeric" placeholder="金額"
                      style={{ padding: '10px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', background: 'white', outline: 'none', fontFamily: 'inherit', width: '100%', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      value={newOrderAmt || ''} onChange={e => setNewOrderAmt(parseInt(e.target.value) || 0)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHandwriteOrder() } }} />
                  </div>
                  <button type="button" onClick={addHandwriteOrder}
                    className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-sm font-semibold shrink-0"
                    style={{ background: '#f0fdf4', color: '#047857', border: '1px solid #a7f3d0' }}>
                    <Plus className="h-3.5 w-3.5" /> 新增
                  </button>
                </div>
              )}
              {handwriteOrders.filter(o => o.amount > 0).length > 0
                ? <SummaryBlock label={`手寫訂單合計（${handwriteOrders.filter(o => o.amount > 0).length} 筆有效）`} value={`$${fmt(handwriteTotal)}`} />
                : handwriteOrders.length === 0 && !isLocked
                  ? <p className="text-xs text-center py-2" style={{ color: '#a1a1aa' }}>請使用批量建立或手動新增訂單</p>
                  : null}
            </SectionCard>

          </>
        )}

        {/* ── STEP 3: 營業額 ───────────────────────────────────────────── */}
        {(stepId === 'revenue' || (isLocked && !submitDone)) && (
          <>
            {!isLocked && <GradientTitle step={stepNum} total={totalSteps} title="各平台營業額"
              desc="輸入今日各通路的原始金額，並上傳平台統計畫面照片。" />}

            <div className="space-y-3">
              {/* iChef POS */}
              {store.mode !== 'handwrite' && (() => {
                const key = 'pos'
                const photo = channelPhotos[key]
                return (
                  <PlatformRow
                    channelKey={key}
                    name={store.ichef_uber_linked ? 'iChef 結帳總金額' : 'iChef 現場 POS'}
                    hint={store.ichef_uber_linked ? '含外送平台（iChef 同步）' : '現場 POS 現金'}
                    value={data.pos_cash}
                    onChange={v => set('pos_cash', v)}
                    disabled={isLocked}
                    photo={photo}
                    onPhotoClick={() => openChannelUpload(key, data.pos_cash)}

                    onViewPhoto={() => photo?.previewUrl && setPhotoLightbox(photo.previewUrl)}
                    onClearPhoto={() => setChannelPhotos(prev => { const n = { ...prev }; delete n[key]; return n })}
                  />
                )
              })()}

              {/* iChef linked hint */}
              {store.ichef_uber_linked && !isLocked && (
                <p className="text-xs px-1" style={{ color: '#a1a1aa' }}>↓ 各外送平台金額（用於計算扣除，不重複計入總收）</p>
              )}

              {/* Uber accounts */}
              {(store.uber_accounts ?? []).map(acc => {
                const key = `uber_${acc}`
                const photo = channelPhotos[key]
                return (
                  <PlatformRow
                    key={acc}
                    channelKey={key}
                    name={`Uber Eats${(store.uber_accounts ?? []).length > 1 ? ` — ${acc}` : ''}`}
                    hint="原始金額 · 拍 Uber 平板統計畫面"
                    value={data.uber_amounts[acc] ?? 0}
                    onChange={v => set('uber_amounts', { ...data.uber_amounts, [acc]: v })}
                    disabled={isLocked}
                    photo={photo}
                    onPhotoClick={() => openChannelUpload(key, data.uber_amounts[acc] ?? 0)}

                    onViewPhoto={() => photo?.previewUrl && setPhotoLightbox(photo.previewUrl)}
                    onClearPhoto={() => setChannelPhotos(prev => { const n = { ...prev }; delete n[key]; return n })}
                  />
                )
              })}

              {/* Panda */}
              {store.panda_enabled && (() => {
                const key = 'panda'
                const photo = channelPhotos[key]
                return (
                  <PlatformRow
                    channelKey={key}
                    name="熊貓 foodpanda"
                    hint="原始金額 · 拍熊貓後台統計"
                    value={data.panda_amount}
                    onChange={v => set('panda_amount', v)}
                    disabled={isLocked}
                    photo={photo}
                    onPhotoClick={() => openChannelUpload(key, data.panda_amount)}

                    onViewPhoto={() => photo?.previewUrl && setPhotoLightbox(photo.previewUrl)}
                    onClearPhoto={() => setChannelPhotos(prev => { const n = { ...prev }; delete n[key]; return n })}
                  />
                )
              })()}

              {/* TW Pay */}
              {store.twpay_enabled && (() => {
                const key = 'twpay'
                const photo = channelPhotos[key]
                return (
                  <PlatformRow
                    channelKey={key}
                    name="台灣 Pay"
                    hint="行動支付"
                    value={data.twpay_amount}
                    onChange={v => set('twpay_amount', v)}
                    disabled={isLocked}
                    photo={photo}
                    onPhotoClick={() => openChannelUpload(key, data.twpay_amount)}

                    onViewPhoto={() => photo?.previewUrl && setPhotoLightbox(photo.previewUrl)}
                    onClearPhoto={() => setChannelPhotos(prev => { const n = { ...prev }; delete n[key]; return n })}
                  />
                )
              })()}

              {/* Online order */}
              {store.online_enabled && (() => {
                const key = 'online'
                const photo = channelPhotos[key]
                return (
                  <PlatformRow
                    channelKey={key}
                    name="線上點餐"
                    hint="線上訂單平台"
                    value={data.online_amount}
                    onChange={v => set('online_amount', v)}
                    disabled={isLocked}
                    photo={photo}
                    onPhotoClick={() => openChannelUpload(key, data.online_amount)}

                    onViewPhoto={() => photo?.previewUrl && setPhotoLightbox(photo.previewUrl)}
                    onClearPhoto={() => setChannelPhotos(prev => { const n = { ...prev }; delete n[key]; return n })}
                  />
                )
              })()}

              {/* Online order (cash portion) — negative amount, 共用上方 線上點餐 的照片 */}
              {store.online_cash_enabled && (
                <PlatformRow
                  channelKey="online_cash"
                  name="線上點餐（現金）"
                  hint="輸入正數即可（系統會自動轉負）"
                  /* 顯示時取絕對值，使用者輸入正數，存進 state 時自動轉負 */
                  value={Math.abs(data.online_cash_amount || 0)}
                  onChange={v => set('online_cash_amount', -Math.abs(v))}
                  disabled={isLocked}
                  hidePhoto
                />
              )}

              {/* Handwrite subtotal summary row */}
              {store.mode !== 'ichef' && handwriteTotal > 0 && (
                <div className="flex justify-between items-center px-4 py-3 rounded-2xl" style={{ background: 'white', border: '1px solid #f4f4f5' }}>
                  <span className="text-sm font-semibold" style={{ color: '#52525b' }}>手寫訂單合計</span>
                  <span className="text-lg font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(handwriteTotal)}</span>
                </div>
              )}
            </div>

            <SummaryBlock label="今日總營業額" value={`$${fmt(s.totalRevenue)}`} />
            {store.ichef_uber_linked && s.platformTotal > 0 && (
              <div className="flex justify-between items-center mt-2 text-xs px-1">
                <span style={{ color: '#a1a1aa' }}>店舖現金（iChef − 平台）</span>
                <span className="tabular-nums font-semibold" style={{ color: '#52525b' }}>${fmt(s.storeRevenue)}</span>
              </div>
            )}
          </>
        )}

        {/* ── STEP 4: 現金清點 ─────────────────────────────────────────── */}
        {(stepId === 'cash' || (isLocked && !submitDone)) && (
          <>
            {!isLocked && <GradientTitle step={stepNum} total={totalSteps} title="現金清點"
              desc="輸入各幣值張數；如有今天實際支付的大額支出，請在下方登記。" />}

            <SectionCard icon={<Calculator className="h-4 w-4" />} title="現金清點" iconColor="#10b981">
              <div className="space-y-2.5">
                <div style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 1fr 3.5rem', gap: '0 8px' }}>
                  <span />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-center" style={{ color: '#a1a1aa' }}>張 / 枚</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-center" style={{ color: '#a1a1aa' }}>整筆金額</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-right" style={{ color: '#a1a1aa' }}>小計</span>
                </div>
                {DENOMINATIONS.map(({ label, countKey, lumpKey, unit, unitLabel }, rowIdx) => {
                  const countVal = data[countKey] as number
                  const lumpVal = data[lumpKey] as number
                  const subtotal = countVal * unit + lumpVal
                  return (
                    <div key={countKey} style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 1fr 3.5rem', gap: '0 8px', alignItems: 'center' }}>
                      <span className="text-xs shrink-0" style={{ color: '#52525b' }}>{label}</span>
                      <div className="flex items-center gap-1">
                        <SInput value={countVal} onChange={v => set(countKey, parseInt(String(v)) || 0)} disabled={isLocked}
                          inputRef={el => { cashCountRefs.current[rowIdx] = el }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const n = cashCountRefs.current[rowIdx + 1]; if (n) { n.focus(); n.select() } } }} />
                        <span className="text-[10px] shrink-0" style={{ color: '#a1a1aa' }}>{unitLabel}</span>
                      </div>
                      <SInput value={lumpVal} onChange={v => set(lumpKey, parseInt(String(v)) || 0)} disabled={isLocked}
                        inputRef={el => { cashCountRefs.current[rowIdx + 7] = el }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const n = cashCountRefs.current[rowIdx + 8]; if (n) { n.focus(); n.select() } } }} />
                      <span className="text-right text-xs tabular-nums shrink-0"
                        style={{ color: subtotal > 0 ? '#18181b' : '#d4d4d8', fontWeight: subtotal > 0 ? 600 : 400 }}>
                        ${fmt(subtotal)}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 rounded-2xl p-3 space-y-3" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#9a3412' }}>大額支出</p>
                    <p className="text-[11px]" style={{ color: '#c2410c' }}>填寫實匯入預留款的大額支出金額</p>
                  </div>
                  {!isLocked && (
                    <button type="button" onClick={addLargeCashExpense}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                      style={{ background: 'white', border: '1px solid #fed7aa', color: '#c2410c', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Plus className="h-3.5 w-3.5" /> 新增
                    </button>
                  )}
                </div>
                {largeCashExpenses.length === 0 ? (
                  <p className="text-xs" style={{ color: '#a1a1aa' }}>沒有大額支出</p>
                ) : (
                  <div className="space-y-2">
                    {largeCashExpenses.map(item => (
                      <div key={item.id} className="space-y-1.5">
                        <div className="grid items-center gap-2" style={{ gridTemplateColumns: isLocked ? '1fr 7rem' : '1fr 7rem 2rem' }}>
                          <input
                            type="text"
                            value={item.description}
                            placeholder="項目，例如房租"
                            disabled={isLocked}
                            onChange={e => updateLargeCashExpense(item.id, 'description', e.target.value)}
                            style={{
                              padding: '10px 12px', border: '1.5px solid #fed7aa', borderRadius: '10px',
                              fontSize: '14px', background: isLocked ? '#fafafa' : 'white', outline: 'none',
                              fontFamily: 'inherit', width: '100%', color: '#18181b', opacity: isLocked ? 0.5 : 1,
                            }}
                          />
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: '#dc2626' }}>-</span>
                            <SInput value={item.amount} onChange={v => updateLargeCashExpense(item.id, 'amount', Math.abs(v || 0))} disabled={isLocked} />
                          </div>
                          {!isLocked && (
                            <button type="button" onClick={() => removeLargeCashExpense(item.id)}
                              className="h-10 w-8 rounded-lg inline-flex items-center justify-center"
                              style={{ border: '1px solid #fecaca', background: 'white', color: '#ef4444', cursor: 'pointer' }}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {s.largeExpenseTotal > 0 && (
                  <div className="flex justify-between text-sm font-semibold tabular-nums pt-2" style={{ borderTop: '1px solid #fed7aa', color: '#dc2626' }}>
                    <span>大額支出小計</span>
                    <span>-${fmt(s.largeExpenseTotal)}</span>
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-2xl p-3 space-y-2" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#1d4ed8' }}>顧客匯款收入</p>
                  <p className="text-[11px]" style={{ color: '#2563eb' }}>
                    顧客已轉帳、不是現金；這裡輸入正的收入金額，下一步會自動列入負的匯款調整。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold shrink-0" style={{ color: '#2563eb' }}>＋</span>
                  <SInput value={customerTransferAmount} onChange={updateCustomerTransferAmount} disabled={isLocked} placeholder="輸入轉帳金額" />
                </div>
                {customerTransferAmount > 0 && (
                  <p className="text-[11px]" style={{ color: '#1d4ed8' }}>
                    匯款調整已自動扣除 ${fmt(customerTransferAmount)}，調整後實匯入 ${fmt(s.finalRemit)}。
                  </p>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {s.largeExpenseTotal > 0 && <SummaryBlock label="現金清點小計" value={`$${fmt(s.cashSubtotal)}`} />}
                {s.largeExpenseTotal > 0 && <SummaryBlock label="今日現金實際扣除大額支出" value={`$${fmt(s.cashExpenseTotal)}`} />}
                <SummaryBlock label="現金總額" value={`$${fmt(s.cashTotal)}`} />
                <SummaryBlock label={`扣零用金（$${fmt(store.petty_cash)}）= 實匯入`} value={`$${fmt(s.actualRemit)}`} />
              </div>
            </SectionCard>
          </>
        )}

        {/* ── STEP 5: 確認結帳 ─────────────────────────────────────────── */}
        {(stepId === 'summary' || (isLocked && !submitDone)) && (
          <>
            {!isLocked && <GradientTitle step={stepNum} total={totalSteps} title="結帳確認"
              desc="確認所有金額無誤後，送出今日結帳。" />}

            {/* Summary card */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${varBorder}` }}>
              <div className="px-5 pt-4 pb-3 flex items-center gap-2" style={{ background: varBg, borderBottom: `1px solid ${varBorder}` }}>
                <BarChart3 className="h-4 w-4" style={{ color: varColor }} />
                <p className="text-sm font-semibold" style={{ color: '#18181b' }}>今日帳目總覽</p>
              </div>
              <div className="px-5 py-4">
                {[
                  { label: '總營業額', value: `$${fmt(s.totalRevenue)}`, bold: true },
                  { label: '− 平台收款（Uber / 熊貓等）', value: `−$${fmt(s.platformPaid)}`, muted: true },
                  ...(totalExpenses > 0
                    ? [{ label: '− 現金支出', value: `−$${fmt(totalExpenses)}`, muted: true }]
                    : totalExpenses < 0
                      ? [{ label: '+ 支出抵扣', value: `+$${fmt(Math.abs(totalExpenses))}`, muted: true }]
                      : []),
                ].map(r => (
                  <div key={r.label} className="flex justify-between items-center py-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
                    <span className="text-sm" style={{ color: r.muted ? '#a1a1aa' : '#52525b' }}>{r.label}</span>
                    <span className="text-base font-bold tabular-nums">{r.value}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center py-3 px-3 -mx-3 my-2 rounded-xl"
                  style={{ background: 'linear-gradient(135deg,#FFFBEB,#f5f3ff)' }}>
                  <span className="text-sm font-semibold" style={{ color: '#312e81' }}>應包進信封</span>
                  <span className="text-xl font-extrabold tabular-nums" style={{ color: '#92400E' }}>${fmt(s.shouldEnvelope)}</span>
                </div>
                <div className="pl-3 space-y-1.5 text-xs pb-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
                  <div className="flex justify-between">
                    <span style={{ color: '#a1a1aa' }}>其中央廚配送費</span>
                    <span className="tabular-nums" style={{ color: '#52525b' }}>${fmt(s.deliveryFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#a1a1aa' }}>應匯入 HQ（淨）</span>
                    <span className="tabular-nums" style={{ color: '#52525b' }}>${fmt(s.netToHQ)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center px-4 py-3 rounded-2xl mt-2"
                  style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)', border: '2px solid #92400E' }}>
                  <span className="text-sm font-bold" style={{ color: '#FDE68A' }}>今日實際匯入（調整／預留後）</span>
                  <span className="text-2xl font-extrabold tabular-nums" style={{ color: '#fff', letterSpacing: '-0.02em' }}>${fmt(s.remitToHQ)}</span>
                </div>
                {/* Envelope bag photo */}
                <div className="mt-3">
                  {(envelopePhotoPreview || envelopePhotoUrl) ? (
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setPhotoLightbox((envelopePhotoPreview || envelopePhotoUrl)!)}
                        className="relative shrink-0 rounded-xl overflow-hidden"
                        style={{ width: '56px', height: '56px', padding: 0, border: 'none', cursor: 'pointer' }}>
                        <SharedSafePhotoImage src={envelopePhotoPreview || envelopePhotoUrl} alt="信封袋" thumb width={160} height={160}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div className="absolute inset-0 flex items-center justify-center"
                          style={{ background: 'rgba(0,0,0,0.25)' }}>
                          <ZoomIn className="h-4 w-4" style={{ color: '#fff' }} />
                        </div>
                      </button>
                      <span className="flex-1 text-xs font-medium" style={{ color: '#52525b' }}>信封袋照片已上傳</span>
                      {!isLocked && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button type="button" onClick={() => envelopePhotoInputRef.current?.click()}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium"
                            style={{ background: '#f4f4f5', color: '#71717a', border: 'none', cursor: 'pointer' }}>重拍</button>
                          <button type="button" onClick={() => { setEnvelopePhotoUrl(undefined); setEnvelopePhotoPreview(undefined); localStorage.removeItem(envelopePhotoLsKey) }}
                            className="rounded-full flex items-center justify-center"
                            style={{ background: '#fee2e2', width: '28px', height: '28px', border: 'none', cursor: 'pointer' }}>
                            <X className="h-3.5 w-3.5" style={{ color: '#dc2626' }} />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button type="button" disabled={isLocked}
                      onClick={() => envelopePhotoInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium"
                      style={{
                        background: requiresEnvelopePhoto ? '#FEF2F2' : '#fafafa',
                        color: requiresEnvelopePhoto ? '#dc2626' : '#a1a1aa',
                        border: `1.5px dashed ${requiresEnvelopePhoto ? '#fca5a5' : '#d4d4d8'}`,
                        cursor: isLocked ? 'default' : 'pointer',
                      }}>
                      <Camera className="h-4 w-4" />
                      {requiresEnvelopePhoto ? '請上傳信封袋照片（必填）' : '今日無實匯入，不需上傳信封袋照片'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Variance block */}
            <div className="rounded-2xl px-5 py-6 text-center" style={{ background: varBg, border: `1.5px solid ${varBorder}` }}>
              <p className="text-xs font-semibold mb-2" style={{ color: varColor }}>今日帳目誤差</p>
              <p className="font-extrabold tabular-nums tracking-tight" style={{ fontSize: '52px', lineHeight: 1, color: varColor }}>
                {s.variance >= 0 ? '+' : ''}{fmt(s.variance)}
              </p>
              <p className="text-sm mt-2" style={{ color: varColor }}>{varMsg}</p>
              {s.adjustmentTotal !== 0 && (
                <p className="text-xs mt-3 px-4 py-2 rounded-xl inline-block" style={{ background: 'rgba(0,0,0,0.07)', color: varColor }}>
                  調整後實匯入：${fmt(s.finalRemit)}（含匯款調整 {s.adjustmentTotal >= 0 ? '+' : ''}{fmt(s.adjustmentTotal)}）
                </p>
              )}
            </div>

            {/* 匯款調整 */}
            {(() => {
              const ADJ_TYPES: Record<RemittanceAdjustment['type'], { label: string; color: string; sign: string }> = {
                advance:           { label: '代墊補款', color: '#059669', sign: '+' },
                reimburse:         { label: '代墊還款', color: '#d97706', sign: '−' },
                customer_transfer: { label: '顧客轉帳', color: '#2563eb', sign: '−' },
                carryover:         { label: '昨日結轉', color: '#7c3aed', sign: '−' },
                other:             { label: '其他',     color: '#71717a', sign: '±' },
              }
              return (
                <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: '#FFFBEB' }}>
                          <Wallet className="h-4 w-4" style={{ color: '#F59E0B' }} />
                        </div>
                        <p className="text-sm font-semibold" style={{ color: '#18181b' }}>匯款調整</p>
                      </div>
                      {!isLocked && (
                        <button type="button" onClick={() => { setShowAdjForm(v => !v); setAdjForm({ type: 'advance', label: '', amount: 0, person: '' }) }}
                          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg"
                          style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                          <Plus className="h-3.5 w-3.5" />新增調整
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {adjustments.length === 0 && !showAdjForm && (
                      <p className="text-xs text-center py-2" style={{ color: '#a1a1aa' }}>尚無調整項目</p>
                    )}
                    {adjustments.map(adj => {
                      const meta = ADJ_TYPES[adj.type]
                      return (
                        <div key={adj.id} className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md shrink-0" style={{ background: meta.color + '18', color: meta.color }}>{meta.label}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: '#18181b' }}>{adj.label || meta.label}</p>
                              {adj.person && <p className="text-xs" style={{ color: '#a1a1aa' }}>{adj.person}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-base font-bold tabular-nums" style={{ color: adj.amount >= 0 ? '#059669' : '#dc2626' }}>
                              {adj.amount >= 0 ? '+' : ''}{fmt(adj.amount)}
                            </span>
                            {!isLocked && (
                              <button type="button" onClick={() => setAdjustments(prev => prev.filter(a => a.id !== adj.id))}
                                style={{ color: '#d4d4d8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#be123c')} onMouseLeave={e => (e.currentTarget.style.color = '#d4d4d8')}>
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {!isLocked && showAdjForm && (
                      <div className="rounded-xl p-3 space-y-3" style={{ background: '#f8f9ff', border: '1.5px solid #FDE68A' }}>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold mb-1" style={{ color: '#52525b' }}>類型</label>
                            <select value={adjForm.type} onChange={e => setAdjForm(prev => ({ ...prev, type: e.target.value as RemittanceAdjustment['type'] }))}
                              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', background: 'white', outline: 'none', fontFamily: 'inherit', color: '#18181b' }}>
                              <option value="advance">代墊補款 (+)</option>
                              <option value="reimburse">代墊還款 (−)</option>
                              <option value="customer_transfer">顧客轉帳 (−)</option>
                              <option value="carryover">昨日結轉 (−)</option>
                              <option value="other">其他</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold mb-1" style={{ color: '#52525b' }}>金額</label>
                            <input type="number" inputMode="numeric"
                              value={adjForm.amount || ''}
                              placeholder="輸入金額"
                              onChange={e => setAdjForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', background: 'white', outline: 'none', fontFamily: 'inherit', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#18181b' }} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold mb-1" style={{ color: '#52525b' }}>說明（選填）</label>
                          <input type="text" value={adjForm.label} placeholder="如：王經理代墊" onChange={e => setAdjForm(prev => ({ ...prev, label: e.target.value }))}
                            style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', background: 'white', outline: 'none', fontFamily: 'inherit', color: '#18181b' }} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold mb-1" style={{ color: '#52525b' }}>人員（選填）</label>
                          <input type="text" value={adjForm.person ?? ''} placeholder="如：王大明" onChange={e => setAdjForm(prev => ({ ...prev, person: e.target.value }))}
                            style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', background: 'white', outline: 'none', fontFamily: 'inherit', color: '#18181b' }} />
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => {
                            const signedAmount = adjForm.type === 'advance' ? Math.abs(adjForm.amount) : -Math.abs(adjForm.amount)
                            if (adjForm.amount === 0) { toast.error('請輸入金額'); return }
                            setAdjustments(prev => [...prev, { ...adjForm, id: crypto.randomUUID(), amount: adjForm.type === 'other' ? adjForm.amount : signedAmount }])
                            setShowAdjForm(false)
                            setAdjForm({ type: 'advance', label: '', amount: 0, person: '' })
                          }}
                            className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ background: '#92400E', color: 'white', border: 'none', cursor: 'pointer' }}>
                            儲存
                          </button>
                          <button type="button" onClick={() => { setShowAdjForm(false); setAdjForm({ type: 'advance', label: '', amount: 0, person: '' }) }}
                            className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: '#f4f4f5', color: '#71717a', border: 'none', cursor: 'pointer' }}>
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                    {adjustments.length > 0 && (
                      <div className="mt-1 pt-2" style={{ borderTop: '1px solid #f4f4f5' }}>
                        <div className="flex justify-between text-sm font-semibold" style={{ color: '#18181b' }}>
                          <span>調整後實匯入</span>
                          <span className="tabular-nums">${fmt(s.finalRemit)}</span>
                        </div>
                        <p className="text-[10px] mt-1" style={{ color: '#a1a1aa' }}>帳目誤差 {s.variance >= 0 ? '+' : ''}{fmt(s.variance)} 元，與匯款調整無關</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* 預留款 */}
            {(() => {
              const RESERVE_REASONS = ['電費', '房租', '營業稅', '其他']
              return (
                <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: '#fff7ed' }}>
                          <PiggyBank className="h-4 w-4" style={{ color: '#ea580c' }} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: '#18181b' }}>預留款</p>
                          <p className="text-xs" style={{ color: '#a1a1aa' }}>電費／房租等大筆費用，從當日匯款中預留</p>
                        </div>
                      </div>
                      {!isLocked && (
                        <button type="button" onClick={() => { setShowReserveForm(v => !v); setReserveForm({ reason: '電費', amount: 0, total_bill: 0 }) }}
                          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg"
                          style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa' }}>
                          <Plus className="h-3.5 w-3.5" />新增預留
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {reserves.length === 0 && !showReserveForm && (
                      <p className="text-xs text-center py-2" style={{ color: '#a1a1aa' }}>尚無預留款項</p>
                    )}
                    {reserves.map(r => {
                      const accumulatedTotal = (r.accumulated_before ?? 0) + r.amount
                      const remaining = r.total_bill && r.total_bill > accumulatedTotal ? r.total_bill - accumulatedTotal : null
                      return (
                        <div key={r.id} className="py-2 px-3 rounded-xl" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-md shrink-0" style={{ background: '#fff7ed', color: '#ea580c' }}>{r.reason}</span>
                              {r.auto_reserved && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0" style={{ background: '#d1fae5', color: '#047857' }}>自動帶入</span>
                              )}
                              {r.total_bill ? (
                                <span className="text-xs tabular-nums" style={{ color: '#a1a1aa' }}>帳單 ${fmt(r.total_bill)}</span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-base font-bold tabular-nums" style={{ color: '#ea580c' }}>
                                −{fmt(r.amount)}
                              </span>
                              {!isLocked && (
                                <button type="button" onClick={() => setReserves(prev => prev.filter(x => x.id !== r.id))}
                                  style={{ color: '#d4d4d8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                  onMouseEnter={e => (e.currentTarget.style.color = '#be123c')} onMouseLeave={e => (e.currentTarget.style.color = '#d4d4d8')}>
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                          {remaining !== null && (
                            <p className="text-xs mt-1 tabular-nums" style={{ color: '#be123c' }}>
                              {r.accumulated_before ? `累計已預留 $${fmt(accumulatedTotal)}，` : ''}尚差 ${fmt(remaining)}，明日繼續預留
                            </p>
                          )}
                          {r.total_bill && remaining === null && (
                            <p className="text-xs mt-1" style={{ color: '#047857' }}>
                              ✓ 今日已完成預留（不代表已付款）
                            </p>
                          )}
                        </div>
                      )
                    })}
                    {!isLocked && showReserveForm && (
                      <div className="rounded-xl p-3 space-y-3" style={{ background: '#fff7ed', border: '1.5px solid #fed7aa' }}>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold mb-1" style={{ color: '#52525b' }}>原因</label>
                            <select value={reserveForm.reason} onChange={e => {
                              const reason = e.target.value
                              setReserveForm(prev => {
                                const totalBill = prev.total_bill ?? 0
                                const shouldAutoAmount = reason === '房租' && (prev.amount ?? 0) <= 0 && totalBill > 0
                                return {
                                  ...prev,
                                  reason,
                                  amount: shouldAutoAmount ? Math.min(Math.max(0, Math.round(s.finalRemit)), totalBill) : prev.amount,
                                }
                              })
                            }}
                              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', background: 'white', outline: 'none', fontFamily: 'inherit', color: '#18181b' }}>
                              {RESERVE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold mb-1" style={{ color: '#52525b' }}>今日預留金額</label>
                            <input type="number" inputMode="numeric"
                              value={reserveForm.amount || ''}
                              placeholder="輸入金額"
                              onChange={e => setReserveForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', background: 'white', outline: 'none', fontFamily: 'inherit', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#18181b' }} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold mb-1" style={{ color: '#52525b' }}>
                            帳單總金額（選填）
                            <span className="ml-1 font-normal" style={{ color: '#a1a1aa' }}>— 填寫後系統會提醒明日尚差金額</span>
                          </label>
                          <input type="number" inputMode="numeric"
                            value={reserveForm.total_bill || ''}
                            placeholder="如：39891"
                            onChange={e => {
                              const totalBill = parseFloat(e.target.value) || 0
                              setReserveForm(prev => {
                                const shouldAutoAmount = prev.reason === '房租' && (prev.amount ?? 0) <= 0 && totalBill > 0
                                return {
                                  ...prev,
                                  total_bill: totalBill,
                                  amount: shouldAutoAmount ? Math.min(Math.max(0, Math.round(s.finalRemit)), totalBill) : prev.amount,
                                }
                              })
                            }}
                            style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', background: 'white', outline: 'none', fontFamily: 'inherit', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#18181b' }} />
                        </div>
                        {(reserveForm.total_bill ?? 0) > 0 && reserveForm.amount > 0 && (reserveForm.total_bill ?? 0) > reserveForm.amount && (
                          <p className="text-xs px-2 py-1.5 rounded-lg" style={{ background: '#ffe4e6', color: '#be123c' }}>
                            今日預留 ${fmt(reserveForm.amount)}，明日尚差 ${fmt((reserveForm.total_bill ?? 0) - reserveForm.amount)}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button type="button" onClick={() => {
                            if (reserveForm.amount <= 0) { toast.error('請輸入預留金額'); return }
                            const item: ReserveItem = {
                              ...reserveForm,
                              id: crypto.randomUUID(),
                              total_bill: reserveForm.total_bill || undefined,
                            }
                            setReserves(prev => [...prev, item])
                            setShowReserveForm(false)
                            setReserveForm({ reason: '電費', amount: 0, total_bill: 0 })
                          }}
                            className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ background: '#ea580c', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                            儲存
                          </button>
                          <button type="button" onClick={() => { setShowReserveForm(false); setReserveForm({ reason: '電費', amount: 0, total_bill: 0 }) }}
                            className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: '#f4f4f5', color: '#71717a', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                    {reserves.length > 0 && (
                      <div className="mt-1 pt-2" style={{ borderTop: '1px solid #f4f4f5' }}>
                        <div className="flex justify-between text-sm font-semibold" style={{ color: '#18181b' }}>
                          <span>今日實際匯入</span>
                          <span className="tabular-nums" style={{ color: s.remitToHQ < 0 ? '#dc2626' : '#18181b' }}>${fmt(s.remitToHQ)}</span>
                        </div>
                        <p className="text-[10px] mt-1" style={{ color: '#a1a1aa' }}>
                          實匯入 ${fmt(s.finalRemit)} 扣除預留款 ${fmt(s.totalReserved)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* 作廢發票照片 */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
              <div className="px-4 pt-3.5 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid #f4f4f5' }}>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: '#FEF2F2' }}>
                    <FileText className="h-4 w-4" style={{ color: '#dc2626' }} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: '#18181b' }}>作廢發票</p>
                  {voidInvoicePhotos.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#FEF2F2', color: '#dc2626' }}>
                      {voidInvoicePhotos.length} 張
                    </span>
                  )}
                </div>
                {!isLocked && (
                  <button type="button" onClick={() => voidInvoiceInputRef.current?.click()}
                    disabled={voidInvoiceUploading}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: '#FEF2F2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer' }}>
                    {voidInvoiceUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    新增照片
                  </button>
                )}
              </div>
              {voidInvoicePhotos.length === 0 ? (
                <p className="px-4 py-3 text-xs" style={{ color: '#a1a1aa' }}>無作廢發票</p>
              ) : (
                <div className="px-4 py-3 grid grid-cols-4 gap-2">
                  {voidInvoicePhotos.map((url, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden" style={{ height: '60px' }}>
                      <button type="button" onClick={() => setPhotoLightbox(url)}
                        style={{ display: 'block', width: '100%', height: '100%', padding: 0, border: 'none', cursor: 'pointer' }}>
                        <SharedSafePhotoImage src={url} alt={`作廢發票 ${i + 1}`} thumb width={160} height={160} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div className="absolute inset-0 flex items-center justify-center"
                          style={{ background: 'rgba(0,0,0,0.18)' }}>
                          <ZoomIn className="h-3.5 w-3.5" style={{ color: '#fff' }} />
                        </div>
                      </button>
                      {!isLocked && (
                        <button type="button" onClick={() => setVoidInvoicePhotos(prev => prev.filter((_, j) => j !== i))}
                          className="absolute top-0.5 right-0.5 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(0,0,0,0.55)', width: '18px', height: '18px' }}>
                          <X className="h-2.5 w-2.5" style={{ color: '#fff' }} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 備註 */}
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: '#a1a1aa' }}>備註</label>
              <textarea disabled={isLocked}
                style={{ width: '100%', minHeight: '120px', padding: '12px', fontSize: '14px', border: '1.5px solid #e4e4e7', borderRadius: '12px', resize: 'none', outline: 'none', fontFamily: 'inherit', background: isLocked ? '#fafafa' : 'white', color: '#18181b' }}
                placeholder="如有異常情況請說明..."
                value={data.note} onChange={e => set('note', e.target.value)} />
              {/* Note photo */}
              {(notePhotoPreview || notePhotoUrl) ? (
                <div className="flex items-center gap-3 mt-2">
                  <button type="button" onClick={() => setPhotoLightbox((notePhotoPreview || notePhotoUrl)!)}
                    className="relative shrink-0 rounded-xl overflow-hidden"
                    style={{ width: '56px', height: '56px', padding: 0, border: 'none', cursor: 'pointer' }}>
                    <SharedSafePhotoImage src={notePhotoPreview || notePhotoUrl} alt="備註照片" thumb width={160} height={160}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.25)' }}>
                      <ZoomIn className="h-4 w-4" style={{ color: '#fff' }} />
                    </div>
                  </button>
                  <span className="flex-1 text-xs font-medium" style={{ color: '#52525b' }}>備註照片已上傳</span>
                  {!isLocked && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => notePhotoInputRef.current?.click()}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: '#f4f4f5', color: '#71717a', border: 'none', cursor: 'pointer' }}>重拍</button>
                      <button type="button" onClick={() => { setNotePhotoUrl(undefined); setNotePhotoPreview(undefined); localStorage.removeItem(notePhotoLsKey) }}
                        className="rounded-full flex items-center justify-center"
                        style={{ background: '#fee2e2', width: '28px', height: '28px', border: 'none', cursor: 'pointer' }}>
                        <X className="h-3.5 w-3.5" style={{ color: '#dc2626' }} />
                      </button>
                    </div>
                  )}
                </div>
              ) : !isLocked && (
                <button type="button" onClick={() => notePhotoInputRef.current?.click()}
                  className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium"
                  style={{ background: '#fafafa', color: '#a1a1aa', border: '1.5px dashed #d4d4d8', cursor: 'pointer' }}>
                  <Camera className="h-3.5 w-3.5" />上傳備註照片（選填）
                </button>
              )}
            </div>

            {isLocked && !submitDone && (
              <div className="rounded-2xl px-4 py-3.5 flex items-center gap-2.5"
                style={{ background: '#f8fafc', border: '1px solid #f4f4f5' }}>
                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: status === 'verified' ? '#10b981' : '#F59E0B' }} />
                <p className="text-sm" style={{ color: '#52525b' }}>
                  {status === 'verified' ? '此帳目已核准，如需修改請聯絡總公司' : '帳目已送出，等待總公司審核'}
                </p>
              </div>
            )}
          </>
        )}

        {/* ── STEP: AI 核對 ────────────────────────────────────────────── */}
        {stepId === 'ai_verify' && (() => {
          const confirmedCount = verifyItems.filter(v => v.confirmed).length
          const allConfirmed = verifyItems.length > 0 && confirmedCount === verifyItems.length
          const firstUnconfirmed = verifyItems.findIndex(v => !v.confirmed)
          const reviewItem = reviewIndex !== null ? verifyItems[reviewIndex] : null

          function startReview() {
            const idx = verifyItems.findIndex(v => !v.confirmed)
            setReviewIndex(idx >= 0 ? idx : 0)
          }

          function confirmCurrent() {
            if (reviewIndex === null) return
            const currentItem = verifyItems[reviewIndex]
            if (!currentItem) return
            try {
              const saved = JSON.parse(localStorage.getItem(verifyDoneLsKey) ?? '[]')
              const previous = Array.isArray(saved) ? saved.filter((v): v is string => typeof v === 'string') : []
              localStorage.setItem(verifyDoneLsKey, JSON.stringify(Array.from(new Set([...previous, getVerifySignature(currentItem)]))))
            } catch {}
            setVerifyItems(prev => prev.map((v, i) => i === reviewIndex ? { ...v, confirmed: true } : v))
            // advance to next unconfirmed
            const next = verifyItems.findIndex((v, i) => i > reviewIndex && !v.confirmed)
            if (next >= 0) {
              setReviewIndex(next)
            } else {
              const wrapped = verifyItems.findIndex((v, i) => i !== reviewIndex && !v.confirmed)
              setReviewIndex(wrapped >= 0 ? wrapped : null)
            }
          }

          return (
            <>
              <GradientTitle step={stepNum} total={totalSteps} title="照片核對"
                desc="逐一查看照片，確認金額正確後按下「已核對」。" />

              {/* 全螢幕核對 overlay */}
              {reviewIndex !== null && reviewItem && (
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 9998,
                  background: '#0a0a0a',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {/* 頂部列 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(0,0,0,0.6)', flexShrink: 0 }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontWeight: 500 }}>
                      {reviewIndex + 1} / {verifyItems.length}
                    </span>
                    <span style={{ color: 'white', fontSize: '14px', fontWeight: 600, flex: 1, textAlign: 'center', padding: '0 12px' }}>
                      {reviewItem.type === 'receipt' ? '單據' : reviewItem.type === 'ck' ? '央廚' : reviewItem.type === 'envelope' ? '信封袋' : reviewItem.type === 'void_invoice' ? '作廢發票' : reviewItem.type === 'note' ? '備註' : '平台'} · {reviewItem.label}
                    </span>
                    <button
                      onClick={() => setReviewIndex(null)}
                      style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <X style={{ width: '16px', height: '16px', color: 'white' }} />
                    </button>
                  </div>

                  {/* 照片區域 */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '8px' }}>
                    <SharedSafePhotoImage
                      src={reviewItem.photoUrl}
                      alt="receipt"
                      loading="eager"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px', display: 'block' }}
                    />
                  </div>

                  {/* 底部資訊 + 按鈕 */}
                  <div style={{ background: 'white', borderRadius: '24px 24px 0 0', padding: '20px 20px 32px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>
                          {reviewItem.type === 'receipt' ? '單據名稱' : reviewItem.type === 'ck' ? '配送單' : reviewItem.type === 'envelope' ? '信封袋' : reviewItem.type === 'void_invoice' ? '作廢發票' : reviewItem.type === 'note' ? '備註照片' : '平台名稱'}
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#18181b' }}>{reviewItem.label}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>
                          {reviewItem.type === 'envelope' ? '實際包進信封' : '輸入金額'}
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#92400E', fontVariantNumeric: 'tabular-nums' }}>
                          {['void_invoice', 'note'].includes(reviewItem.type) ? '—' : `$${fmt(reviewItem.inputAmount)}`}
                        </div>
                      </div>
                    </div>

                    {/* 品項 */}
                    {(reviewItem.items ?? []).filter(i => i.item_name.trim()).length > 0 && (
                      <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px' }}>
                        <p style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600, marginBottom: '6px' }}>品項</p>
                        {(reviewItem.items ?? []).filter(i => i.item_name.trim()).map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0', borderBottom: idx < (reviewItem.items ?? []).filter(i => i.item_name.trim()).length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                            <span style={{ color: '#52525b' }}>
                              {item.item_name}
                              {item.quantity > 0 && item.quantity !== 1 ? ` × ${item.quantity}` : ''}
                              {item.unit ? item.unit : ''}
                            </span>
                            <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              {(item.unit_price ?? 0) > 0 && (
                                <span style={{ fontSize: '12px', color: '#71717a', fontVariantNumeric: 'tabular-nums' }}>${fmt(item.unit_price)}/單</span>
                              )}
                              <span style={{ fontWeight: 600, color: '#18181b', fontVariantNumeric: 'tabular-nums' }}>${fmt(item.amount)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 備註 */}
                    {reviewItem.notes && (
                      <div style={{ background: '#fefce8', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px', border: '1px solid #fef08a' }}>
                        <p style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600, marginBottom: '4px' }}>備註</p>
                        <p style={{ fontSize: '13px', color: '#18181b', lineHeight: 1.5 }}>{reviewItem.notes}</p>
                      </div>
                    )}

                    {/* 進度列 */}
                    <div style={{ height: '4px', borderRadius: '2px', background: '#f4f4f5', marginBottom: '16px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '2px', background: '#F59E0B', width: `${(confirmedCount / verifyItems.length) * 100}%`, transition: 'width 0.3s' }} />
                    </div>

                    {reviewItem.confirmed ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px', background: '#f0fdf4', borderRadius: '14px', color: '#047857', fontWeight: 700, fontSize: '15px' }}>
                        <CheckCircle2 style={{ width: '20px', height: '20px' }} />
                        已核對
                      </div>
                    ) : (
                      <button
                        onClick={confirmCurrent}
                        style={{ width: '100%', background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: 'white', border: 'none', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <CheckCircle2 style={{ width: '20px', height: '20px' }} />
                        已核對，下一張
                      </button>
                    )}

                    {/* 上下張瀏覽 */}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                      <button
                        onClick={() => setReviewIndex(Math.max(0, reviewIndex - 1))}
                        disabled={reviewIndex === 0}
                        style={{ flex: 1, background: '#f4f4f5', border: 'none', padding: '11px', borderRadius: '12px', fontSize: '13px', fontWeight: 600, color: reviewIndex === 0 ? '#d4d4d8' : '#52525b', cursor: reviewIndex === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                        ← 上一張
                      </button>
                      <button
                        onClick={() => setReviewIndex(Math.min(verifyItems.length - 1, reviewIndex + 1))}
                        disabled={reviewIndex === verifyItems.length - 1}
                        style={{ flex: 1, background: '#f4f4f5', border: 'none', padding: '11px', borderRadius: '12px', fontSize: '13px', fontWeight: 600, color: reviewIndex === verifyItems.length - 1 ? '#d4d4d8' : '#52525b', cursor: reviewIndex === verifyItems.length - 1 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                        下一張 →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {verifyItems.length === 0 ? (
                <div className="rounded-3xl p-8 text-center text-white"
                  style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: '-40%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(circle,rgba(255,255,255,0.15),transparent)', borderRadius: '50%', pointerEvents: 'none' }} />
                  <div style={{ width: '80px', height: '80px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 style={{ width: '44px', height: '44px', color: 'white' }} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">本次無照片需核對</h2>
                  <p className="text-sm" style={{ opacity: 0.9 }}>可直接送出至總公司</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl overflow-hidden"
                  style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  {/* 標題列 */}
                  <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid #f4f4f5' }}>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: '#FFFBEB' }}>
                        <CheckCircle2 className="h-4 w-4" style={{ color: '#F59E0B' }} />
                      </div>
                      <p className="text-sm font-semibold" style={{ color: '#18181b' }}>核對清單</p>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: allConfirmed ? '#d1fae5' : '#f4f4f5', color: allConfirmed ? '#065f46' : '#52525b' }}>
                      {confirmedCount}/{verifyItems.length} 已核對
                    </span>
                  </div>

                  {/* 上方核對按鈕：照片很多時不用滑到底即可開始 */}
                  {!allConfirmed && (
                    <div className="px-4 pt-4">
                      <button
                        onClick={startReview}
                        style={{ width: '100%', background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: 'white', border: 'none', padding: '14px', borderRadius: '14px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(245,158,11,0.22)' }}>
                        <Camera style={{ width: '18px', height: '18px' }} />
                        {confirmedCount > 0 ? `繼續核對（剩 ${verifyItems.length - confirmedCount} 張）` : '開始核對'}
                      </button>
                    </div>
                  )}

                  {/* 清單 */}
                  <div className="p-4 space-y-2">
                    {verifyItems.map((item, idx) => (
                      <button
                        key={item.key}
                        onClick={() => setReviewIndex(idx)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '10px 12px',
                          borderRadius: '12px', border: `1.5px solid ${item.confirmed ? '#bbf7d0' : '#e4e4e7'}`,
                          background: item.confirmed ? '#f0fdf4' : 'white',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontFamily: 'inherit',
                        }}>
                        {/* 縮圖 */}
                        <div style={{ width: '52px', height: '52px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, background: '#f4f4f5', border: '1px solid #e4e4e7' }}>
                          <SafeImage src={item.photoUrl} alt="" fallbackText="照片" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        </div>
                        {/* 文字 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#18181b', marginBottom: '2px' }}>
                            {item.type === 'receipt' ? '單據' : item.type === 'ck' ? '央廚' : item.type === 'envelope' ? '信封袋' : item.type === 'void_invoice' ? '作廢發票' : item.type === 'note' ? '備註' : '平台'} · {item.label}
                          </div>
                          <div style={{ fontSize: '12px', color: '#71717a' }}>
                            {['envelope', 'void_invoice', 'note'].includes(item.type)
                              ? '確認照片清晰無誤'
                              : <>輸入金額：<span style={{ fontWeight: 600, color: '#92400E' }}>${fmt(item.inputAmount)}</span></>
                            }
                          </div>
                        </div>
                        {/* 狀態 */}
                        {item.confirmed
                          ? <CheckCircle2 style={{ width: '20px', height: '20px', color: '#10b981', flexShrink: 0 }} />
                          : <ZoomIn style={{ width: '18px', height: '18px', color: '#a1a1aa', flexShrink: 0 }} />
                        }
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {allConfirmed && verifyItems.length > 0 && (
                <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#d1fae5,#ecfdf5)', border: '1px solid #6ee7b7' }}>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: '#059669' }} />
                    <div>
                      <p className="text-sm font-bold" style={{ color: '#065f46' }}>所有照片已核對完成，可放心送出</p>
                      <p className="text-xs mt-1" style={{ color: '#047857' }}>送出後總公司會收到完整的單據照片與輸入金額</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )
        })()}

        {/* ── STEP 6: 送出 ─────────────────────────────────────────────── */}
        {stepId === 'submit' && (
          <>
            <GradientTitle step={stepNum} total={totalSteps} title="送出今日結帳"
              desc="送出後資料將上傳至總公司，請再次確認金額正確。" />

            <div className="rounded-3xl p-6 text-center mb-4"
              style={{ background: 'linear-gradient(135deg,#FFFBEB,#f5f3ff)', border: '1.5px solid #FDE68A' }}>
              <p className="text-xs mb-1 font-semibold" style={{ color: '#F59E0B' }}>
                {hasRemittanceChange ? '實際應包回公司的錢' : '應包進信封的錢'}
              </p>
              <p className="text-5xl font-extrabold tabular-nums tracking-tight mb-2" style={{ color: '#92400E' }}>
                ${fmt(hasRemittanceChange ? s.remitToHQ : s.actualRemit)}
              </p>
              {hasRemittanceChange && (
                <div className="mt-2 mb-1 px-3 py-2 rounded-xl text-xs" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                  {s.adjustmentTotal !== 0 && (
                    <div className="flex justify-between tabular-nums" style={{ color: '#2563eb' }}>
                      <span>匯款調整</span>
                      <span>{s.adjustmentTotal >= 0 ? '+' : '−'}${fmt(Math.abs(s.adjustmentTotal))}</span>
                    </div>
                  )}
                  {s.preReservedExpenseTotal > 0 && (
                    <div className="flex justify-between tabular-nums" style={{ color: '#15803d' }}>
                      <span>前幾日已預留支出加回</span>
                      <span>＋${fmt(s.preReservedExpenseTotal)}</span>
                    </div>
                  )}
                  {reserves.map(r => {
                    const accumulatedTotal = (r.accumulated_before ?? 0) + r.amount
                    const remaining = r.total_bill && r.total_bill > accumulatedTotal ? r.total_bill - accumulatedTotal : null
                    return (
                      <div key={r.id} className="flex justify-between tabular-nums" style={{ color: '#c2410c' }}>
                        <span>預留 {r.reason}</span>
                        <span>
                          −${fmt(r.amount)}
                          {remaining ? `（累計 $${fmt(accumulatedTotal)}，尚差 $${fmt(remaining)}）` : ''}
                        </span>
                      </div>
                    )
                  })}
                  <div className="flex justify-between tabular-nums font-semibold mt-1 pt-1" style={{ borderTop: '1px solid #fed7aa', color: '#9a3412' }}>
                    <span>原始實匯入 ${fmt(s.actualRemit)} → 實際包回</span>
                    <span>${fmt(s.remitToHQ)}</span>
                  </div>
                </div>
              )}
              <div className="flex justify-center gap-6 text-sm mt-3">
                <div><p className="text-xs mb-0.5" style={{ color: '#a1a1aa' }}>總營業額</p><p className="font-bold tabular-nums">${fmt(s.totalRevenue)}</p></div>
                <div><p className="text-xs mb-0.5" style={{ color: '#a1a1aa' }}>誤差</p>
                  <p className="font-bold tabular-nums" style={{ color: varColor }}>{s.variance >= 0 ? '+' : ''}{fmt(s.variance)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl px-4 py-3.5 flex items-start gap-2.5 text-sm"
              style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#f97316' }} />
              <span style={{ color: '#9a3412' }}>送出後當天閉店即無法修改，請確認所有營業額、發票、現金清點皆已填寫完畢。</span>
            </div>
          </>
        )}

        {/* ── STEP 7: 摘要 ─────────────────────────────────────────────── */}
        {stepId === 'result' && (
          <>
            <GradientTitle step={stepNum} total={totalSteps} title="送出成功" desc="今日結帳已送出至總公司，請依下方資訊準備信封袋。" />

            <div className="rounded-3xl p-8 text-white text-center mb-4 relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)', boxShadow: '0 20px 50px -10px rgba(16,185,129,0.3)' }}>
              <div className="h-20 w-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-11 w-11" style={{ color: '#10b981' }} />
              </div>
              <h2 className="text-2xl font-bold mb-1">結帳已成功送出！</h2>
              <p className="text-sm opacity-90">{today} · {store.name}</p>
            </div>

            <div className="rounded-3xl p-6 text-white relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg,#18181b,#92400E)', boxShadow: '0 20px 50px -10px rgba(245,158,11,0.2)' }}>
              <div className="flex items-center gap-2.5 mb-5">
                <Send className="h-5 w-5" />
                <span className="font-semibold">信封袋資訊</span>
              </div>
              <div className="space-y-2 text-sm mb-5">
                {[['日期', today], ['店名', store.name]].map(([label, val]) => (
                  <div key={label} className="flex justify-between pb-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ opacity: 0.7 }}>{label}</span>
                    <span className="font-semibold">{val}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <p className="text-xs mb-1" style={{ opacity: 0.8 }}>
                  {hasRemittanceChange ? '今日實際應包回公司' : '請包入信封袋的金額'}
                </p>
                <p className="text-4xl font-extrabold tabular-nums tracking-tight">${fmt(hasRemittanceChange ? s.remitToHQ : s.actualRemit)}</p>
                {hasRemittanceChange && (
                  <p className="text-xs mt-2" style={{ opacity: 0.7 }}>
                    （{[
                      s.preReservedExpenseTotal > 0 ? `前幾日已預留支出加回 $${fmt(s.preReservedExpenseTotal)}` : '',
                      s.totalReserved > 0 ? `已預留 $${fmt(s.totalReserved)} 備付費用` : '',
                    ].filter(Boolean).join('；')}）
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── STEP: 零用金核對 ───────────────────────────────────────── */}
        {stepId === 'petty' && (
          <>
            <GradientTitle step={stepNum} total={totalSteps} title="零用金核對"
              desc="送出帳目前，請清點店內剩餘零用金是否等於備付額。" />

            {/* 完成後顯示成功卡片 */}
            {pettyFinished && (
              <div className="rounded-3xl p-8 text-center mb-4"
                style={{ background: 'linear-gradient(135deg,#d1fae5,#ecfdf5)', border: '1.5px solid #6ee7b7' }}>
                <div style={{ fontSize: 48 }}>✓</div>
                <p className="text-2xl font-extrabold mt-3" style={{ color: '#047857' }}>零用金核對完成</p>
                <p className="text-sm mt-1" style={{ color: '#065f46' }}>零用金核對已記錄</p>
              </div>
            )}

            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
                <p className="text-sm font-semibold mb-0.5">零用金最終核對</p>
                <p className="text-xs" style={{ color: '#a1a1aa' }}>送出帳目前，請清點剩餘零用金是否等於零用金備付額</p>
              </div>
              <div className="px-5 py-4">
                <div className="rounded-2xl p-4 text-center mb-4" style={{ background: 'linear-gradient(135deg,#FFFBEB,#f5f3ff)' }}>
                  <p className="text-xs mb-1" style={{ color: '#F59E0B' }}>店面應剩餘零用金</p>
                  <p className="text-3xl font-extrabold tabular-nums" style={{ color: '#92400E' }}>${fmt(store.petty_cash)}</p>
                </div>
                <div className="space-y-2.5 mb-4">
                  <div style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 1fr 3.5rem', gap: '0 8px' }}>
                    <span />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-center" style={{ color: '#a1a1aa' }}>張 / 枚</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-center" style={{ color: '#a1a1aa' }}>整筆金額</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-right" style={{ color: '#a1a1aa' }}>小計</span>
                  </div>
                  {DENOMINATIONS.map(({ label, countKey, lumpKey, unit, unitLabel }, rowIdx) => {
                    const countVal = pettyCounts[countKey] || 0
                    const lumpVal = pettyLumps[lumpKey] || 0
                    const subtotal = countVal * unit + lumpVal
                    return (
                      <div key={countKey} style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 1fr 3.5rem', gap: '0 8px', alignItems: 'center' }}>
                        <span className="text-xs shrink-0" style={{ color: '#52525b' }}>{label}</span>
                        <div className="flex items-center gap-1">
                          <SInput value={countVal} onChange={v => setPettyCounts(prev => ({ ...prev, [countKey]: parseInt(String(v)) || 0 }))}
                            inputRef={el => { pettyRefs.current[rowIdx] = el }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const n = pettyRefs.current[rowIdx + 1]; if (n) { n.focus(); n.select() } } }} />
                          <span className="text-[10px] shrink-0" style={{ color: '#a1a1aa' }}>{unitLabel}</span>
                        </div>
                        <SInput value={lumpVal} onChange={v => setPettyLumps(prev => ({ ...prev, [lumpKey]: parseInt(String(v)) || 0 }))}
                          inputRef={el => { pettyRefs.current[rowIdx + 7] = el }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const n = pettyRefs.current[rowIdx + 8]; if (n) { n.focus(); n.select() } } }} />
                        <span className="text-right text-xs tabular-nums shrink-0"
                          style={{ color: subtotal > 0 ? '#18181b' : '#d4d4d8', fontWeight: subtotal > 0 ? 600 : 400 }}>
                          ${fmt(subtotal)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <SummaryBlock label="清點零用金總額" value={`$${fmt(pettyVerifyCash)}`} />
                {pettyVerifyCash > 0 && (
                  <div className="mt-3 rounded-2xl px-4 py-4 text-center"
                    style={{
                      background: pettyOk ? 'linear-gradient(135deg,#d1fae5,#ecfdf5)' : Math.abs(pettyDiff) <= 300 ? 'linear-gradient(135deg,#fef3c7,#fffbeb)' : 'linear-gradient(135deg,#ffe4e6,#fff1f2)',
                      border: `1px solid ${pettyOk ? '#6ee7b7' : Math.abs(pettyDiff) <= 300 ? '#fcd34d' : '#fda4af'}`,
                    }}>
                    <p className="text-xs mb-1" style={{ color: '#52525b' }}>核對結果</p>
                    <p className="text-2xl font-extrabold tabular-nums"
                      style={{ color: pettyOk ? '#047857' : Math.abs(pettyDiff) <= 300 ? '#b45309' : '#be123c' }}>
                      {pettyOk ? '✓ 零用金正確' : `差額 ${pettyDiff > 0 ? '+' : ''}${fmt(pettyDiff)}`}
                    </p>
                    {!pettyOk && <p className="text-xs mt-1" style={{ color: '#71717a' }}>請複查信封袋或重新清點零用金</p>}
                  </div>
                )}
              </div>
            </div>

            {/* 更多照片（選填）— 零用金照片 / 其他款項照片 等 */}
            <div className="bg-white rounded-2xl overflow-hidden mt-3" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <button type="button" onClick={() => setExtraPhotosOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                <div>
                  <p className="text-sm font-semibold">更多照片（選填）</p>
                  <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>
                    {extraPhotos.length > 0 ? `已上傳 ${extraPhotos.length} 張` : '零用金清點、其他款項照片等'}
                  </p>
                </div>
                <span style={{ color: '#a1a1aa', fontSize: 18 }}>{extraPhotosOpen ? '▴' : '▾'}</span>
              </button>
              {extraPhotosOpen && (
                <div className="px-5 pb-5 pt-1" style={{ borderTop: '1px solid #f4f4f5' }}>
                  {/* 已上傳清單 */}
                  {extraPhotos.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {extraPhotos.map((p, idx) => (
                        <div key={idx} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
                          <button type="button" onClick={() => setPhotoLightbox(p.url)}
                            style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', border: '1px solid #e4e4e7', padding: 0, background: 'none', cursor: 'zoom-in', flexShrink: 0 }}>
                            <SharedSafePhotoImage src={p.url} alt={p.label} thumb width={160} height={160} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <input value={p.label}
                              onChange={e => {
                                const v = e.target.value
                                setExtraPhotos(prev => prev.map((x, i) => i === idx ? { ...x, label: v } : x))
                              }}
                              style={{ width: '100%', padding: '6px 10px', border: '1px solid #e4e4e7', borderRadius: 8, fontSize: 13, outline: 'none', background: 'white', fontFamily: 'inherit' }}
                              placeholder="照片標籤" />
                          </div>
                          <button type="button"
                            onClick={() => setExtraPhotos(prev => prev.filter((_, i) => i !== idx))}
                            style={{ padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: 8, background: 'white', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                            刪除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 上傳按鈕 */}
                  <div className="flex gap-2">
                    {['零用金核對', '其他款項'].map(label => (
                      <button key={label} type="button"
                        disabled={extraPhotoUploading}
                        onClick={() => { setExtraPhotoUploadLabel(label); extraPhotoInputRef.current?.click() }}
                        className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold"
                        style={{ background: 'white', border: '1.5px solid #FEF3C7', color: '#92400E', cursor: extraPhotoUploading ? 'not-allowed' : 'pointer', opacity: extraPhotoUploading ? 0.6 : 1 }}>
                        {extraPhotoUploading && extraPhotoUploadLabel === label ? '上傳中…' : `+ ${label}`}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] mt-2" style={{ color: '#a1a1aa' }}>每張可改標籤。其他類型也可上傳後手動命名。</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Fixed bottom bar ──────────────────────────────────────────────── */}
      {(!isLocked || submitDone) && (
        <div className="fixed left-0 lg:left-60 right-0 bg-white px-4 py-3 closing-form-bottom-bar"
          style={{ visibility: stepMounted ? 'visible' : 'hidden' }}>
          <div className="max-w-xl mx-auto flex gap-3">

            {/* 零用金核對 → 儲存後才能送出 */}
            {stepId === 'petty' && (
              <button onClick={async () => {
                if (!hasRequiredPettyInput) {
                  toast.error('請先完成零用金清點，至少輸入一筆張數、整筆金額、大額支出或顧客匯款')
                  return
                }
                setSavingPetty(true)
                try {
                  const cid = existingClosing?.id ?? closingId ?? await handleSave(true)
                  if (!cid) throw new Error('找不到今日帳目，請重新整理後再試一次')
                  const r = await savePettyCounts(cid, pettyCounts, pettyLumps)
                  if (r && 'error' in r) throw new Error(r.error)
                  localStorage.setItem(`petty_done_${store.id}_${today}`, '1')
                  setPettyFinished(true)
                  toast.success('零用金核對已完成，請繼續送出帳目')
                  goToStep(step + 1)
                } catch (e) {
                  toast.error('零用金儲存失敗：' + (e instanceof Error ? e.message : String(e)))
                } finally {
                  setSavingPetty(false)
                }
              }}
                disabled={savingPetty || saving}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-base font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 8px 20px rgba(245,158,11,0.3)', opacity: savingPetty || saving ? 0.7 : 1 }}>
                {savingPetty ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                確認，繼續送出 →
              </button>
            )}

            {/* 摘要 → 前往結帳結果 */}
            {stepId === 'result' && (
              <button onClick={() => router.replace(summaryHref)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
                查看結帳結果
              </button>
            )}

            {/* Step 6: 送出 → 確認送出按鈕 */}
            {stepId === 'submit' && (
              <>
                <button onClick={goPrev} disabled={submitting}
                  className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl text-sm font-semibold"
                  style={{ background: '#f4f4f5', color: '#52525b', opacity: submitting ? 0.6 : 1 }}>
                  ← 上一步
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white"
                  style={{
                    background: isDisputed ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'linear-gradient(135deg,#F59E0B,#F97316)',
                    boxShadow: isDisputed ? '0 4px 12px rgba(249,115,22,0.3)' : '0 4px 12px rgba(245,158,11,0.3)',
                    opacity: submitting ? 0.7 : 1,
                  }}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {isDisputed ? '確認重新送出' : '確認送出'}
                </button>
              </>
            )}

            {/* Steps before submit: 上一步 + 繼續 */}
            {step < submitStepIdx && stepId !== 'petty' && (
              <>
                {step > 0 && (
                  <button onClick={goPrev} disabled={saving}
                    className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl text-sm font-semibold"
                    style={{ background: '#f4f4f5', color: '#52525b', opacity: saving ? 0.6 : 1 }}>
                    ← 上一步
                  </button>
                )}
                <button onClick={goNext} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white"
                  style={{
                    background: 'linear-gradient(135deg,#F59E0B,#F97316)',
                    boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
                    opacity: saving ? 0.7 : 1,
                  }}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {stepId === 'ai_verify' ? '確認，進入零用金核對 →' : '繼續 →'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
