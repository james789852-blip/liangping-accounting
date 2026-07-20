'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { centralKitchenPhotoPath } from '@/lib/storage-paths'
import { Plus, Trash2, Loader2, CheckCircle2, ChevronDown, ChevronUp, Save, Send, Camera, X, ZoomIn, Pencil, BarChart3, ClipboardList, Banknote, ArrowLeft, ArrowRight, ClipboardCheck } from 'lucide-react'
import { saveCKDailyRecord, confirmCKReimbursementHandoff } from '@/app/actions/ck'
import CKHelp from './ck-help'
import { uploadToStorage } from '@/app/actions/upload'
import { compressImage } from '@/lib/compress-image'
import SafePhotoImage from '@/components/shared/safe-photo-image'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

/**
 * 央廚對帳列：顯示店家自報金額 + 央廚自輸入金額 + 比對狀態
 * 不一致時紅色警告，相符顯示綠色 ✓
 */
function CrossCheckRow({ order, value, onChange, disabled }: {
  order: MemberOrder
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const storeAmount = order.amount || 0
  const isConfirmed = value.trim() !== ''
  const ckAmount = isConfirmed ? Number(value) || 0 : 0
  const matched = isConfirmed && ckAmount === storeAmount
  const diff = isConfirmed ? (ckAmount - storeAmount) : 0

  return (
    <div className="px-4 py-3" style={{ borderBottom: '1px solid #f9f9f9' }}>
      {/* 店家名稱 + 狀態 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold flex-1" style={{ color: '#18181b' }}>{order.store_name}</span>
        {!order.submitted ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: '#f4f4f5', color: '#a1a1aa' }}>店家未送出</span>
        ) : matched ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1"
            style={{ background: '#d1fae5', color: '#047857' }}>
            <CheckCircle2 className="h-3 w-3" />對帳完成
          </span>
        ) : isConfirmed ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: '#ffe4e6', color: '#be123c' }}>⚠ 差 {diff > 0 ? '+' : ''}{fmt(diff)}</span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: '#fef3c7', color: '#92400e' }}>待對帳</span>
        )}
      </div>

      {/* 兩欄並列：店家自報 vs 央廚對帳 */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg px-3 py-2" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#a1a1aa' }}>店家自報</p>
          <p className="font-bold tabular-nums" style={{ color: storeAmount > 0 ? '#18181b' : '#d4d4d8' }}>
            {storeAmount > 0 ? `$${fmt(storeAmount)}` : '—'}
          </p>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: matched ? '#d1fae5' : isConfirmed ? '#ffe4e6' : '#fef3c7', border: '1px solid #f4f4f5' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#a1a1aa' }}>央廚自報</p>
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold" style={{ color: '#52525b' }}>$</span>
            <input
              type="number" inputMode="numeric" placeholder="輸入"
              value={value} onChange={e => onChange(e.target.value)}
              disabled={disabled}
              style={{ width: '100%', padding: '2px 4px', border: 'none', background: 'transparent', fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', outline: 'none', fontFamily: 'inherit', color: '#18181b' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

interface MemberOrder { store_id: string; store_name: string; amount: number; submitted: boolean; confirmed_amount?: number | null }
interface ExternalStore { id: string; name: string }
interface ExternalOrder { name: string; amount: number }
interface Expense { id: string; category: '食材' | '耗材' | '雜項'; item_name: string; amount: number; payer_name: string; vendor_group: string; doc_type: string; note: string; receipt_photo_url?: string }
interface PhotoExpenseItem {
  id: string
  savedExpenseId?: string
  item_name: string
  amount: string
  category?: '食材' | '耗材' | '雜項'
}
interface PhotoExpenseForm {
  id: string
  photoUrl: string
  savedExpenseId?: string
  category: '食材' | '耗材' | '雜項'
  category_name?: string
  item_name: string
  amount: string
  items?: PhotoExpenseItem[]
  payer_name: string
  vendor_group: string
  doc_type: string
  note: string
  has_tax?: boolean
  tax_amount?: string
}
interface ExistingRecord {
  id: string
  payer_name?: string
  note?: string
  status: string
  review_note?: string | null
  reviewed_at?: string | null
  updated_at?: string | null
  hq_paid?: boolean
  hq_paid_at?: string | null
  hq_reimbursement_photo_urls?: string[]
  hq_reimbursement_sent_at?: string | null
  ck_reimbursement_confirmed?: boolean
  ck_reimbursement_confirmed_at?: string | null
  externalOrders: ExternalOrder[]
  expenses: Array<Expense & { receipt_photo_url?: string }>
  receiptPhotoUrls?: string[]
}

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  '食材': { bg: '#fef3c7', text: '#92400e' },
  '耗材': { bg: '#ecfdf5', text: '#047857' },
  '雜項': { bg: '#f4f4f5', text: '#52525b' },
}

function isMiscCategoryName(categoryName: string) {
  return categoryName === '雜項' || categoryName === '其他'
}

function shouldUseVendorAsItem(categoryName: string, vendorName: string) {
  const vendor = vendorName.trim()
  return categoryName === '雜項' || (categoryName === '其他' && vendor === '日常用品')
}

function shouldRequireExplicitItem(categoryName: string, vendorName: string) {
  return categoryName === '其他' && vendorName.trim() === '購買-選擇單據類型'
}

/**
 * 央廚的這四種收據類別都是「一張單據對應一個品項」：
 * 選擇直接放在類別右側，不再多一層廠商／新增品項欄位。
 */
function isDirectPhotoItemCategory(categoryName: string) {
  return ['日常用品', '買東西或維修', '加油或停車', '退稅'].includes(categoryName)
}

function isBuyOrRepairCategory(categoryName: string) {
  return categoryName === '買東西或維修'
}

function shouldShowPhotoTaxAddon(categoryName: string, docType: string) {
  // 買東西／維修只有選擇「發票」時才需要提供稅外加。
  return !isBuyOrRepairCategory(categoryName) || docType === '發票'
}

function inferExpenseCategory(categoryName: string): '食材' | '耗材' | '雜項' {
  if (categoryName === '耗材') return '耗材'
  if (isMiscCategoryName(categoryName)) return '雜項'
  return '食材'
}

function normalizeExpenseCategory(value?: string | null): '食材' | '耗材' | '雜項' | null {
  return value === '食材' || value === '耗材' || value === '雜項' ? value : null
}

function findMappedExpenseCategory(
  mappingItems: MappingItem[],
  vendorGroup: string,
  itemName: string,
): '食材' | '耗材' | '雜項' | null {
  const vendor = vendorGroup.trim()
  const item = itemName.trim()
  if (!item) return null

  const exact = mappingItems.find(m =>
    (m.vendor_group ?? '') === vendor &&
    (m.item_name === item || m.excel_column === item)
  )
  const fallback = exact ?? mappingItems.find(m => m.item_name === item || m.excel_column === item)
  return normalizeExpenseCategory(fallback?.item_category)
}

function resolveExpenseCategory(
  categoryName: string,
  vendorGroup: string,
  itemName: string,
  fallbackCategory: string | undefined,
  mappingItems: MappingItem[],
): '食材' | '耗材' | '雜項' {
  const mapped = findMappedExpenseCategory(mappingItems, vendorGroup, itemName)
  if (mapped) return mapped

  if (vendorGroup.trim() === '日常用品') return '耗材'

  const fallback = normalizeExpenseCategory(fallbackCategory)
  if (fallback) return fallback

  return inferExpenseCategory(categoryName)
}

function resolveReceiptCategoryName(form: PhotoExpenseForm, receiptCategories: ReceiptCat[]) {
  if (form.category_name && receiptCategories.some(c => c.name === form.category_name)) return form.category_name
  if (form.vendor_group) {
    const containing = receiptCategories.find(c => c.vendors.some(v => v.name === form.vendor_group))
    if (containing) return containing.name
  }
  if (!form.category_name && !form.vendor_group && !form.item_name) return ''
  if (form.category === '耗材' && receiptCategories.some(c => c.name === '耗材')) return '耗材'
  if (form.category === '雜項') {
    if (receiptCategories.some(c => c.name === '雜項')) return '雜項'
    if (receiptCategories.some(c => c.name === '其他')) return '其他'
  }
  if (receiptCategories.some(c => c.name === '廠商類別')) return '廠商類別'
  return receiptCategories[0]?.name ?? '廠商類別'
}

function makePhotoItemId() {
  return `item-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function blankPhotoExpenseItem(): PhotoExpenseItem {
  return { id: makePhotoItemId(), item_name: '', amount: '' }
}

function getPhotoExpenseItems(form: PhotoExpenseForm): PhotoExpenseItem[] {
  if (Array.isArray(form.items) && form.items.length > 0) return form.items
  return [{
    id: form.savedExpenseId || `${form.id}-item`,
    savedExpenseId: form.savedExpenseId,
    item_name: form.item_name,
    amount: form.amount,
    category: form.category,
  }]
}

function normalizePhotoExpenseForm(form: PhotoExpenseForm): PhotoExpenseForm {
  return { ...form, items: getPhotoExpenseItems(form) }
}

function mergeExternalOrders(configuredStores: ExternalStore[], existingOrders?: ExternalOrder[] | null) {
  const byName = new Map<string, ExternalOrder>()
  for (const store of configuredStores) {
    const name = store.name.trim()
    if (name) byName.set(name, { name, amount: 0 })
  }
  for (const order of existingOrders ?? []) {
    const name = order.name.trim()
    if (name) byName.set(name, { name, amount: Number(order.amount) || 0 })
  }
  return Array.from(byName.values())
}

function buildPhotoExpenseForms(photoUrls: string[], expenses: Expense[], mappingItems: MappingItem[]): PhotoExpenseForm[] {
  const used = new Set<string>()
  const grouped = new Map<string, Expense[]>()
  for (const expense of expenses) {
    if (!expense.receipt_photo_url) continue
    const url = expense.receipt_photo_url
    used.add(url)
    grouped.set(url, [...(grouped.get(url) ?? []), expense])
  }

  const fromExpenses = Array.from(grouped.entries())
    .map(([url, group], index) => {
      const taxExpense = group.find(expense => mappingItems.some(mapping => mapping.is_tax_addon && mapping.item_name === expense.item_name))
      const regularExpenses = group.filter(expense => expense !== taxExpense)
      const first = regularExpenses[0] ?? group[0]
      return {
        id: first.id || `expense-${index}`,
        photoUrl: url,
        savedExpenseId: first.id,
        category: first.category,
        category_name: undefined,
        item_name: first.item_name,
        amount: first.amount ? String(first.amount) : '',
        items: regularExpenses.map(e => ({
          id: e.id || makePhotoItemId(),
          savedExpenseId: e.id,
          item_name: e.item_name,
          amount: e.amount ? String(e.amount) : '',
          category: e.category,
        })),
        payer_name: first.payer_name || '',
        vendor_group: first.vendor_group || '',
        doc_type: first.doc_type || '發票',
        note: first.note || '',
        has_tax: !!taxExpense,
        tax_amount: taxExpense?.amount ? String(taxExpense.amount) : '',
      }
    })
  const photoOnly = photoUrls
    .filter(url => !used.has(url))
    .map((url, index) => ({
      id: `photo-${index}-${url}`,
      photoUrl: url,
      category: '食材' as const,
      category_name: undefined,
      item_name: '',
      amount: '',
      items: [blankPhotoExpenseItem()],
      payer_name: '',
      vendor_group: '',
      doc_type: '發票',
      note: '',
      has_tax: false,
      tax_amount: '',
    }))
  return [...fromExpenses, ...photoOnly]
}

function CKDoneCard({
  ckStoreId,
  ckStoreName,
  date,
  revenueTotal,
  expenseTotal,
  payerName,
  photoCount,
  hqPaid,
  hqReimbursementPhotoUrls,
  hqReimbursementSentAt,
  ckReimbursementConfirmed,
  ckReimbursementConfirmedAt,
}: {
  ckStoreId: string
  ckStoreName: string
  date: string
  revenueTotal: number
  expenseTotal: number
  payerName: string
  photoCount: number
  hqPaid: boolean
  hqReimbursementPhotoUrls: string[]
  hqReimbursementSentAt?: string | null
  ckReimbursementConfirmed: boolean
  ckReimbursementConfirmedAt?: string | null
}) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(ckReimbursementConfirmed)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      const r = await confirmCKReimbursementHandoff(ckStoreId, date)
      if ('error' in r && r.error) {
        toast.error('點交失敗：' + r.error)
        return
      }
      setConfirmed(true)
      setConfirmOpen(false)
      toast.success('補款已點交完成')
      router.refresh()
    })
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-5 py-10" style={{ background: '#fafafa' }}>
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <div className="h-24 w-24 rounded-3xl flex items-center justify-center mb-6"
          style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 12px 32px rgba(245,158,11,0.3)' }}>
          <CheckCircle2 className="h-12 w-12 text-white" />
        </div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: '#18181b' }}>央廚帳目已送出</h1>
        <p className="text-sm mb-6" style={{ color: '#a1a1aa' }}>{date} · {ckStoreName}</p>

        <div className="w-full rounded-2xl p-5 mb-6 space-y-3"
          style={{ background: 'white', border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: '#52525b' }}>營業額</span>
            <span className="text-lg font-bold tabular-nums" style={{ color: '#10b981' }}>${fmt(revenueTotal)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: '#52525b' }}>當日支出</span>
            <span className="text-lg font-bold tabular-nums" style={{ color: '#f97316' }}>${fmt(expenseTotal)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: '#52525b' }}>貨款代墊</span>
            <span className="text-sm font-semibold" style={{ color: payerName ? '#18181b' : '#a1a1aa' }}>{payerName || '未填寫'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: '#52525b' }}>收據照片</span>
            <span className="text-sm font-semibold" style={{ color: photoCount > 0 ? '#15803d' : '#a1a1aa' }}>{photoCount} 張</span>
          </div>
        </div>

        {hqPaid ? (
          <div className="w-full rounded-2xl p-4 mb-6 text-left"
            style={{ background: confirmed ? '#f0fdf4' : '#FFFBEB', border: `1px solid ${confirmed ? '#bbf7d0' : '#FDE68A'}` }}>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: confirmed ? '#dcfce7' : '#FEF3C7', color: confirmed ? '#15803d' : '#92400e' }}>
                {confirmed ? <CheckCircle2 className="h-5 w-5" /> : <Banknote className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: confirmed ? '#15803d' : '#92400e' }}>
                  {confirmed ? '補款已點交完成' : '總公司已補款，請點交確認'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: confirmed ? '#16a34a' : '#a16207' }}>
                  {hqReimbursementSentAt ? `送出時間：${new Date(hqReimbursementSentAt).toLocaleString('zh-TW')}` : '請確認信封金額與照片內容'}
                </p>
                {confirmed && ckReimbursementConfirmedAt && (
                  <p className="text-xs mt-0.5" style={{ color: '#16a34a' }}>
                    點交時間：{new Date(ckReimbursementConfirmedAt).toLocaleString('zh-TW')}
                  </p>
                )}
              </div>
            </div>

            {hqReimbursementPhotoUrls.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {hqReimbursementPhotoUrls.map((url, i) => (
                  <button key={`${url}-${i}`} type="button" onClick={() => setLightboxUrl(url)} style={{ aspectRatio: '1' }}>
                    <SafePhotoImage src={url} alt={`補款照片 ${i + 1}`} thumb width={180} height={180} className="h-full w-full rounded-lg object-cover"
                      style={{ border: `1px solid ${confirmed ? '#bbf7d0' : '#FDE68A'}` }} />
                  </button>
                ))}
              </div>
            )}

            {!confirmed && (
              <div className="mt-3 space-y-2">
                {!confirmOpen ? (
                  <button type="button" onClick={() => setConfirmOpen(true)}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
                    點交補款
                  </button>
                ) : (
                  <div className="rounded-xl p-3 space-y-3" style={{ background: 'white', border: '1px solid #FDE68A' }}>
                    <p className="text-xs leading-relaxed" style={{ color: '#92400e' }}>
                      請再次確認：已收到總公司補款信封，照片與實際金額都正確。確認後會回報總公司「央廚已點交」。
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setConfirmOpen(false)}
                        className="py-2 rounded-lg text-xs font-semibold"
                        style={{ background: '#f4f4f5', color: '#52525b' }}>
                        先不要
                      </button>
                      <button type="button" onClick={handleConfirm} disabled={isPending}
                        className="py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
                        {isPending ? '確認中...' : '確認點交'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs mb-6" style={{ color: '#a1a1aa' }}>總公司收到後會在帳目中心審核與補款。</p>
        )}

        <div className="flex flex-col gap-3 w-full">
          <Link href="/manager/history"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 14px rgba(245,158,11,0.2)' }}>
            <BarChart3 className="h-4 w-4" />
            查看歷史紀錄
          </Link>
          <Link href="/manager/dashboard"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
            <ClipboardList className="h-4 w-4" />
            回到今日狀態
          </Link>
        </div>
      </div>
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxUrl(null)}>
          <button type="button" onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>
            <X className="h-5 w-5" />
          </button>
          <SafePhotoImage src={lightboxUrl} alt="補款照片" loading="eager" className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

interface MappingItem { item_name: string; vendor_group: string | null; item_category: string; excel_column: string; sort_order: number | null; is_tax_addon?: boolean }
interface ReceiptCat { id: string; name: string; vendors: { id: string; name: string }[] }
interface Props {
  ckStoreId: string
  ckStoreName: string
  date: string
  realToday?: string
  isBackfill?: boolean
  memberOrders: MemberOrder[]
  externalStores: ExternalStore[]
  existing: ExistingRecord | null
  vendorGroups?: { id: string; name: string; doc_type: string | null }[]
  mappingItems?: MappingItem[]
  receiptCategories?: ReceiptCat[]
}

export default function CKDailyForm({ ckStoreId, ckStoreName, date, realToday, isBackfill, memberOrders, externalStores, existing, vendorGroups = [], mappingItems = [], receiptCategories = [] }: Props) {
  const router = useRouter()
  const isLocked = existing?.status === 'submitted' || existing?.status === 'verified'
  const isRejected = existing?.status === 'disputed'
  const draftKey = `lp_ck_daily_draft:${ckStoreId}:${date}`
  const [currentStep, setCurrentStep] = useState(1)

  const [payerName, setPayerName] = useState(existing?.payer_name ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 體系外叫貨
  const [extOrders, setExtOrders] = useState<ExternalOrder[]>(
    () => mergeExternalOrders(externalStores, existing?.externalOrders)
  )

  // 支出明細
  const [expenses, setExpenses] = useState<Expense[]>(existing?.expenses ?? [])
  const [newExpense, setNewExpense] = useState<{
    category: '食材' | '耗材' | '雜項'; item_name: string; amount: string; payer_name: string; vendor_group: string; doc_type: string; note: string
  }>({
    category: '食材', item_name: '', amount: '', payer_name: '', vendor_group: '', doc_type: '發票', note: '',
  })
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  // 支出：類別 → 廠商 → 品項 三層 dropdown（跟店面版一致）
  const [activeCat, setActiveCat] = useState<string>('')
  const [activeVendor, setActiveVendor] = useState<string>('')

  // 收據照片
  const [photoUrls, setPhotoUrls] = useState<string[]>(existing?.receiptPhotoUrls ?? [])
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string>(existing?.receiptPhotoUrls?.[0] ?? '')
  const [photoForms, setPhotoForms] = useState<PhotoExpenseForm[]>(
    () => buildPhotoExpenseForms(existing?.receiptPhotoUrls ?? [], existing?.expenses ?? [], mappingItems)
  )
  const [expandedPhotoFormIds, setExpandedPhotoFormIds] = useState<string[]>([])
  const [memberOrderInputs, setMemberOrderInputs] = useState<Record<string, string>>(
    () => Object.fromEntries(memberOrders.map(o => [
      o.store_id,
      o.confirmed_amount != null ? String(o.confirmed_amount) : '',
    ]))
  )
  const [photoUploading, setPhotoUploading] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // 顯示折疊
  const [showMember, setShowMember] = useState(true)
  const [showExternal, setShowExternal] = useState(true)
  const [showExpenses, setShowExpenses] = useState(true)

  const vendorOptions = receiptCategories.find(c => c.name === activeCat)?.vendors ?? []
  const expenseItemOptions = useMemo(() => {
    if (!activeVendor) return []
    return mappingItems
      .filter(m => !m.is_tax_addon && (m.vendor_group ?? '') === activeVendor)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.item_name.localeCompare(b.item_name, 'zh-Hant'))
  }, [activeVendor, mappingItems])
  const hasMappedExpenseItems = expenseItemOptions.length > 0
  const useVendorAsItem = shouldUseVendorAsItem(activeCat, activeVendor)
  const requiresExplicitItem = shouldRequireExplicitItem(activeCat, activeVendor)

  useEffect(() => {
    setMemberOrderInputs(prev => {
      let changed = false
      const next = { ...prev }
      for (const order of memberOrders) {
        if (!(order.store_id in next)) {
          next[order.store_id] = order.confirmed_amount != null ? String(order.confirmed_amount) : ''
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [memberOrders])

  useEffect(() => {
    setExtOrders(prev => mergeExternalOrders(externalStores, prev))
  }, [externalStores])

  useEffect(() => {
    if (isLocked || typeof window === 'undefined') return
    const raw = window.localStorage.getItem(draftKey)
    if (!raw) return
    try {
      const draft = JSON.parse(raw)
      if (draft?.ckStoreId !== ckStoreId || draft?.date !== date) return
      // 送出／退回後以資料庫最新版本為準，避免舊的瀏覽器草稿把已保存內容覆蓋成空白。
      const draftSavedAt = typeof draft.savedAt === 'string' ? Date.parse(draft.savedAt) : NaN
      const recordUpdatedAt = existing?.updated_at ? Date.parse(existing.updated_at) : NaN
      if (Number.isFinite(draftSavedAt) && Number.isFinite(recordUpdatedAt) && draftSavedAt <= recordUpdatedAt) {
        window.localStorage.removeItem(draftKey)
        return
      }
      if (Array.isArray(draft.extOrders)) setExtOrders(draft.extOrders)
      if (Array.isArray(draft.expenses)) setExpenses(draft.expenses)
      if (Array.isArray(draft.photoUrls)) setPhotoUrls(draft.photoUrls)
      if (Array.isArray(draft.photoForms)) setPhotoForms(draft.photoForms.map((form: PhotoExpenseForm) => normalizePhotoExpenseForm(form)))
      if (draft.memberOrderInputs && typeof draft.memberOrderInputs === 'object') {
        setMemberOrderInputs(Object.fromEntries(
          Object.entries(draft.memberOrderInputs as Record<string, unknown>)
            .map(([key, value]) => [key, typeof value === 'string' ? value : String(value ?? '')])
        ))
      }
      if (typeof draft.selectedPhotoUrl === 'string') setSelectedPhotoUrl(draft.selectedPhotoUrl)
      if (typeof draft.payerName === 'string') setPayerName(draft.payerName)
      if (typeof draft.note === 'string') setNote(draft.note)
      if (draft.newExpense && typeof draft.newExpense === 'object') {
        setNewExpense(prev => ({ ...prev, ...draft.newExpense }))
      }
      if (typeof draft.activeCat === 'string') setActiveCat(draft.activeCat)
      if (typeof draft.activeVendor === 'string') setActiveVendor(draft.activeVendor)
    } catch {
      window.localStorage.removeItem(draftKey)
    }
  }, [ckStoreId, date, draftKey, existing?.updated_at, isLocked])

  useEffect(() => {
    if (isLocked || typeof window === 'undefined') return
    const timer = window.setTimeout(() => {
      const hasDraftContent =
        payerName.trim() ||
        note.trim() ||
        photoUrls.length > 0 ||
        photoForms.some(f =>
          getPhotoExpenseItems(f).some(item => item.item_name.trim() || item.amount) ||
          f.vendor_group.trim() ||
          f.note.trim()
        ) ||
        Object.values(memberOrderInputs).some(v => String(v).trim()) ||
        expenses.length > 0 ||
        extOrders.some(o => Number(o.amount || 0) > 0) ||
        newExpense.item_name.trim() ||
        newExpense.amount ||
        newExpense.payer_name.trim() ||
        newExpense.note.trim()
      if (!hasDraftContent) {
        window.localStorage.removeItem(draftKey)
        return
      }
      window.localStorage.setItem(draftKey, JSON.stringify({
        ckStoreId,
        date,
        savedAt: new Date().toISOString(),
        payerName,
        note,
        extOrders,
        expenses,
        newExpense,
        activeCat,
        activeVendor,
        photoUrls,
        photoForms,
        memberOrderInputs,
        selectedPhotoUrl,
      }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [activeCat, activeVendor, ckStoreId, date, draftKey, expenses, extOrders, isLocked, memberOrderInputs, newExpense, note, payerName, photoForms, photoUrls, selectedPhotoUrl])

  const memberTotal = memberOrders.reduce((s, o) => s + (Number(memberOrderInputs[o.store_id]) || 0), 0)
  const extTotal = extOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0)
  const revenueTotal = memberTotal + extTotal
  const expensesForSave = getExpensesForSave()
  const expenseTotal = expensesForSave.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const balance = revenueTotal - expenseTotal

  function getExpensesForSave() {
    const manualExpenses = expenses.filter(e => !e.receipt_photo_url)
    const photoExpenses = photoForms
      .flatMap(form => {
        const categoryName = resolveReceiptCategoryName(form, receiptCategories)
        const useVendorItem = shouldUseVendorAsItem(categoryName, form.vendor_group)
        const requiresItem = shouldRequireExplicitItem(categoryName, form.vendor_group)
        const regularExpenses = getPhotoExpenseItems(form).map((line, index) => {
          const itemName = useVendorItem
            ? form.vendor_group.trim()
            : requiresItem
              ? line.item_name.trim()
              : line.item_name.trim() || form.vendor_group.trim()
          if (!itemName || !line.amount) return null
          const category = resolveExpenseCategory(categoryName, form.vendor_group, itemName, line.category ?? form.category, mappingItems)
          return {
            id: line.savedExpenseId || line.id || `${form.id}-${index}`,
            category,
            item_name: itemName,
            amount: Number(line.amount) || 0,
            payer_name: form.payer_name.trim(),
            vendor_group: form.vendor_group.trim(),
            doc_type: form.doc_type,
            note: form.note.trim(),
            receipt_photo_url: form.photoUrl,
          } as Expense
        }).filter(Boolean) as Expense[]
        const taxMapping = shouldShowPhotoTaxAddon(categoryName, form.doc_type)
          ? mappingItems.find(mapping => mapping.is_tax_addon && mapping.vendor_group === form.vendor_group)
          : undefined
        const taxAmount = form.has_tax ? Number(form.tax_amount) || 0 : 0
        if (taxMapping && taxAmount > 0) {
          regularExpenses.push({
            id: `${form.id}-tax`,
            category: normalizeExpenseCategory(taxMapping.item_category) ?? form.category,
            item_name: taxMapping.item_name,
            amount: taxAmount,
            payer_name: form.payer_name.trim(),
            vendor_group: form.vendor_group.trim(),
            doc_type: form.doc_type,
            note: form.note.trim(),
            receipt_photo_url: form.photoUrl,
          })
        }
        return regularExpenses
      })
    return [...manualExpenses, ...photoExpenses]
  }

  function getMemberOrdersForSave() {
    return memberOrders.map(order => {
      const raw = memberOrderInputs[order.store_id] ?? ''
      return {
        storeId: order.store_id,
        confirmedAmount: raw.trim() === '' ? null : Number(raw) || 0,
      }
    })
  }

  function updateExtAmount(name: string, val: string) {
    setExtOrders(prev => prev.map(o => o.name === name ? { ...o, amount: Number(val) || 0 } : o))
  }

  function addExpense() {
    const fallbackItemName = activeVendor.trim() && (useVendorAsItem || (!requiresExplicitItem && !hasMappedExpenseItems))
      ? activeVendor.trim()
      : ''
    const itemName = newExpense.item_name.trim() || fallbackItemName
    if (!itemName || !newExpense.amount) { toast.error('請選擇廠商/品項並填寫金額'); return }
    const nextExpense: Expense = {
      id: crypto.randomUUID(),
      category: resolveExpenseCategory(activeCat, newExpense.vendor_group.trim() || activeVendor.trim(), itemName, newExpense.category, mappingItems),
      item_name: itemName,
      amount: Number(newExpense.amount) || 0,
      payer_name: newExpense.payer_name.trim(),
      vendor_group: newExpense.vendor_group.trim() || activeVendor.trim(),
      doc_type: newExpense.doc_type,
      note: newExpense.note.trim(),
      receipt_photo_url: selectedPhotoUrl || '',
    } as Expense
    if (editingExpenseId) {
      setExpenses(prev => prev.map(e => e.id === editingExpenseId ? { ...nextExpense, id: editingExpenseId } : e))
      setEditingExpenseId(null)
      toast.success('支出已更新')
    } else {
      setExpenses(prev => [...prev, nextExpense])
    }
    setNewExpense(p => ({ ...p, item_name: '', amount: '', payer_name: '', note: '' }))
  }

  function startEditExpense(expense: Expense) {
    setEditingExpenseId(expense.id)
    setActiveVendor(expense.vendor_group)
    setActiveCat(expense.category === '雜項' ? '雜項' : expense.category === '耗材' ? '耗材' : '廠商類別')
    setNewExpense({
      category: expense.category,
      item_name: expense.item_name,
      amount: String(expense.amount || ''),
      payer_name: expense.payer_name,
      vendor_group: expense.vendor_group,
      doc_type: expense.doc_type,
      note: expense.note,
    })
    setSelectedPhotoUrl(expense.receipt_photo_url ?? '')
    setShowExpenses(true)
  }

  function cancelEditExpense() {
    setEditingExpenseId(null)
    setNewExpense(p => ({ ...p, item_name: '', amount: '', payer_name: '', note: '' }))
  }

  function removeExpense(id: string) {
    setExpenses(prev => prev.filter(e => e.id !== id))
    setPhotoForms(prev => prev.map(f => f.savedExpenseId === id ? { ...f, savedExpenseId: undefined } : f))
  }

  function updatePhotoForm(id: string, patch: Partial<PhotoExpenseForm>) {
    setPhotoForms(prev => prev.map(form => form.id === id ? normalizePhotoExpenseForm({ ...form, ...patch }) : form))
  }

  function updatePhotoItem(formId: string, itemId: string, patch: Partial<PhotoExpenseItem>) {
    setPhotoForms(prev => prev.map(form => {
      if (form.id !== formId) return form
      const items = getPhotoExpenseItems(form).map(item => item.id === itemId ? { ...item, ...patch } : item)
      const first = items[0] ?? blankPhotoExpenseItem()
      return { ...form, items, item_name: first.item_name, amount: first.amount, category: first.category ?? form.category }
    }))
  }

  function addPhotoItem(formId: string) {
    setPhotoForms(prev => prev.map(form => {
      if (form.id !== formId) return form
      return { ...form, items: [...getPhotoExpenseItems(form), blankPhotoExpenseItem()] }
    }))
  }

  function removePhotoItem(formId: string, itemId: string) {
    setPhotoForms(prev => prev.map(form => {
      if (form.id !== formId) return form
      const items = getPhotoExpenseItems(form).filter(item => item.id !== itemId)
      const nextItems = items.length > 0 ? items : [blankPhotoExpenseItem()]
      const first = nextItems[0]
      return { ...form, items: nextItems, item_name: first.item_name, amount: first.amount, category: first.category ?? form.category }
    }))
  }

  function photoItemOptions(vendorName: string) {
    if (!vendorName) return []
    return mappingItems
      .filter(m => !m.is_tax_addon && (m.vendor_group ?? '') === vendorName)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.item_name.localeCompare(b.item_name, 'zh-Hant'))
  }

  function savePhotoExpense(form: PhotoExpenseForm) {
    const categoryName = resolveReceiptCategoryName(form, receiptCategories)
    const fallbackItemName = form.vendor_group.trim()
    const useVendorItem = shouldUseVendorAsItem(categoryName, form.vendor_group)
    const requiresItem = shouldRequireExplicitItem(categoryName, form.vendor_group)
    const lines = getPhotoExpenseItems(form)
    const nextExpenses = lines.map((line, index) => {
      const itemName = useVendorItem
        ? fallbackItemName
        : requiresItem
          ? line.item_name.trim()
          : line.item_name.trim() || fallbackItemName
      if (!itemName || !line.amount) return null
      const expenseId = line.savedExpenseId || line.id || `${form.id}-${index}`
      return {
        id: expenseId,
        category: resolveExpenseCategory(categoryName, form.vendor_group, itemName, line.category ?? form.category, mappingItems),
        item_name: itemName,
        amount: Number(line.amount) || 0,
        payer_name: form.payer_name.trim(),
        vendor_group: form.vendor_group.trim(),
        doc_type: form.doc_type,
        note: form.note.trim(),
        receipt_photo_url: form.photoUrl,
      } as Expense
    }).filter(Boolean) as Expense[]
    if (nextExpenses.length === 0) {
      toast.error('請選擇廠商/品項並填寫金額')
      return
    }
    const taxMapping = shouldShowPhotoTaxAddon(categoryName, form.doc_type)
      ? mappingItems.find(mapping => mapping.is_tax_addon && mapping.vendor_group === form.vendor_group)
      : undefined
    const taxAmount = form.has_tax ? Number(form.tax_amount) || 0 : 0
    if (form.has_tax && taxMapping && taxAmount <= 0) {
      toast.error('請輸入稅外加金額')
      return
    }
    if (taxMapping && taxAmount > 0) {
      nextExpenses.push({
        id: `${form.id}-tax`,
        category: normalizeExpenseCategory(taxMapping.item_category) ?? form.category,
        item_name: taxMapping.item_name,
        amount: taxAmount,
        payer_name: form.payer_name.trim(),
        vendor_group: form.vendor_group.trim(),
        doc_type: form.doc_type,
        note: form.note.trim(),
        receipt_photo_url: form.photoUrl,
      })
    }
    const regularSavedExpenses = nextExpenses.filter(expense => expense.item_name !== taxMapping?.item_name)
    setExpenses(prev => {
      const savedIds = new Set(nextExpenses.map(e => e.id))
      const withoutSamePhoto = prev.filter(e => !savedIds.has(e.id) && e.receipt_photo_url !== form.photoUrl)
      return [...withoutSamePhoto, ...nextExpenses]
    })
    setPhotoForms(prev => prev.map(f => f.id === form.id ? {
      ...f,
      savedExpenseId: regularSavedExpenses[0].id,
      item_name: regularSavedExpenses[0].item_name,
      amount: String(Number(regularSavedExpenses[0].amount) || 0),
      category: regularSavedExpenses[0].category,
      items: regularSavedExpenses.map(expense => ({
        id: expense.id,
        savedExpenseId: expense.id,
        item_name: expense.item_name,
        amount: String(Number(expense.amount) || 0),
        category: expense.category,
      })),
    } : f))
    setExpandedPhotoFormIds(prev => prev.filter(id => id !== form.id))
    toast.success(form.savedExpenseId ? '此張照片支出已更新' : '此張照片支出已儲存')
  }

  function removeReceiptPhoto(url: string) {
    setPhotoUrls(prev => prev.filter(item => item !== url))
    setPhotoForms(prev => prev.filter(form => form.photoUrl !== url))
    setExpandedPhotoFormIds(prev => prev.filter(id => !photoForms.some(form => form.id === id && form.photoUrl === url)))
    setExpenses(prev => prev.filter(e => e.receipt_photo_url !== url))
    if (selectedPhotoUrl === url) {
      const next = photoUrls.find(item => item !== url) || ''
      setSelectedPhotoUrl(next)
    }
  }

  async function handlePhotoUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setPhotoUploading(true)
    for (const rawFile of Array.from(files)) {
      const file = await compressImage(rawFile)
      const fd = new FormData()
      fd.append('file', file)
      const path = centralKitchenPhotoPath(ckStoreId, date, 'expenses', `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`)
      const result = await uploadToStorage(fd, 'receipts', path)
      if ('error' in result) { toast.error('上傳失敗：' + result.error) }
      else {
        setPhotoUrls(prev => {
          const next = [...prev, result.publicUrl]
          if (!selectedPhotoUrl) setSelectedPhotoUrl(result.publicUrl)
          return next
        })
        setPhotoForms(prev => [...prev, {
          id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          photoUrl: result.publicUrl,
          category: '食材',
          category_name: '',
          item_name: '',
          amount: '',
          items: [blankPhotoExpenseItem()],
          payer_name: '',
          vendor_group: '',
          doc_type: '發票',
          note: '',
          has_tax: false,
          tax_amount: '',
        }])
      }
    }
    setPhotoUploading(false)
  }

  async function handleSave(asSubmit = false, opts: { silent?: boolean } = {}) {
    if (asSubmit) setSubmitting(true); else setSaving(true)
    const r = await saveCKDailyRecord(ckStoreId, date, {
      payerName: payerName || undefined,
      note: note || undefined,
      status: asSubmit ? 'submitted' : 'draft',
      memberOrders: getMemberOrdersForSave(),
      externalOrders: extOrders.filter(o => o.amount > 0),
      expenses: expensesForSave.map(e => ({
        category: e.category, item_name: e.item_name, amount: e.amount,
        payer_name: e.payer_name || undefined,
        vendor_group: e.vendor_group || undefined,
        doc_type: e.doc_type || undefined,
        note: e.note || undefined,
        receipt_photo_url: (e as any).receipt_photo_url || undefined,
      })),
      receiptPhotoUrls: photoUrls,
    })
    if (r.error) { toast.error('儲存失敗：' + r.error) }
    else {
      if (typeof window !== 'undefined') window.localStorage.removeItem(draftKey)
      if (!opts.silent) toast.success(asSubmit ? '已送出！' : '草稿已儲存')
      if (!opts.silent) router.refresh()
    }
    if (asSubmit) setSubmitting(false); else setSaving(false)
    return !r.error
  }

  async function goNext() {
    if (currentStep >= 4) return
    const ok = await handleSave(false, { silent: true })
    if (!ok) return
    setCurrentStep(s => Math.min(4, s + 1))
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function goPrev() {
    setCurrentStep(s => Math.max(1, s - 1))
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const INPUT = 'w-full px-3 py-2 rounded-xl text-sm outline-none border transition-colors'
  const INPUT_STYLE: React.CSSProperties = { border: '1.5px solid #e4e4e7', background: 'white', color: '#18181b', fontFamily: 'inherit' }

  if (isLocked) {
    return (
      <CKDoneCard
        ckStoreId={ckStoreId}
        ckStoreName={ckStoreName}
        date={date}
        revenueTotal={revenueTotal}
        expenseTotal={expenseTotal}
        payerName={payerName}
        photoCount={photoUrls.length}
        hqPaid={existing?.hq_paid ?? false}
        hqReimbursementPhotoUrls={existing?.hq_reimbursement_photo_urls ?? []}
        hqReimbursementSentAt={existing?.hq_reimbursement_sent_at ?? null}
        ckReimbursementConfirmed={existing?.ck_reimbursement_confirmed ?? false}
        ckReimbursementConfirmedAt={existing?.ck_reimbursement_confirmed_at ?? null}
      />
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28 space-y-4">

      {/* 補帳日期切換 */}
      {isBackfill && realToday && (
        <div className="px-3 py-2 text-xs font-medium flex items-center justify-between gap-2 rounded-xl"
          style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
          <span>📅 你正在補做 <b>{date}</b> 的帳目（非今日）</span>
          <a href="/manager/ck" className="font-semibold underline shrink-0" style={{ color: '#78350F' }}>回到 {realToday}</a>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <span style={{ color: '#71717a' }}>日期</span>
        <input type="date" value={date} max={realToday ?? date}
          onChange={e => { const v = e.target.value; if (v) router.push(`/manager/ck?date=${v}`) }}
          className="px-2 py-1 rounded outline-none"
          style={{ border: '1px solid #e4e4e7', color: '#52525b', background: 'white' }}
          title="切換日期（可補做過往帳目）" />
      </div>

      {isRejected && (
        <div className="rounded-2xl px-4 py-3" style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
          <p className="text-sm font-bold" style={{ color: '#be123c' }}>總公司已退回，請修正後重新送出</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#881337' }}>
            {existing?.review_note || '請檢查央廚叫貨、支出與收據照片是否正確。'}
          </p>
        </div>
      )}

      <div className="bg-white rounded-3xl p-4" style={{ border: '1px solid #f4f4f5', boxShadow: '0 10px 30px rgba(15,23,42,0.04)' }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          {[
            { n: 1, title: '上傳單據' },
            { n: 2, title: '叫貨金額' },
            { n: 3, title: '代墊人' },
            { n: 4, title: '確認結果' },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2 flex-1">
              <button type="button" onClick={() => setCurrentStep(s.n)}
                className="h-9 w-9 rounded-full text-sm font-bold shrink-0"
                style={{
                  background: currentStep === s.n ? 'linear-gradient(135deg,#F59E0B,#F97316)' : currentStep > s.n ? '#10b981' : '#f4f4f5',
                  color: currentStep >= s.n ? 'white' : '#a1a1aa',
                  border: 'none',
                }}>
                {currentStep > s.n ? '✓' : s.n}
              </button>
              {i < 3 && <div className="h-1 flex-1 rounded-full" style={{ background: currentStep > s.n ? '#10b981' : '#e4e4e7' }} />}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>央廚結帳流程</p>
            <h2 className="text-xl font-extrabold" style={{ color: '#18181b' }}>
              {currentStep === 1 ? '上傳並編輯單據'
                : currentStep === 2 ? '輸入店家叫貨金額'
                : currentStep === 3 ? '輸入貨款代墊人'
                : '確認今日結果'}
            </h2>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
            步驟 {currentStep} / 4
          </span>
        </div>
      </div>

      {currentStep === 1 && !isLocked && (
        <div className="bg-white rounded-2xl px-4 py-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold" style={{ color: '#18181b' }}>請上傳當日支出單據照片</p>
              <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>可一次多張，上傳後逐張編輯類別、廠商、品項與金額。</p>
            </div>
            <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl shrink-0"
              style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: 'white', opacity: photoUploading ? 0.7 : 1 }}>
              {photoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {photoUploading ? '上傳中' : '新增照片'}
            </button>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => handlePhotoUpload(e.target.files)} />
          {photoUrls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photoUrls.slice(0, 8).map((url, i) => (
                <button key={`${url}-quick-${i}`} type="button" onClick={() => setSelectedPhotoUrl(url)}
                  className="h-16 w-16 rounded-xl overflow-hidden shrink-0"
                  style={{ border: `2px solid ${selectedPhotoUrl === url ? '#F59E0B' : '#e4e4e7'}`, background: '#f4f4f5' }}>
                  <SafePhotoImage src={url} alt={`收據 ${i + 1}`} thumb width={240} height={240} className="h-full w-full object-cover" />
                </button>
              ))}
              {photoUrls.length > 8 && (
                <div className="h-16 w-16 rounded-xl flex items-center justify-center text-xs font-semibold shrink-0"
                  style={{ background: '#fafafa', color: '#71717a', border: '1px solid #e4e4e7' }}>
                  +{photoUrls.length - 8}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 摘要卡片 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '營業額', value: revenueTotal, color: '#10b981' },
          { label: '當日支出', value: expenseTotal, color: '#f97316' },
          { label: '當日結餘', value: balance, color: balance >= 0 ? '#F59E0B' : '#dc2626' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl px-4 py-3" style={{ border: '1px solid #f4f4f5' }}>
            <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#a1a1aa' }}>{label}</p>
            <p className="text-lg font-bold tabular-nums" style={{ color }}>${fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* 體系內店家叫貨 */}
      {currentStep === 2 && (
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
        <button type="button" onClick={() => setShowMember(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: '#18181b' }}>體系內店家叫貨</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FFFBEB', color: '#92400E' }}>
              {memberOrders.length} 間 · ${fmt(memberTotal)}
            </span>
          </div>
          {showMember ? <ChevronUp className="h-4 w-4" style={{ color: '#a1a1aa' }} /> : <ChevronDown className="h-4 w-4" style={{ color: '#a1a1aa' }} />}
        </button>
        {showMember && (
          <div style={{ borderTop: '1px solid #f4f4f5' }}>
            {memberOrders.length === 0 ? (
              <p className="px-4 py-4 text-sm text-center" style={{ color: '#a1a1aa' }}>尚未設定服務店家</p>
            ) : (
              memberOrders.map(o => (
                <CrossCheckRow key={o.store_id}
                  order={o}
                  value={memberOrderInputs[o.store_id] ?? ''}
                  onChange={value => setMemberOrderInputs(prev => ({ ...prev, [o.store_id]: value }))}
                  disabled={isLocked}
                />
              ))
            )}
            <div className="flex items-center justify-between px-4 py-3" style={{ background: '#fafafa', borderTop: '1px solid #f4f4f5' }}>
              <span className="text-xs font-bold uppercase" style={{ color: '#a1a1aa' }}>體系內合計</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(memberTotal)}</span>
            </div>
          </div>
        )}
      </div>
      )}

      {/* 體系外店家叫貨 */}
      {currentStep === 2 && (
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
        <button type="button" onClick={() => setShowExternal(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: '#18181b' }}>體系外店家叫貨</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#f4f4f5', color: '#52525b' }}>
              ${fmt(extTotal)}
            </span>
          </div>
          {showExternal ? <ChevronUp className="h-4 w-4" style={{ color: '#a1a1aa' }} /> : <ChevronDown className="h-4 w-4" style={{ color: '#a1a1aa' }} />}
        </button>
        {showExternal && (
          <div style={{ borderTop: '1px solid #f4f4f5' }}>
            {extOrders.map(o => (
              <div key={o.name} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #f9f9f9' }}>
                <span className="flex-1 text-sm font-medium" style={{ color: '#18181b' }}>{o.name}</span>
                {isLocked ? (
                  <span className="text-sm font-bold tabular-nums" style={{ color: o.amount > 0 ? '#18181b' : '#a1a1aa' }}>
                    {o.amount > 0 ? `$${fmt(o.amount)}` : '—'}
                  </span>
                ) : (
                  <input type="number" min="0" placeholder="0"
                    className={INPUT} style={{ ...INPUT_STYLE, width: '120px', textAlign: 'right' }}
                    value={o.amount || ''}
                    onChange={e => updateExtAmount(o.name, e.target.value)}
                  />
                )}
              </div>
            ))}
            {!isLocked && (
              <div className="px-4 py-3" style={{ borderTop: extOrders.length > 0 ? '1px solid #f4f4f5' : 'none' }}>
                <p className="text-xs" style={{ color: '#a1a1aa' }}>
                  體系外店家清單請至「店家管理」設定，避免每日帳目異動影響 Excel 匯出欄位。
                </p>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-3" style={{ background: '#fafafa', borderTop: '1px solid #f4f4f5' }}>
              <span className="text-xs font-bold uppercase" style={{ color: '#a1a1aa' }}>體系外合計</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(extTotal)}</span>
            </div>
          </div>
        )}
      </div>
      )}

      {/* 支出明細 */}
      {currentStep === 1 && (
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
        <button type="button" onClick={() => setShowExpenses(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: '#18181b' }}>支出明細</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#fff1f2', color: '#dc2626' }}>
              {expenses.length} 筆 · ${fmt(expenseTotal)}
            </span>
          </div>
          {showExpenses ? <ChevronUp className="h-4 w-4" style={{ color: '#a1a1aa' }} /> : <ChevronDown className="h-4 w-4" style={{ color: '#a1a1aa' }} />}
        </button>
        {showExpenses && (
          <div style={{ borderTop: '1px solid #f4f4f5' }}>
            {expenses.filter(e => !e.receipt_photo_url).map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #f9f9f9' }}>
                {(e as any).receipt_photo_url && (
                  <button type="button" onClick={() => setLightboxUrl((e as any).receipt_photo_url)}
                    className="h-12 w-12 rounded-xl overflow-hidden shrink-0"
                    style={{ border: '1px solid #e4e4e7', background: '#f4f4f5' }}>
                    <SafePhotoImage src={(e as any).receipt_photo_url} alt="支出照片" thumb width={240} height={240} className="h-full w-full object-cover" />
                  </button>
                )}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: CAT_COLORS[e.category]?.bg, color: CAT_COLORS[e.category]?.text }}>
                  {e.category}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm" style={{ color: '#18181b' }}>
                    {e.item_name}
                    {e.payer_name && <span className="ml-1.5 text-xs" style={{ color: '#a1a1aa' }}>（{e.payer_name}付）</span>}
                  </div>
                  {(e.vendor_group || e.doc_type) && (
                    <div className="text-[11px] mt-0.5" style={{ color: '#a1a1aa' }}>
                      {e.vendor_group || '未分類'}{e.doc_type ? ` · ${e.doc_type}` : ''}
                    </div>
                  )}
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: '#18181b' }}>${fmt(e.amount)}</span>
                {!isLocked && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => startEditExpense(e)}
                      aria-label="編輯支出"
                      style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => removeExpense(e.id)}
                      aria-label="刪除支出"
                      style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!isLocked && (
              <div className="px-4 py-4 space-y-3" style={{ borderTop: expenses.length > 0 ? '1px solid #f4f4f5' : 'none', background: '#fafafa' }}>
                {photoForms.length === 0 ? (
                  <div className="rounded-2xl px-4 py-5 text-center" style={{ background: 'white', border: '1px dashed #e4e4e7' }}>
                    <p className="text-sm font-bold" style={{ color: '#18181b' }}>先上傳支出單據照片</p>
                    <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>上傳後會在這裡出現每張照片的編輯欄位。</p>
                  </div>
                ) : (
                  photoForms.map((form, index) => {
                    const activeCategoryName = resolveReceiptCategoryName(form, receiptCategories)
                    const formVendors = receiptCategories.find(c => c.name === activeCategoryName)?.vendors ?? []
                    const itemOptions = photoItemOptions(form.vendor_group)
                    const hasItemOptions = itemOptions.length > 0
                    const usesDirectPhotoItem = isDirectPhotoItemCategory(activeCategoryName)
                    const isBuyOrRepair = isBuyOrRepairCategory(activeCategoryName)
                    // 日常用品、加油／停車、退稅都直接讀取品項對應管理的同名群組。
                    // 買東西／維修則直接使用收據設定中的單據類型（發票、收據、估價單、其他）。
                    const directItemOptions = isBuyOrRepair
                      ? formVendors.map(v => ({ item_name: v.name, item_category: form.category }))
                      : usesDirectPhotoItem
                        ? photoItemOptions(activeCategoryName)
                        : []
                    const useVendorAsPhotoItem = shouldUseVendorAsItem(activeCategoryName, form.vendor_group)
                    const requiresPhotoItem = shouldRequireExplicitItem(activeCategoryName, form.vendor_group)
                    const formItems = getPhotoExpenseItems(form)
                    const taxMapping = shouldShowPhotoTaxAddon(activeCategoryName, form.doc_type)
                      ? mappingItems.find(mapping => mapping.is_tax_addon && mapping.vendor_group === form.vendor_group)
                      : undefined
                    const taxAmount = form.has_tax && taxMapping ? Number(form.tax_amount) || 0 : 0
                    const saved = !!form.savedExpenseId || formItems.some(item => !!item.savedExpenseId)
                    const expanded = !saved || expandedPhotoFormIds.includes(form.id)
                    const filledItems = formItems.filter(item => item.item_name.trim() || item.amount)
                    const displayName = useVendorAsPhotoItem
                      ? form.vendor_group
                      : (filledItems.map(item => item.item_name).filter(Boolean).slice(0, 2).join('、') || form.vendor_group)
                    const itemDisplayAmount = formItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
                    const displayAmount = itemDisplayAmount + taxAmount
                    if (!expanded) {
                      return (
                        <div key={form.id} className="rounded-2xl p-3 flex items-center gap-3"
                          style={{ background: '#fff', border: '1.5px solid #BBF7D0' }}>
                          <button type="button" onClick={() => setLightboxUrl(form.photoUrl)}
                            className="relative h-16 w-16 rounded-xl overflow-hidden shrink-0"
                            style={{ border: '1px solid #e4e4e7', background: '#f4f4f5' }}>
                            <SafePhotoImage src={form.photoUrl} alt={`支出照片 ${index + 1}`} thumb width={240} height={240} className="h-full w-full object-cover" />
                            <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full flex items-center justify-center"
                              style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}>
                              <ZoomIn className="h-3 w-3" />
                            </span>
                          </button>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                            style={{ background: CAT_COLORS[form.category]?.bg, color: CAT_COLORS[form.category]?.text }}>
                            {form.category}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold truncate" style={{ color: '#18181b' }}>
                              {displayName || `單據照片 ${index + 1}`}
                            </p>
                            <p className="text-[11px] truncate" style={{ color: '#a1a1aa' }}>
                              {[form.vendor_group, form.doc_type, filledItems.length > 1 ? `${filledItems.length} 項` : ''].filter(Boolean).join(' · ') || '已儲存'}
                            </p>
                          </div>
                          <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: '#18181b' }}>
                            ${fmt(displayAmount)}
                          </span>
                          <button type="button" onClick={() => setExpandedPhotoFormIds(prev => prev.includes(form.id) ? prev : [...prev, form.id])}
                            className="p-1.5 rounded-lg shrink-0"
                            style={{ background: '#f4f4f5', color: '#71717a', border: 'none' }}
                            aria-label="編輯此張">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => removeReceiptPhoto(form.photoUrl)}
                            className="p-1.5 rounded-lg shrink-0"
                            style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3' }}
                            aria-label="刪除照片">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )
                    }
                    return (
                      <div key={form.id} className="rounded-2xl p-3 md:p-4 space-y-3"
                        style={{ background: '#fff', border: `1.5px solid ${saved ? '#BBF7D0' : '#FDE68A'}` }}>
                        <div className="flex items-start gap-3">
                          <button type="button" onClick={() => setLightboxUrl(form.photoUrl)}
                            className="relative h-24 w-24 md:h-28 md:w-28 rounded-2xl overflow-hidden shrink-0"
                            style={{ border: '1px solid #e4e4e7', background: '#f4f4f5' }}>
                            <SafePhotoImage src={form.photoUrl} alt={`支出照片 ${index + 1}`} thumb width={240} height={240} className="h-full w-full object-cover" />
                            <span className="absolute bottom-1 right-1 h-7 w-7 rounded-full flex items-center justify-center"
                              style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}>
                              <ZoomIn className="h-3.5 w-3.5" />
                            </span>
                          </button>
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold" style={{ color: '#18181b' }}>單據照片 {index + 1}</p>
                              <div className="flex items-center gap-2">
                                {saved && (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: '#dcfce7', color: '#15803d' }}>
                                    已儲存
                                  </span>
                                )}
                                <button type="button" onClick={() => removeReceiptPhoto(form.photoUrl)}
                                  className="p-1.5 rounded-lg"
                                  style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3' }}
                                  aria-label="刪除照片">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <select className={INPUT} style={{ ...INPUT_STYLE, minWidth: 0, fontSize: 16 }}
                                value={activeCategoryName}
                                onChange={e => {
                                  const categoryName = e.target.value
                                  updatePhotoForm(form.id, {
                                    category: inferExpenseCategory(categoryName),
                                    category_name: categoryName,
                                    vendor_group: '',
                                    item_name: '',
                                    amount: '',
                                    items: [blankPhotoExpenseItem()],
                                    has_tax: false,
                                    tax_amount: '',
                                  })
                                }}>
                                <option value="">選擇類別</option>
                                {receiptCategories.map(c => (
                                  <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                              </select>
                              {usesDirectPhotoItem ? (
                                <select className={INPUT} style={{ ...INPUT_STYLE, minWidth: 0, fontSize: 16 }}
                                  value={isBuyOrRepair ? form.doc_type : (formItems[0]?.item_name ?? '')}
                                  disabled={!activeCategoryName}
                                  aria-label={isBuyOrRepair ? '選擇單據類型' : '選擇品項'}
                                  onChange={e => {
                                    const selected = e.target.value
                                    const selectedMapping = directItemOptions.find(item => item.item_name === selected)
                                    const first = formItems[0] ?? blankPhotoExpenseItem()
                                    const category = normalizeExpenseCategory(selectedMapping?.item_category) ?? form.category
                                    updatePhotoForm(form.id, {
                                      // 以類別名稱當 Excel 對應群組；右邊的選項就是實際品項。
                                      vendor_group: activeCategoryName,
                                      item_name: selected,
                                      amount: first.amount,
                                      items: [{ ...first, item_name: selected, category }],
                                      category,
                                      doc_type: isBuyOrRepair ? selected : form.doc_type,
                                      has_tax: isBuyOrRepair && selected !== '發票' ? false : form.has_tax,
                                      tax_amount: isBuyOrRepair && selected !== '發票' ? '' : form.tax_amount,
                                    })
                                  }}>
                                  <option value="">
                                    {!activeCategoryName
                                      ? '（先選類別）'
                                      : isBuyOrRepair
                                        ? '— 選擇單據類型 —'
                                        : activeCategoryName === '加油或停車'
                                          ? '— 選擇加油或停車 —'
                                          : activeCategoryName === '退稅'
                                            ? '— 選擇總發票-稅金 —'
                                            : '— 選擇品項 —'}
                                  </option>
                                  {directItemOptions.map(item => (
                                    <option key={item.item_name} value={item.item_name}>{item.item_name}</option>
                                  ))}
                                </select>
                              ) : (
                                <select className={INPUT} style={{ ...INPUT_STYLE, minWidth: 0, fontSize: 16 }}
                                  value={form.vendor_group}
                                  disabled={!activeCategoryName}
                                  onChange={e => {
                                    const vendor = e.target.value
                                    const vgRec = vendorGroups.find(g => g.name === vendor)
                                    updatePhotoForm(form.id, {
                                      vendor_group: vendor,
                                      item_name: '',
                                      amount: '',
                                      items: [blankPhotoExpenseItem()],
                                      doc_type: vgRec?.doc_type ?? form.doc_type,
                                      has_tax: false,
                                      tax_amount: '',
                                    })
                                  }}>
                                  <option value="">{activeCategoryName ? '— 選擇廠商/群組 —' : '（先選類別）'}</option>
                                  {formVendors.map(v => (
                                    <option key={v.id} value={v.name}>{v.name}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                            <div className="space-y-2">
                              {usesDirectPhotoItem ? (
                                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 items-start">
                                  <input type="number" min={isBuyOrRepair && form.doc_type === '其他' ? undefined : '0'} className={INPUT}
                                    style={{ ...INPUT_STYLE, minWidth: 0, textAlign: 'right', fontSize: 16 }}
                                    placeholder="金額"
                                    value={formItems[0]?.amount ?? ''}
                                    disabled={!activeCategoryName || !(isBuyOrRepair ? form.doc_type : formItems[0]?.item_name)}
                                    onChange={e => {
                                      const first = formItems[0] ?? blankPhotoExpenseItem()
                                      updatePhotoItem(form.id, first.id, { amount: e.target.value })
                                    }} />
                                  {isBuyOrRepair && form.doc_type === '其他' && (
                                    <button type="button"
                                      disabled={!formItems[0]?.amount}
                                      onClick={() => {
                                        const first = formItems[0] ?? blankPhotoExpenseItem()
                                        const value = Number(first.amount) || 0
                                        updatePhotoItem(form.id, first.id, { amount: String(value > 0 ? -value : Math.abs(value)) })
                                      }}
                                      className="h-10 px-4 rounded-xl text-sm font-semibold"
                                      style={{
                                        background: formItems[0]?.amount ? '#ecfdf5' : '#f4f4f5',
                                        color: formItems[0]?.amount ? '#047857' : '#a1a1aa',
                                        border: `1px solid ${formItems[0]?.amount ? '#86efac' : '#e4e4e7'}`,
                                      }}>
                                      {(Number(formItems[0]?.amount) || 0) < 0 ? '轉正' : '轉負'}
                                    </button>
                                  )}
                                </div>
                              ) : formItems.map((line, lineIndex) => (
                                <div key={line.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(112px,150px)_auto] gap-2 items-start">
                                  <div className="min-w-0 space-y-1">
                                    {useVendorAsPhotoItem ? (
                                      <div className="rounded-xl px-3 py-2"
                                        style={{ background: '#f8fafc', border: '1px solid #e4e4e7', color: '#52525b' }}>
                                        <p className="text-[11px] font-semibold" style={{ color: '#a1a1aa' }}>品項 {lineIndex + 1}</p>
                                        <p className="text-sm font-bold truncate">
                                          {form.vendor_group ? `${form.vendor_group}（自動帶入）` : '選擇廠商後自動帶入'}
                                        </p>
                                      </div>
                                    ) : (
                                      <select className={INPUT} style={{ ...INPUT_STYLE, minWidth: 0, fontSize: 16 }}
                                        value={line.item_name}
                                        disabled={!activeCategoryName || !form.vendor_group}
                                        onChange={e => {
                                          const itemName = e.target.value
                                          const mapped = itemOptions.find(item => item.item_name === itemName)
                                          const category = (mapped?.item_category === '食材' || mapped?.item_category === '耗材' || mapped?.item_category === '雜項')
                                            ? mapped.item_category as '食材' | '耗材' | '雜項'
                                            : line.category ?? form.category
                                          updatePhotoItem(form.id, line.id, { item_name: itemName, category })
                                        }}>
                                        <option value="">{!activeCategoryName ? '（先選類別）' : form.vendor_group ? `— 選擇品項 ${lineIndex + 1} —` : '（先選廠商）'}</option>
                                        {form.vendor_group && hasItemOptions
                                          ? itemOptions.map(item => <option key={item.item_name} value={item.item_name}>{item.item_name}</option>)
                                          : form.vendor_group && !requiresPhotoItem && <option value={form.vendor_group}>{form.vendor_group}</option>
                                        }
                                      </select>
                                    )}
                                  </div>
                                  <input type="number" min="0" className={INPUT}
                                    style={{ ...INPUT_STYLE, minWidth: 0, textAlign: 'right', fontSize: 16 }}
                                    placeholder="金額"
                                    value={line.amount}
                                    onChange={e => updatePhotoItem(form.id, line.id, { amount: e.target.value })} />
                                  <button type="button" onClick={() => removePhotoItem(form.id, line.id)}
                                    disabled={formItems.length <= 1}
                                    className="h-10 px-3 rounded-xl text-sm font-semibold"
                                    style={{
                                      background: formItems.length <= 1 ? '#f4f4f5' : '#fff1f2',
                                      color: formItems.length <= 1 ? '#d4d4d8' : '#e11d48',
                                      border: formItems.length <= 1 ? '1px solid #e4e4e7' : '1px solid #fecdd3',
                                    }}>
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                              {form.vendor_group && !hasItemOptions && !useVendorAsPhotoItem && !requiresPhotoItem && (
                                <p className="text-xs text-zinc-400">此廠商尚未設定細項，會以廠商名稱作為品項。</p>
                              )}
                              {form.vendor_group && requiresPhotoItem && !hasItemOptions && (
                                <p className="text-xs text-rose-500">此廠商需要選擇品項，請先在品項管理新增可選品項。</p>
                              )}
                              {!useVendorAsPhotoItem && !usesDirectPhotoItem && (
                                <button type="button" onClick={() => addPhotoItem(form.id)}
                                  disabled={!activeCategoryName || !form.vendor_group}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
                                  style={{
                                    background: activeCategoryName && form.vendor_group ? '#fff7ed' : '#f4f4f5',
                                    color: activeCategoryName && form.vendor_group ? '#c2410c' : '#a1a1aa',
                                    border: activeCategoryName && form.vendor_group ? '1px solid #fed7aa' : '1px solid #e4e4e7',
                                  }}>
                                  <Plus className="h-4 w-4" />
                                  新增品項
                                </button>
                              )}
                              {taxMapping && (
                                <div className="rounded-2xl p-3" style={{ background: '#fff7ed', border: '1.5px solid #fb923c' }}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-bold" style={{ color: '#9a3412' }}>稅外加</p>
                                      <p className="text-[11px]" style={{ color: '#c2410c' }}>稅金由結帳人員依發票自行填寫，將自動歸入「{taxMapping.item_name}」。</p>
                                    </div>
                                    <button type="button" onClick={() => updatePhotoForm(form.id, { has_tax: !form.has_tax, tax_amount: form.has_tax ? '' : form.tax_amount })}
                                      className="px-3 py-2 rounded-full text-xs font-bold shrink-0"
                                      style={{ background: form.has_tax ? '#f97316' : 'white', color: form.has_tax ? 'white' : '#9a3412', border: '1.5px solid #fb923c' }}>
                                      {form.has_tax ? '已開啟' : '開啟'}
                                    </button>
                                  </div>
                                  {form.has_tax && (
                                    <input type="number" min={0} inputMode="numeric" placeholder="自行輸入稅金金額"
                                      value={form.tax_amount || ''}
                                      onChange={event => updatePhotoForm(form.id, { tax_amount: event.target.value })}
                                      className="mt-3 w-full rounded-xl px-3 py-2 text-right text-base font-bold outline-none"
                                      style={{ border: '1.5px solid #fb923c', background: 'white', color: '#9a3412' }} />
                                  )}
                                </div>
                              )}
                              <div className="flex items-center justify-between rounded-xl px-3 py-2.5"
                                style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                                <span className="text-sm font-semibold" style={{ color: '#9a3412' }}>本張單據品項合計</span>
                                <span className="text-lg font-extrabold tabular-nums" style={{ color: '#c2410c' }}>${fmt(displayAmount)}</span>
                              </div>
                              {taxAmount > 0 && (
                                <p className="text-xs font-bold text-right" style={{ color: '#9a3412' }}>
                                  商品 ${fmt(itemDisplayAmount)} ＋ 稅金 ${fmt(taxAmount)} ＝ ${fmt(displayAmount)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        {form.vendor_group && !hasItemOptions && (
                          <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
                            此群組尚未設定細項，會先以「{form.vendor_group}」作為品項名稱。
                          </p>
                        )}
                        <textarea className={INPUT} style={{ ...INPUT_STYLE, minHeight: 74, resize: 'vertical', fontSize: 16 }}
                          placeholder="備註（選填，會顯示在 Excel 附註）"
                          value={form.note}
                          onChange={e => updatePhotoForm(form.id, { note: e.target.value })} />
                        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2">
                          <input className={INPUT} style={{ ...INPUT_STYLE, minWidth: 0, fontSize: 16 }}
                            placeholder="誰付（選填）"
                            value={form.payer_name}
                            onChange={e => updatePhotoForm(form.id, { payer_name: e.target.value })} />
                          <button type="button" onClick={() => savePhotoExpense(form)}
                            className="flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white"
                            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)' }}>
                            <Save className="h-3.5 w-3.5" />
                            {saved ? '更新此張' : '儲存此張'}
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-3" style={{ background: '#fafafa', borderTop: '1px solid #f4f4f5' }}>
              <span className="text-xs font-bold uppercase" style={{ color: '#a1a1aa' }}>支出合計</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#dc2626' }}>${fmt(expenseTotal)}</span>
            </div>
          </div>
        )}
      </div>
      )}

      {/* 圖片 Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxUrl(null)}>
          <button type="button" onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>
            <X className="h-5 w-5" />
          </button>
          <SafePhotoImage src={lightboxUrl} alt="收據" loading="eager" className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* 貨款代墊人 + 備註 */}
      {currentStep === 3 && !isLocked && (
        <div className="bg-white rounded-2xl px-4 py-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#52525b' }}>今日貨款代墊人</label>
            <p className="text-[11px] mb-1.5" style={{ color: '#a1a1aa' }}>今日支出由誰先墊付，總公司隔天補款給此人</p>
            <input className={INPUT} style={INPUT_STYLE} placeholder="如：世輝"
              value={payerName} onChange={e => setPayerName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>備註</label>
            <input className={INPUT} style={INPUT_STYLE} placeholder="其他備註"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
      )}
      {currentStep === 4 && !isLocked && (
        <div className="bg-white rounded-3xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 10px 30px rgba(15,23,42,0.04)' }}>
          <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
            <span className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: '#FFFBEB', color: '#F97316' }}>
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold" style={{ color: '#18181b' }}>送出前確認</h3>
              <p className="text-xs" style={{ color: '#a1a1aa' }}>請確認叫貨、支出、照片與代墊人都正確。</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-4" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <p className="text-xs font-semibold" style={{ color: '#16a34a' }}>今日營業額</p>
                <p className="text-2xl font-extrabold tabular-nums" style={{ color: '#15803d' }}>${fmt(revenueTotal)}</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                <p className="text-xs font-semibold" style={{ color: '#ea580c' }}>今日支出</p>
                <p className="text-2xl font-extrabold tabular-nums" style={{ color: '#f97316' }}>${fmt(expenseTotal)}</p>
              </div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: balance >= 0 ? '#FFFBEB' : '#fff1f2', border: `1px solid ${balance >= 0 ? '#FDE68A' : '#fecdd3'}` }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>今日結餘</p>
                  <p className="text-sm" style={{ color: '#71717a' }}>營業額 - 支出</p>
                </div>
                <p className="text-3xl font-extrabold tabular-nums" style={{ color: balance >= 0 ? '#92400E' : '#be123c' }}>${fmt(balance)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl p-4" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>支出單據</p>
                <p className="font-bold" style={{ color: '#18181b' }}>{expensesForSave.length} 筆 · {photoUrls.length} 張照片</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>貨款代墊人</p>
                <p className="font-bold" style={{ color: payerName ? '#18181b' : '#a1a1aa' }}>{payerName || '未填寫'}</p>
              </div>
            </div>
            {expensesForSave.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                {expensesForSave.slice(0, 6).map(e => (
                  <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm" style={{ borderBottom: '1px solid #f9f9f9' }}>
                    <span className="font-semibold min-w-0 truncate" style={{ color: '#18181b' }}>{e.item_name}</span>
                    <span className="font-bold tabular-nums shrink-0" style={{ color: '#dc2626' }}>${fmt(e.amount)}</span>
                  </div>
                ))}
                {expensesForSave.length > 6 && (
                  <p className="px-4 py-2 text-xs text-center" style={{ color: '#a1a1aa' }}>還有 {expensesForSave.length - 6} 筆支出</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {isLocked && (payerName || note) && (
        <div className="bg-white rounded-2xl px-4 py-4 space-y-2" style={{ border: '1px solid #f4f4f5' }}>
          {payerName && <p className="text-sm" style={{ color: '#18181b' }}>貨款代墊：<b>{payerName}</b></p>}
          {note && <p className="text-sm" style={{ color: '#52525b' }}>{note}</p>}
        </div>
      )}

      {/* 操作按鈕 */}
      {!isLocked && (
        <div className="sticky manager-sticky-action-bar -mx-4 px-4 py-3 flex gap-3"
          style={{ background: 'rgba(250,250,250,0.94)', backdropFilter: 'blur(16px)', borderTop: '1px solid #f4f4f5' }}>
          {currentStep > 1 && (
            <button type="button" onClick={goPrev}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-sm font-semibold"
              style={{ background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b' }}>
              <ArrowLeft className="h-4 w-4" />
              上一步
            </button>
          )}
          <button type="button" onClick={() => handleSave(false)} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold"
            style={{ background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b' }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            儲存草稿
          </button>
          {currentStep < 4 ? (
            <button type="button" onClick={goNext} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              儲存並下一步
            </button>
          ) : (
          <button type="button" onClick={() => handleSave(true)} disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            送出今日帳目
          </button>
          )}
        </div>
      )}
    </div>
  )
}
