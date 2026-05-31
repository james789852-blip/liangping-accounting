'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Store, CKPrice } from '@/lib/types'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Save, Send, Calculator, Package, Banknote, BarChart3, Loader2, Trash2, Plus, Wallet, X, Video, AlertCircle, CheckCircle2, RefreshCw, Camera, Pencil, UploadCloud, FileText, Sparkles } from 'lucide-react'
import VideoUploader from '@/components/manager/video-uploader'
import { saveCashCounts } from '@/app/actions/closings'

interface TodayReceipt {
  id: string
  vendor_name: string
  total_amount: number
  tax_amount?: number
  receipt_type: string
  photo_url?: string
  receipt_items?: { item_name: string; amount: number }[]
}

interface ChannelPhoto {
  previewUrl?: string
  publicUrl?: string
  status: 'idle' | 'uploading' | 'verifying' | 'matched' | 'mismatch' | 'uploaded'
  recognized?: number
}

const RECEIPT_CATEGORIES = ['菜商', '豆腐', '蛋商', '雜貨', '免洗', '瓦斯', '水電', '房租', '其他']

interface ReceiptForm {
  id: string
  file?: File
  previewUrl?: string
  category: string
  vendor_name: string
  total_amount: number
  has_tax: boolean
  tax_amount: number
  notes: string
  uploading: boolean
}

interface AIItem {
  key: string
  type: 'receipt' | 'channel'
  label: string
  photoUrl: string
  inputAmount: number
  recognized: number
  matched: boolean
  accepted: boolean
  checking: boolean
}

function isCKReceipt(receipt: TodayReceipt, ckPrices: CKPrice[]): boolean {
  if (!receipt.receipt_items || receipt.receipt_items.length === 0) return false
  const ckNames = ckPrices.map(p => p.item_name)
  return receipt.receipt_items.some(item =>
    ckNames.some(ck => item.item_name === ck || item.item_name.includes(ck) || ck.includes(item.item_name))
  )
}

interface Props {
  store: Store
  ckPrices: CKPrice[]
  existingClosing: any
  userId: string
  today: string
  todayReceipts?: TodayReceipt[]
}

interface FormData {
  pos_cash: number
  uber_amounts: Record<string, number>
  panda_amount: number
  twpay_amount: number
  online_amount: number
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

function initFormData(store: Store, ckPrices: CKPrice[], existing: any, todayReceipts?: TodayReceipt[]): FormData {
  const uber_amounts: Record<string, number> = {}
  ;(store.uber_accounts ?? []).forEach(acc => { uber_amounts[acc] = 0 })

  if (!existing) {
    const ck_total = todayReceipts
      ? todayReceipts.filter(r => isCKReceipt(r, ckPrices)).reduce((s, r) => s + r.total_amount, 0)
      : 0
    return {
      pos_cash: 0, uber_amounts, panda_amount: 0, twpay_amount: 0,
      online_amount: 0, ck_total,
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
  const ckSingle = orders.find((x: any) => x.item_name === '央廚配送')
  const ckFromSaved = ckSingle
    ? (ckSingle.total_amount ?? 0)
    : orders.filter((x: any) => x.vendor === '央廚').reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const ck_total = ckFromReceipts !== null ? ckFromReceipts : ckFromSaved

  return {
    pos_cash: rev.find((x: any) => x.channel === 'pos')?.gross_amount ?? 0,
    uber_amounts,
    panda_amount: rev.find((x: any) => x.channel === 'panda')?.gross_amount ?? 0,
    twpay_amount: rev.find((x: any) => x.channel === 'twpay')?.gross_amount ?? 0,
    online_amount: rev.find((x: any) => x.channel === 'online')?.gross_amount ?? 0,
    ck_total,
    bills_1000: cash.bills_1000 ?? 0, bills_500: cash.bills_500 ?? 0, bills_100: cash.bills_100 ?? 0,
    coins_50: cash.coins_50 ?? 0, coins_10: cash.coins_10 ?? 0, coins_5: cash.coins_5 ?? 0, coins_1: cash.coins_1 ?? 0,
    lump_1000: cash.lump_1000 ?? 0, lump_500: cash.lump_500 ?? 0, lump_100: cash.lump_100 ?? 0,
    lump_50: cash.lump_50 ?? 0, lump_10: cash.lump_10 ?? 0, lump_5: cash.lump_5 ?? 0, lump_1: cash.lump_1 ?? 0,
    note: existing.note ?? '',
  }
}

function initExpenses(existing: any, ckPrices: CKPrice[], todayReceipts?: TodayReceipt[]): Expense[] {
  const fromDB = (existing?.expense_items ?? []).map((e: any) => ({
    id: e.id, description: e.description, amount: e.amount,
  }))
  if (fromDB.length > 0) return fromDB
  if (todayReceipts && todayReceipts.length > 0) {
    return todayReceipts
      .filter(r => !isCKReceipt(r, ckPrices))
      .map(r => ({
        id: crypto.randomUUID(),
        description: r.vendor_name || '（未填廠商）',
        amount: r.total_amount,
      }))
  }
  return []
}

function receiptsToExpenses(receipts: TodayReceipt[], ckPrices: CKPrice[]): Expense[] {
  return receipts
    .filter(r => !isCKReceipt(r, ckPrices))
    .map(r => ({
      id: crypto.randomUUID(),
      description: r.vendor_name || '（未填廠商）',
      amount: r.total_amount,
    }))
}

function initHandwriteOrders(existing: any): HandwriteOrder[] {
  return (existing?.handwrite_orders ?? []).map((o: any) => ({
    id: o.id, order_number: o.order_number, amount: o.amount,
    voided: o.voided ?? false, void_reason: o.void_reason ?? '',
  }))
}

function calcSummary(data: FormData, store: Store, ckPrices: CKPrice[], totalExpenses: number, handwriteTotal: number) {
  const uberTotal = Object.values(data.uber_amounts).reduce((a, b) => a + b, 0)
  const platformTotal = uberTotal + data.panda_amount + data.twpay_amount + data.online_amount

  const totalRevenue = store.ichef_uber_linked
    ? data.pos_cash
    : data.pos_cash + handwriteTotal + platformTotal

  const deliveryFee = data.ck_total
  const shouldEnvelope = totalRevenue - platformTotal - totalExpenses
  const netToHQ = shouldEnvelope - deliveryFee

  const cashTotal =
    (data.bills_1000 * 1000 + data.lump_1000) +
    (data.bills_500  * 500  + data.lump_500)  +
    (data.bills_100  * 100  + data.lump_100)  +
    (data.coins_50   * 50   + data.lump_50)   +
    (data.coins_10   * 10   + data.lump_10)   +
    (data.coins_5    * 5    + data.lump_5)    +
    (data.coins_1    * 1    + data.lump_1)

  const actualRemit = cashTotal - store.petty_cash
  const variance = actualRemit - shouldEnvelope
  const storeRevenue = totalRevenue - platformTotal
  return { totalRevenue, platformTotal, storeRevenue, deliveryFee, totalExpenses, shouldEnvelope, netToHQ, cashTotal, actualRemit, variance }
}

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

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
  value, onChange, placeholder = '0', disabled, step, textRight = true, onKeyDown,
}: {
  value: number | string; onChange: (v: number) => void; placeholder?: string
  disabled?: boolean; step?: string; textRight?: boolean; onKeyDown?: React.KeyboardEventHandler
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type="number" min="0" inputMode="numeric" disabled={disabled} step={step}
      style={{
        padding: '10px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px',
        fontSize: '14px', background: disabled ? '#fafafa' : 'white', outline: 'none',
        fontFamily: 'inherit', width: '100%', fontVariantNumeric: 'tabular-nums',
        textAlign: textRight ? 'right' : 'left',
        borderColor: focused ? '#6366f1' : '#e4e4e7',
        boxShadow: focused ? '0 0 0 4px rgba(99,102,241,0.1)' : 'none',
        color: '#18181b', opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'auto',
      }}
      value={typeof value === 'number' ? (value === 0 ? '' : value) : value}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
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
        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
        {title}
      </h2>
      <p className="text-sm" style={{ color: '#52525b' }}>{desc}</p>
    </div>
  )
}

function PlatformRow({ channelKey, name, hint, value, onChange, disabled, photo, onPhotoClick }: {
  channelKey: string; name: string; hint?: string; value: number
  onChange: (v: number) => void; disabled?: boolean
  photo?: ChannelPhoto; onPhotoClick?: () => void
}) {
  const isUploading = photo?.status === 'uploading'
  const hasPhoto = photo && photo.status === 'uploaded' && photo.previewUrl

  return (
    <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f4f4f5' }}>
      <div className="flex justify-between items-center mb-3">
        <span style={{ fontWeight: 600, fontSize: '14px', color: '#18181b' }}>{name}</span>
        {hint && <span style={{ fontSize: '11px', color: '#a1a1aa' }}>{hint}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '10px', alignItems: 'center' }}>
        <input type="number" min="0" inputMode="numeric" disabled={disabled}
          style={{ padding: '12px 14px', border: '1.5px solid #e4e4e7', borderRadius: '12px', fontSize: '20px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit', background: disabled ? '#fafafa' : '#f8fafc', outline: 'none', color: '#18181b', opacity: disabled ? 0.7 : 1, width: '100%', boxSizing: 'border-box' }}
          value={value || ''} placeholder="0"
          onChange={e => onChange(parseInt(e.target.value) || 0)} />

        <button type="button" onClick={disabled ? undefined : onPhotoClick} disabled={disabled || isUploading}
          style={{
            height: '56px', borderRadius: '12px', border: hasPhoto ? '2px solid #10b981' : '2px dashed #e4e4e7',
            background: hasPhoto ? '#ecfdf5' : '#f8fafc', cursor: disabled ? 'default' : 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '2px', fontSize: '10px', fontWeight: 600, color: hasPhoto ? '#047857' : '#a1a1aa',
            position: 'relative', overflow: 'hidden',
          }}>
          {hasPhoto && <img src={photo!.previewUrl} alt="preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.25 }} />}
          <span style={{ position: 'relative' }}>
            {isUploading ? <Loader2 style={{ width: '18px', height: '18px' }} className="animate-spin" />
              : hasPhoto ? <CheckCircle2 style={{ width: '18px', height: '18px' }} />
              : <Camera style={{ width: '18px', height: '18px' }} />}
          </span>
          <span style={{ position: 'relative' }}>{isUploading ? '上傳中' : hasPhoto ? '已存' : '存證'}</span>
        </button>
      </div>
    </div>
  )
}

function SummaryBlock({ label, value, warm }: { label: string; value: string; warm?: boolean }) {
  return (
    <div className="flex justify-between items-center mt-4 rounded-2xl px-4 py-3"
      style={{ background: warm ? 'linear-gradient(135deg,#ffedd5,#fffbeb)' : 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
      <span className="text-sm font-medium" style={{ color: warm ? '#7c2d12' : '#312e81' }}>{label}</span>
      <span className="text-2xl font-extrabold tabular-nums" style={{ color: warm ? '#c2410c' : '#4338ca' }}>{value}</span>
    </div>
  )
}

export default function ClosingForm({ store, ckPrices, existingClosing, userId, today, todayReceipts = [] }: Props) {
  const [data, setData] = useState<FormData>(() => initFormData(store, ckPrices, existingClosing, todayReceipts))
  const [expenses, setExpenses] = useState<Expense[]>(() => initExpenses(existingClosing, ckPrices, todayReceipts))
  const [localReceipts, setLocalReceipts] = useState<TodayReceipt[]>(todayReceipts)
  const [syncing, setSyncing] = useState(false)
  const [channelPhotos, setChannelPhotos] = useState<Record<string, ChannelPhoto>>({})
  const currentUploadChannelRef = useRef<{ key: string; amount: number } | null>(null)
  const channelFileRef = useRef<HTMLInputElement>(null)
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null)
  const [editVendor, setEditVendor] = useState('')
  const [editAmount, setEditAmount] = useState(0)
  const [editItems, setEditItems] = useState<{ item_name: string; amount: number }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [receiptForms, setReceiptForms] = useState<ReceiptForm[]>([])
  const [aiItems, setAiItems] = useState<AIItem[]>([])
  const [aiRunning, setAiRunning] = useState(false)
  const [aiTriggered, setAiTriggered] = useState(false)
  const STORAGE_KEY = `receipt-categories-${store.id}`
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
  })
  const [addingCatForId, setAddingCatForId] = useState<string | null>(null)
  const [newCatText, setNewCatText] = useState('')
  const allCategories = [...RECEIPT_CATEGORIES, ...customCategories]
  const [handwriteOrders, setHandwriteOrders] = useState<HandwriteOrder[]>(() => initHandwriteOrders(existingClosing))
  const [currentStep, setCurrentStep] = useState(0)
  const [submitDone, setSubmitDone] = useState(false)
  const [pettyCounts, setPettyCounts] = useState<Record<string, number>>({})
  const [pettyLumps, setPettyLumps] = useState<Record<string, number>>({})
  const [newOrderNum, setNewOrderNum] = useState('')
  const [newOrderAmt, setNewOrderAmt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(existingClosing?.id ?? null)
  const [status, setStatus] = useState(existingClosing?.status ?? 'draft')
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(0)
  const router = useRouter()
  const newOrderNumRef = useRef<HTMLInputElement>(null)
  const newOrderAmtRef = useRef<HTMLInputElement>(null)
  const amtRefsMap = useRef<Map<string, HTMLInputElement>>(new Map())
  const dataRef = useRef(data)
  dataRef.current = data

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const handwriteTotal = handwriteOrders.reduce((s, o) => s + (o.voided ? 0 : (o.amount || 0)), 0)
  const s = calcSummary(data, store, ckPrices, totalExpenses, handwriteTotal)
  const isLocked = (status === 'submitted' || status === 'verified') && !submitDone
  const isDisputed = status === 'disputed'
  const disputeNote = existingClosing?.dispute_note ?? ''

  const absVar = Math.abs(s.variance)
  const varColor = absVar === 0 ? '#047857' : absVar <= 200 ? '#b45309' : '#be123c'
  const varBg    = absVar === 0 ? '#d1fae5' : absVar <= 200 ? '#fef3c7' : '#ffe4e6'
  const varBorder = absVar === 0 ? '#6ee7b7' : absVar <= 200 ? '#fcd34d' : '#fda4af'
  const varMsg   = absVar === 0 ? '完美對帳！✓' : absVar <= 200 ? '差距微小，請確認' : '差距過大，請重新核查'

  const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    draft:     { bg: '#f4f4f5', color: '#71717a', label: '草稿' },
    submitted: { bg: '#eef2ff', color: '#4338ca', label: '已送出' },
    verified:  { bg: '#d1fae5', color: '#047857', label: '已審核' },
    disputed:  { bg: '#ffe4e6', color: '#be123c', label: '退回修改' },
  }
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.draft

  const set = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setData(prev => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    if (isLocked || submitDone) return
    const t = setInterval(() => handleSave(true), 60000)
    return () => clearInterval(t)
  }, [data, expenses, handwriteOrders, isLocked, isDisputed, submitDone])

  useEffect(() => {
    if (isLocked) return
    async function autoSyncCK() {
      if (document.hidden) return
      const supabase = createClient()
      const { data: receipts } = await supabase
        .from('receipts')
        .select('id, vendor_name, total_amount, tax_amount, receipt_type, photo_url, receipt_items(item_name, amount)')
        .eq('store_id', store.id)
        .eq('business_date', today)
      if (!receipts) return
      const ckTotal = (receipts as TodayReceipt[])
        .filter(r => isCKReceipt(r, ckPrices))
        .reduce((s, r) => s + r.total_amount, 0)
      set('ck_total', ckTotal)
    }
    document.addEventListener('visibilitychange', autoSyncCK)
    return () => document.removeEventListener('visibilitychange', autoSyncCK)
  }, [isLocked, store.id, today, ckPrices, set])




  async function syncFromReceipts() {
    setSyncing(true)
    const supabase = createClient()
    const { data: receipts } = await supabase
      .from('receipts')
      .select('id, vendor_name, total_amount, tax_amount, receipt_type, photo_url, receipt_items(item_name, amount)')
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
    const oldReceipt = localReceipts.find(r => r.id === editingReceiptId)
    if (!oldReceipt) return
    const validItems = editItems.filter(i => i.item_name.trim())
    const updatedReceipts = localReceipts.map(r =>
      r.id === editingReceiptId ? { ...r, vendor_name: editVendor, total_amount: editAmount, receipt_items: validItems } : r
    )
    setLocalReceipts(updatedReceipts)
    const oldKey = oldReceipt.vendor_name || '（未填廠商）'
    setExpenses(prev => prev.map(e =>
      e.description === oldKey ? { ...e, description: editVendor || '（未填廠商）', amount: editAmount } : e
    ))
    const ckTotal = updatedReceipts.filter(r => isCKReceipt(r, ckPrices)).reduce((s, r) => s + r.total_amount, 0)
    set('ck_total', ckTotal)
    const supabase = createClient()
    await supabase.from('receipts').update({ vendor_name: editVendor, total_amount: editAmount }).eq('id', editingReceiptId)
    await supabase.from('receipt_items').delete().eq('receipt_id', editingReceiptId)
    if (validItems.length > 0) {
      await supabase.from('receipt_items').insert(
        validItems.map(i => ({ receipt_id: editingReceiptId, item_name: i.item_name, amount: i.amount, item_category: '食材', excel_column: '' }))
      )
    }
    setEditingReceiptId(null)
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
      total_amount: 0,
      has_tax: false,
      tax_amount: 0,
      notes: '',
      uploading: false,
    }))
    setReceiptForms(prev => [...prev, ...newForms])
  }

  function addNoPhotoReceipt() {
    setReceiptForms(prev => [...prev, {
      id: crypto.randomUUID(),
      category: '',
      vendor_name: '',
      total_amount: 0,
      has_tax: false,
      tax_amount: 0,
      notes: '',
      uploading: false,
    }])
  }

  function updateReceiptForm(id: string, field: keyof ReceiptForm, value: any) {
    setReceiptForms(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f))
  }

  function confirmNewCategory(formId: string) {
    const cat = newCatText.trim()
    if (!cat) { setAddingCatForId(null); setNewCatText(''); return }
    if (!allCategories.includes(cat)) {
      const updated = [...customCategories, cat]
      setCustomCategories(updated)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch {}
    }
    updateReceiptForm(formId, 'category', cat)
    setAddingCatForId(null)
    setNewCatText('')
  }

  function removeReceiptForm(id: string) {
    setReceiptForms(prev => {
      const form = prev.find(f => f.id === id)
      if (form?.previewUrl) URL.revokeObjectURL(form.previewUrl)
      return prev.filter(f => f.id !== id)
    })
  }

  async function saveReceiptForm(form: ReceiptForm) {
    if (!form.vendor_name.trim() || form.total_amount <= 0) {
      toast.error('請填寫廠商名稱與金額')
      return
    }
    setReceiptForms(prev => prev.map(f => f.id === form.id ? { ...f, uploading: true } : f))
    const supabase = createClient()
    let photo_url = ''
    if (form.file) {
      const ext = form.file.name.split('.').pop() || 'jpg'
      const path = `receipts/${store.id}/${today}/${form.id}.${ext}`
      const { error } = await supabase.storage.from('receipts').upload(path, form.file, { upsert: true })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
        photo_url = publicUrl
      }
    }
    const finalTotal = form.has_tax ? form.total_amount + form.tax_amount : form.total_amount
    const { data: saved, error } = await supabase.from('receipts').insert({
      store_id: store.id,
      business_date: today,
      vendor_name: form.vendor_name.trim(),
      receipt_type: 'receipt',
      total_amount: finalTotal,
      tax_amount: form.has_tax ? form.tax_amount : 0,
      photo_url: photo_url || null,
    }).select('id').single()
    if (error) {
      toast.error('儲存失敗：' + error.message)
      setReceiptForms(prev => prev.map(f => f.id === form.id ? { ...f, uploading: false } : f))
      return
    }
    const newR: TodayReceipt = {
      id: saved.id,
      vendor_name: form.vendor_name.trim(),
      total_amount: finalTotal,
      tax_amount: form.has_tax ? form.tax_amount : 0,
      receipt_type: 'receipt',
      photo_url,
      receipt_items: [],
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

  async function startAIVerification() {
    setAiTriggered(true)
    const items: AIItem[] = []

    for (const r of localReceipts.filter(r => r.photo_url)) {
      items.push({ key: r.id, type: 'receipt', label: `${r.vendor_name || '收據'}`, photoUrl: r.photo_url!, inputAmount: r.total_amount, recognized: 0, matched: false, accepted: false, checking: true })
    }

    const channelLabelMap: Record<string, { label: string; amount: number }> = {}
    if (store.mode !== 'handwrite') channelLabelMap['pos'] = { label: store.ichef_uber_linked ? 'iChef 結帳總金額' : 'iChef 現場 POS', amount: dataRef.current.pos_cash }
    ;(store.uber_accounts ?? []).forEach(acc => { channelLabelMap[`uber_${acc}`] = { label: `Uber Eats${(store.uber_accounts ?? []).length > 1 ? ' — ' + acc : ''}`, amount: dataRef.current.uber_amounts[acc] ?? 0 } })
    if (store.panda_enabled) channelLabelMap['panda'] = { label: '熊貓 foodpanda', amount: dataRef.current.panda_amount }
    if (store.twpay_enabled) channelLabelMap['twpay'] = { label: '台灣 Pay', amount: dataRef.current.twpay_amount }
    if (store.online_enabled) channelLabelMap['online'] = { label: '線上點餐', amount: dataRef.current.online_amount }

    for (const [key, photo] of Object.entries(channelPhotos)) {
      if (photo.publicUrl && channelLabelMap[key]) {
        const info = channelLabelMap[key]
        items.push({ key, type: 'channel', label: info.label, photoUrl: photo.publicUrl, inputAmount: info.amount, recognized: 0, matched: false, accepted: false, checking: true })
      }
    }

    if (items.length === 0) return
    setAiItems(items)
    setAiRunning(true)

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      try {
        const res = await fetch('/api/recognize-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: item.photoUrl }),
        })
        const result = await res.json()
        const recognized = result.total_amount ?? 0
        const diff = Math.abs(recognized - item.inputAmount)
        const matched = recognized > 0 && diff <= Math.max(item.inputAmount * 0.03, 100)
        setAiItems(prev => prev.map((a, idx) => idx === i ? { ...a, recognized, matched, checking: false } : a))
      } catch {
        setAiItems(prev => prev.map((a, idx) => idx === i ? { ...a, recognized: 0, matched: true, checking: false } : a))
      }
    }
    setAiRunning(false)
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

    const supabase = createClient()
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `revenue-photos/${store.id}/${today}/${key}.${ext}`
    const { error: upErr } = await supabase.storage.from('receipts').upload(path, file, { upsert: true })
    if (upErr) {
      toast.error('照片上傳失敗')
      setChannelPhotos(prev => ({ ...prev, [key]: { previewUrl, status: 'idle' } }))
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
    setChannelPhotos(prev => ({ ...prev, [key]: { previewUrl, publicUrl, status: 'uploaded' } }))
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
    setNewOrderNum('')
    setNewOrderAmt(0)
    setTimeout(() => newOrderNumRef.current?.focus(), 50)
  }

  function generateRange() {
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) { toast.error('請輸入有效的起始和結束單號'); return }
    if (rangeEnd - rangeStart > 200) { toast.error('單次最多建立 200 筆'); return }
    const existingNums = new Set(handwriteOrders.map(o => o.order_number))
    const newOrders: HandwriteOrder[] = []
    for (let n = rangeStart; n <= rangeEnd; n++) {
      if (!existingNums.has(String(n)))
        newOrders.push({ id: crypto.randomUUID(), order_number: String(n), amount: 0, voided: false, void_reason: '' })
    }
    if (newOrders.length === 0) { toast.info('該範圍內的單號已全部存在'); return }
    setHandwriteOrders(prev => [...prev, ...newOrders])
    toast.success(`已建立 ${newOrders.length} 筆單號`)
  }

  function updateHandwriteOrderAmount(id: string, amount: number) {
    setHandwriteOrders(prev => prev.map(o => o.id === id ? { ...o, amount } : o))
  }
  function toggleVoidOrder(id: string) {
    setHandwriteOrders(prev => prev.map(o => o.id === id ? { ...o, voided: !o.voided } : o))
  }
  function updateVoidReason(id: string, reason: string) {
    setHandwriteOrders(prev => prev.map(o => o.id === id ? { ...o, void_reason: reason } : o))
  }
  function removeHandwriteOrder(id: string) {
    setHandwriteOrders(prev => prev.filter(o => o.id !== id))
  }

  async function handleSave(silent = false) {
    if (status === 'submitted' || status === 'verified') return null
    setSaving(true)
    const supabase = createClient()
    const d = dataRef.current
    try {
      let cid = closingId
      const payload = {
        store_id: store.id, manager_id: userId, business_date: today, status: isDisputed ? 'disputed' : 'draft',
        total_revenue: s.totalRevenue, total_cost: s.deliveryFee, total_expenses: totalExpenses,
        expected_remit: s.netToHQ, actual_remit: s.actualRemit,
        should_include_delivery: s.shouldEnvelope, variance: s.variance, note: d.note,
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
      await supabase.from('revenue_items').delete().eq('closing_id', cid)
      const revItems = [
        ...(store.mode !== 'handwrite' ? [{ closing_id: cid, channel: 'pos', gross_amount: d.pos_cash, is_cash: true }] : []),
        ...(store.uber_accounts ?? []).map(acc => ({ closing_id: cid, channel: 'uber', account_name: acc, gross_amount: d.uber_amounts[acc] ?? 0, is_cash: false })),
        ...(store.panda_enabled ? [{ closing_id: cid, channel: 'panda', gross_amount: d.panda_amount, is_cash: false }] : []),
        ...(store.twpay_enabled ? [{ closing_id: cid, channel: 'twpay', gross_amount: d.twpay_amount, is_cash: false }] : []),
        ...(store.online_enabled ? [{ closing_id: cid, channel: 'online', gross_amount: d.online_amount, is_cash: false }] : []),
        ...(store.mode !== 'ichef' ? [{ closing_id: cid, channel: 'handwrite', gross_amount: handwriteTotal, is_cash: true }] : []),
      ]
      if (revItems.length) await supabase.from('revenue_items').insert(revItems)
      if (!cid) throw new Error('無法取得帳目 ID')
      const cashPayload = {
        bills_1000: d.bills_1000, bills_500: d.bills_500, bills_100: d.bills_100,
        coins_50: d.coins_50, coins_10: d.coins_10, coins_5: d.coins_5, coins_1: d.coins_1,
        lump_1000: d.lump_1000, lump_500: d.lump_500, lump_100: d.lump_100,
        lump_50: d.lump_50, lump_10: d.lump_10, lump_5: d.lump_5, lump_1: d.lump_1,
      }
      const cashResult = await saveCashCounts(cid, cashPayload)
      if (cashResult.error) throw new Error('現金清點儲存失敗：' + cashResult.error)
      await supabase.from('order_items').delete().eq('closing_id', cid)
      if (d.ck_total > 0) {
        await supabase.from('order_items').insert({
          closing_id: cid, vendor: '央廚', item_name: '央廚配送',
          unit_price: d.ck_total, quantity: 1, total_amount: d.ck_total,
        })
      }
      await supabase.from('expense_items').delete().eq('closing_id', cid)
      const expItems = expenses
        .filter(e => e.description.trim() || e.amount > 0)
        .map(e => ({ closing_id: cid, description: e.description.trim() || '支出', amount: e.amount }))
      if (expItems.length) await supabase.from('expense_items').insert(expItems)
      await supabase.from('handwrite_orders').delete().eq('closing_id', cid)
      const hwItems = handwriteOrders
        .filter(o => o.order_number.trim())
        .map(o => ({
          closing_id: cid, store_id: store.id,
          order_number: o.order_number.trim(),
          amount: o.voided ? 0 : o.amount,
          voided: o.voided, void_reason: o.void_reason || null,
        }))
      if (hwItems.length) await supabase.from('handwrite_orders').insert(hwItems)
      if (!silent) toast.success('草稿已儲存')
      return cid
    } catch (err: any) {
      toast.error('儲存失敗：' + err.message)
      return null
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    const cid = await handleSave(true)
    if (!cid) return
    setSubmitting(true)
    const supabase = createClient()
    try {
      await supabase.from('daily_closings')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', cid)
      setStatus('submitted')
      toast.success('今日結帳已送出！')
      if (Math.abs(s.variance) > 200) {
        await supabase.from('audit_logs').insert({
          event_type: 'variance_alert', severity: 'error',
          store_id: store.id, user_id: userId, closing_id: cid,
          description: `${store.name} ${today} 誤差 ${Math.round(s.variance)} 元`,
          metadata: { variance: s.variance, business_date: today },
        })
      }
      setSubmitDone(true)
      setCurrentStep(prev => prev + 1) // advance to 摘要
    } catch (err: any) {
      toast.error('送出失敗：' + err.message)
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
    { id: 'ai_verify', label: 'AI 核對' },
    { id: 'submit',    label: '送出'    },
    { id: 'result',    label: '摘要'    },
    { id: 'petty',     label: '零用金核對' },
  ]
  const totalSteps = STEPS.length
  const submitStepIdx = STEPS.findIndex(s => s.id === 'submit')
  const isPostSubmit = submitDone || status === 'submitted' || status === 'verified'
  const step = isLocked && !submitDone
    ? STEPS.findIndex(s => s.id === 'summary')
    : Math.min(currentStep, totalSteps - 1)
  const stepId = STEPS[step]?.id
  const stepNum = step + 1

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (stepId === 'ai_verify' && !aiTriggered) {
      startAIVerification()
    }
  }, [stepId, aiTriggered])

  function goNext() {
    if (stepId === 'receipts' && !isLocked) {
      if (receiptForms.length > 0) {
        toast.error(`請先儲存 ${receiptForms.length} 筆未儲存的收據`)
        return
      }
    }
    if (stepId === 'ai_verify' && !isLocked) {
      const unresolved = aiItems.filter(a => !a.matched && !a.accepted)
      if (unresolved.length > 0) {
        toast.error(`尚有 ${unresolved.length} 筆差異未處理，請確認後繼續`)
        return
      }
    }
    if (step >= submitStepIdx) { setCurrentStep(step + 1); return }
    if (step < totalSteps - 1) { handleSave(true); setCurrentStep(step + 1) }
  }
  function goPrev() { if (step > 0) setCurrentStep(step - 1) }

  const pettyVerifyCash = DENOMINATIONS.reduce((sum, { countKey, lumpKey, unit }) =>
    sum + (pettyCounts[countKey] || 0) * unit + (pettyLumps[lumpKey] || 0), 0)
  const pettyDiff = pettyVerifyCash - store.petty_cash
  const pettyOk = pettyDiff === 0

  // ── Main wizard return ────────────────────────────────────────────────────
  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* Sticky header + stepper */}
      <div className="bg-white sticky top-0 z-50" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #f4f4f5' }}>
          <div>
            <p className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>每日結帳</p>
            <p className="text-sm font-bold" style={{ color: '#18181b' }}>{store.name} · {today}</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.color }}>
            {st.label}
          </span>
        </div>
        {!isLocked && (
          <div className="px-4 py-3 overflow-x-auto">
            <div className="flex items-center" style={{ minWidth: 'max-content' }}>
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center">
                  <button onClick={() => { if (i <= step) setCurrentStep(i) }}
                    className="flex flex-col items-center gap-1 px-1.5"
                    style={{ cursor: i <= step ? 'pointer' : 'default' }}>
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                      style={{
                        background: i === step ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : i < step ? '#10b981' : '#f4f4f5',
                        color: i === step || i < step ? 'white' : '#a1a1aa',
                        boxShadow: i === step ? '0 4px 14px rgba(99,102,241,0.3)' : 'none',
                        transform: i === step ? 'scale(1.1)' : 'scale(1)',
                      }}>
                      {i < step ? '✓' : i + 1}
                    </div>
                    <span className="text-[10px] font-semibold whitespace-nowrap"
                      style={{ color: i === step ? '#6366f1' : i < step ? '#10b981' : '#a1a1aa' }}>
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

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4 pb-32">

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

        {/* ── STEP 1: 上傳單據 ──────────────────────────────────────────── */}
        {(stepId === 'receipts' || isLocked) && (
          <>
            {!isLocked && <GradientTitle step={stepNum} total={totalSteps} title="上傳單據"
              desc="上傳今日所有發票與收據，手動填寫金額，送出前 AI 統一核對。" />}

            {/* 隱藏多選上傳 input */}
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={handleMultiUpload} />

            {!isLocked && (
              <div className="space-y-2 mb-1">
                {/* 上傳區塊 */}
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-2xl flex flex-col items-center justify-center gap-2 py-6 transition-colors"
                  style={{ border: '2px dashed #c7d2fe', background: '#f8f9ff', color: '#6366f1' }}>
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
                  {receiptForms.map((form, idx) => (
                    <div key={form.id} style={{
                      display: 'grid', gridTemplateColumns: '80px 1fr', gap: '14px',
                      paddingBottom: idx < receiptForms.length - 1 ? '16px' : 0,
                      borderBottom: idx < receiptForms.length - 1 ? '1px solid #f4f4f5' : 'none',
                    }}>
                      {/* 縮圖 */}
                      <div style={{
                        width: '80px', height: '100px', borderRadius: '10px', overflow: 'hidden',
                        background: 'linear-gradient(135deg,#f3f4f6,#e5e7eb)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        position: 'relative', flexShrink: 0,
                      }}>
                        {form.previewUrl
                          ? <img src={form.previewUrl} alt="receipt" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <FileText className="h-8 w-8" style={{ color: '#a1a1aa' }} />
                        }
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: '9px', padding: '3px', textAlign: 'center', borderRadius: '0 0 10px 10px' }}>
                          {form.file ? form.file.name.split('.')[0].slice(0, 8) : '無照片'}
                        </div>
                      </div>

                      {/* 表單 */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {/* 類別 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>類別</label>
                          {addingCatForId === form.id ? (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <input autoFocus placeholder="輸入新類別"
                                style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #6366f1', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}
                                value={newCatText}
                                onChange={e => setNewCatText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') confirmNewCategory(form.id); if (e.key === 'Escape') { setAddingCatForId(null); setNewCatText('') } }} />
                              <button onClick={() => confirmNewCategory(form.id)}
                                style={{ padding: '6px 10px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                ✓
                              </button>
                              <button onClick={() => { setAddingCatForId(null); setNewCatText('') }}
                                style={{ padding: '6px 10px', background: '#f4f4f5', color: '#52525b', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                ✕
                              </button>
                            </div>
                          ) : (
                            <select value={form.category}
                              onChange={e => {
                                if (e.target.value === '__new__') { setAddingCatForId(form.id); setNewCatText('') }
                                else updateReceiptForm(form.id, 'category', e.target.value)
                              }}
                              style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}>
                              <option value="">— 選擇 —</option>
                              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                              <option value="__new__">＋ 新增類別</option>
                            </select>
                          )}
                        </div>

                        {/* 廠商 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>廠商 *</label>
                          <input placeholder="廠商名稱"
                            style={{ padding: '8px 10px', border: `1.5px solid ${form.vendor_name.trim() ? '#e4e4e7' : '#fda4af'}`, borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}
                            value={form.vendor_name}
                            onChange={e => updateReceiptForm(form.id, 'vendor_name', e.target.value)} />
                        </div>

                        {/* 金額 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>
                            {form.has_tax ? '金額（未稅）*' : '金額 *'}
                          </label>
                          <input type="number" min="0" inputMode="numeric" placeholder="0"
                            style={{ padding: '8px 10px', border: `1.5px solid ${form.total_amount > 0 ? '#e4e4e7' : '#fda4af'}`, borderRadius: '8px', fontSize: '16px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}
                            value={form.total_amount || ''}
                            onChange={e => updateReceiptForm(form.id, 'total_amount', parseInt(e.target.value) || 0)} />
                        </div>

                        {/* 稅 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>稅</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 0', fontSize: '13px', color: '#52525b' }}>
                            <input type="checkbox" id={`tax-${form.id}`} checked={form.has_tax}
                              onChange={e => updateReceiptForm(form.id, 'has_tax', e.target.checked)} />
                            <label htmlFor={`tax-${form.id}`} style={{ cursor: 'pointer' }}>稅外加</label>
                            {form.has_tax && (
                              <input type="number" min="0" inputMode="numeric" placeholder="稅額"
                                style={{ width: '68px', padding: '4px 8px', border: '1px solid #e4e4e7', borderRadius: '6px', fontSize: '13px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit', outline: 'none' }}
                                value={form.tax_amount || ''}
                                onChange={e => updateReceiptForm(form.id, 'tax_amount', parseInt(e.target.value) || 0)} />
                            )}
                          </div>
                        </div>

                        {/* 含稅總額（僅稅外加時顯示） */}
                        {form.has_tax && form.total_amount > 0 && (
                          <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>含稅總額</label>
                            <input type="number" value={form.total_amount + (form.tax_amount || 0)} readOnly
                              style={{ padding: '8px 10px', border: '1.5px solid #fcd34d', borderRadius: '8px', fontSize: '16px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', background: '#fffbeb', outline: 'none', fontFamily: 'inherit', color: '#92400e' }} />
                          </div>
                        )}

                        {/* 備註 */}
                        <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>備註（可空）</label>
                          <input placeholder="例：本週菜價漲"
                            style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}
                            value={form.notes}
                            onChange={e => updateReceiptForm(form.id, 'notes', e.target.value)} />
                        </div>

                        {/* 刪除 + 儲存 */}
                        <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <button onClick={() => removeReceiptForm(form.id)}
                            className="flex items-center gap-1 text-xs"
                            style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit' }}>
                            <Trash2 className="h-3 w-3" />刪除
                          </button>
                          <button onClick={() => saveReceiptForm(form)} disabled={form.uploading}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white"
                            style={{
                              background: (form.vendor_name.trim() && form.total_amount > 0) ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#d4d4d8',
                              cursor: (form.vendor_name.trim() && form.total_amount > 0) ? 'pointer' : 'not-allowed',
                              opacity: form.uploading ? 0.7 : 1, border: 'none', fontFamily: 'inherit',
                              boxShadow: (form.vendor_name.trim() && form.total_amount > 0) ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
                            }}>
                            {form.uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />儲存中…</> : '儲存'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 已儲存收據清單 */}
            {localReceipts.length > 0 && (
              <SectionCard icon={<Camera className="h-4 w-4" />}
                title={`今日收據（${localReceipts.filter(r => !isCKReceipt(r, ckPrices)).length} 筆支出${localReceipts.some(r => isCKReceipt(r, ckPrices)) ? ' + 央廚' : ''}）`}
                subtitle="AI 將於送出前統一核對" iconColor="#6366f1">
                <div className="space-y-2">
                  {localReceipts.map(r => {
                    const isCK = isCKReceipt(r, ckPrices)
                    const isEditing = editingReceiptId === r.id
                    if (isEditing) {
                      return (
                        <div key={r.id} className="rounded-xl p-3 space-y-2"
                          style={{ background: '#f8f9ff', border: '1.5px solid #c7d2fe' }}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Pencil className="h-3.5 w-3.5 shrink-0" style={{ color: '#6366f1' }} />
                            <p className="text-xs font-semibold" style={{ color: '#6366f1' }}>編輯收據</p>
                          </div>
                          <div className="flex gap-2">
                            <input placeholder="廠商名稱"
                              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid #c7d2fe', borderRadius: '10px', fontSize: '14px', background: 'white', outline: 'none', fontFamily: 'inherit', color: '#18181b' }}
                              value={editVendor} onChange={e => setEditVendor(e.target.value)} autoFocus />
                            <input type="number" min="0" inputMode="numeric"
                              style={{ width: '96px', padding: '9px 10px', border: '1.5px solid #c7d2fe', borderRadius: '10px', fontSize: '14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', background: 'white', outline: 'none', fontFamily: 'inherit', color: '#18181b' }}
                              value={editAmount || ''} placeholder="金額"
                              onChange={e => setEditAmount(parseInt(e.target.value) || 0)} />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={handleSaveReceiptEdit} disabled={!editVendor.trim()}
                              className="flex-1 py-2 rounded-xl text-xs font-bold text-white"
                              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', opacity: !editVendor.trim() ? 0.5 : 1 }}>
                              儲存
                            </button>
                            <button onClick={() => setEditingReceiptId(null)}
                              className="px-4 py-2 rounded-xl text-xs font-semibold"
                              style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
                              取消
                            </button>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={r.id} className="rounded-xl overflow-hidden"
                        style={{ border: `1px solid ${isCK ? '#fed7aa' : '#f4f4f5'}`, background: isCK ? '#fff7ed' : 'white' }}>
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          {r.photo_url ? (
                            <img src={r.photo_url} alt="receipt"
                              className="h-12 w-12 object-cover rounded-lg shrink-0"
                              style={{ border: '1px solid #f4f4f5' }} />
                          ) : (
                            <div className="h-12 w-12 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: isCK ? '#ffedd5' : '#f4f4f5' }}>
                              <span className="text-xl">{isCK ? '🚚' : '🧾'}</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: '#18181b' }}>
                              {r.vendor_name || '（未填廠商）'}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>
                              {isCK ? '央廚配送' : '現金支出'}
                              {r.photo_url ? ' · 有照片' : ' · 無照片'}
                            </p>
                          </div>
                          <p className="text-sm font-bold tabular-nums shrink-0" style={{ color: '#18181b' }}>
                            ${fmt(r.total_amount)}
                          </p>
                          {!isLocked && (
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => { setEditingReceiptId(r.id); setEditVendor(r.vendor_name || ''); setEditAmount(r.total_amount); setEditItems((r.receipt_items ?? []).map(i => ({ item_name: i.item_name, amount: i.amount }))) }}
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
                {totalExpenses > 0 && (
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
        {(stepId === 'ck_delivery' || isLocked) && (
          <>
            {!isLocked && <GradientTitle step={stepNum} total={totalSteps} title="央廚配送"
              desc="輸入今日央廚配送總金額，可從收據自動同步。" />}

            <SectionCard icon={<Package className="h-4 w-4" />} title="央廚配送" subtitle="配送總金額（月底結帳用）" iconColor="#f97316">
              {!isLocked && (
                <div className="flex justify-end mb-3">
                  <button onClick={syncFromReceipts} disabled={syncing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{ background: '#fff7ed', color: '#f97316', border: '1px solid #fed7aa', opacity: syncing ? 0.6 : 1 }}>
                    {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    從收據同步
                  </button>
                </div>
              )}
              <SInput value={data.ck_total || 0} onChange={v => set('ck_total', v)} disabled={isLocked} />
              {data.ck_total > 0 && <SummaryBlock label="配送費小計" value={`$${fmt(s.deliveryFee)}`} warm />}
            </SectionCard>
          </>
        )}

        {/* ── STEP 3: 手寫菜單 ─────────────────────────────────────────── */}
        {(stepId === 'handwrite' || isLocked) && store.mode !== 'ichef' && (
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
                  <p className="text-[10px]" style={{ color: '#a1a1aa' }}>已存在的單號不重複建立 · 最多 200 筆</p>
                </div>
              )}
              {handwriteOrders.length > 0 && (
                <div className="rounded-xl overflow-hidden mb-3" style={{ border: '1px solid #f4f4f5' }}>
                  <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#f8fafc', borderBottom: '1px solid #f4f4f5' }}>
                    <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>單號</span>
                    <span className="w-20 text-right text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>金額</span>
                    {!isLocked && <span className="w-8" />}
                    {!isLocked && <span className="w-5" />}
                  </div>
                  {handwriteOrders.map((o, idx) => (
                    <div key={o.id} style={{ background: o.voided ? '#fff8f8' : 'white', borderBottom: idx !== handwriteOrders.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                      <div className="flex items-center gap-2 px-3 py-2">
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

            <SectionCard icon={<Video className="h-4 w-4" />} title="今日菜單影片" subtitle="上傳今日菜單影片（選填）" iconColor="#3b82f6">
              <VideoUploader storeId={store.id} businessDate={today} userId={userId} disabled={isLocked} />
            </SectionCard>
          </>
        )}

        {/* ── STEP 3: 營業額 ───────────────────────────────────────────── */}
        {(stepId === 'revenue' || isLocked) && (
          <>
            {!isLocked && <GradientTitle step={stepNum} total={totalSteps} title="各平台營業額"
              desc="輸入今日各通路的原始金額，並上傳平台統計畫面照片 — AI 自動比對防止輸入錯誤。" />}

            {/* 共用隱藏 file input */}
            <input ref={channelFileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={handleChannelFileChange} />

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
                  />
                )
              })()}

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
        {(stepId === 'cash' || isLocked) && (
          <>
            {!isLocked && <GradientTitle step={stepNum} total={totalSteps} title="現金清點"
              desc="輸入各幣值張數，系統自動加總計算現金總額。" />}

            <SectionCard icon={<Calculator className="h-4 w-4" />} title="現金清點" iconColor="#10b981">
              <div className="space-y-2.5">
                <div style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 1fr 3.5rem', gap: '0 8px' }}>
                  <span />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-center" style={{ color: '#a1a1aa' }}>張 / 枚</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-center" style={{ color: '#a1a1aa' }}>整筆金額</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-right" style={{ color: '#a1a1aa' }}>小計</span>
                </div>
                {DENOMINATIONS.map(({ label, countKey, lumpKey, unit, unitLabel }) => {
                  const countVal = data[countKey] as number
                  const lumpVal = data[lumpKey] as number
                  const subtotal = countVal * unit + lumpVal
                  return (
                    <div key={countKey} style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 1fr 3.5rem', gap: '0 8px', alignItems: 'center' }}>
                      <span className="text-xs shrink-0" style={{ color: '#52525b' }}>{label}</span>
                      <div className="flex items-center gap-1">
                        <SInput value={countVal} onChange={v => set(countKey, parseInt(String(v)) || 0)} disabled={isLocked} />
                        <span className="text-[10px] shrink-0" style={{ color: '#a1a1aa' }}>{unitLabel}</span>
                      </div>
                      <SInput value={lumpVal} onChange={v => set(lumpKey, parseInt(String(v)) || 0)} disabled={isLocked} />
                      <span className="text-right text-xs tabular-nums shrink-0"
                        style={{ color: subtotal > 0 ? '#18181b' : '#d4d4d8', fontWeight: subtotal > 0 ? 600 : 400 }}>
                        ${fmt(subtotal)}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 space-y-2">
                <SummaryBlock label="現金總額" value={`$${fmt(s.cashTotal)}`} />
                <SummaryBlock label={`扣零用金（$${fmt(store.petty_cash)}）= 實匯入`} value={`$${fmt(s.actualRemit)}`} />
              </div>
            </SectionCard>
          </>
        )}

        {/* ── STEP 5: 確認結帳 ─────────────────────────────────────────── */}
        {(stepId === 'summary' || isLocked) && (
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
                  { label: '− 平台收款（Uber / 熊貓等）', value: `−$${fmt(s.platformTotal)}`, muted: true },
                  ...(totalExpenses > 0 ? [{ label: '− 現金支出', value: `−$${fmt(totalExpenses)}`, muted: true }] : []),
                ].map(r => (
                  <div key={r.label} className="flex justify-between items-center py-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
                    <span className="text-sm" style={{ color: r.muted ? '#a1a1aa' : '#52525b' }}>{r.label}</span>
                    <span className="text-base font-bold tabular-nums">{r.value}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center py-3 px-3 -mx-3 my-2 rounded-xl"
                  style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
                  <span className="text-sm font-semibold" style={{ color: '#312e81' }}>應包進信封</span>
                  <span className="text-xl font-extrabold tabular-nums" style={{ color: '#4338ca' }}>${fmt(s.shouldEnvelope)}</span>
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
                <div className="flex justify-between items-center py-3">
                  <span className="text-sm font-semibold" style={{ color: '#52525b' }}>實際包進信封（現金 − 零用金）</span>
                  <span className="text-base font-bold tabular-nums">${fmt(s.actualRemit)}</span>
                </div>
              </div>
            </div>

            {/* Variance block */}
            <div className="rounded-2xl px-5 py-6 text-center" style={{ background: varBg, border: `1.5px solid ${varBorder}` }}>
              <p className="text-xs font-semibold mb-2" style={{ color: varColor }}>真正誤差</p>
              <p className="font-extrabold tabular-nums tracking-tight" style={{ fontSize: '52px', lineHeight: 1, color: varColor }}>
                {s.variance >= 0 ? '+' : ''}{fmt(s.variance)}
              </p>
              <p className="text-sm mt-2" style={{ color: varColor }}>{varMsg}</p>
            </div>

            {/* 備註 */}
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: '#a1a1aa' }}>備註</label>
              <textarea disabled={isLocked}
                style={{ width: '100%', minHeight: '72px', padding: '12px', fontSize: '14px', border: '1.5px solid #e4e4e7', borderRadius: '12px', resize: 'none', outline: 'none', fontFamily: 'inherit', background: isLocked ? '#fafafa' : 'white', color: '#18181b' }}
                placeholder="如有異常情況請說明..."
                value={data.note} onChange={e => set('note', e.target.value)} />
            </div>

            {isLocked && !submitDone && (
              <div className="rounded-2xl px-4 py-3.5 flex items-center gap-2.5"
                style={{ background: '#f8fafc', border: '1px solid #f4f4f5' }}>
                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: status === 'verified' ? '#10b981' : '#6366f1' }} />
                <p className="text-sm" style={{ color: '#52525b' }}>
                  {status === 'verified' ? '此帳目已核准，如需修改請聯絡總公司' : '帳目已送出，等待總公司審核'}
                </p>
              </div>
            )}
          </>
        )}

        {/* ── STEP: AI 核對 ────────────────────────────────────────────── */}
        {stepId === 'ai_verify' && (() => {
          const totalItems = aiItems.length
          const doneItems = aiItems.filter(a => !a.checking).length
          const failItems = aiItems.filter(a => !a.checking && !a.matched && !a.accepted)
          const passItems = aiItems.filter(a => !a.checking && (a.matched || a.accepted))
          const allDone = totalItems > 0 && doneItems === totalItems
          const allPass = allDone && failItems.length === 0

          return (
            <>
              <GradientTitle step={stepNum} total={totalSteps} title="AI 智能核對"
                desc="系統逐一比對所有照片金額與你的輸入，請確認差異後才能送出。" />

              {/* Hero 橫幅 */}
              {!aiTriggered || (aiRunning && totalItems === 0) ? (
                <div className="rounded-3xl p-8 text-center text-white"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: '-40%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(circle,rgba(255,255,255,0.15),transparent)', borderRadius: '50%', pointerEvents: 'none' }} />
                  <Loader2 className="animate-spin" style={{ width: '80px', height: '80px', color: 'white', margin: '0 auto 16px' }} />
                  <h2 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.01em' }}>準備核對中</h2>
                  <p className="text-sm" style={{ opacity: 0.9 }}>正在收集今日所有照片…</p>
                </div>
              ) : aiRunning ? (
                <div className="rounded-3xl p-8 text-center text-white"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: '-40%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(circle,rgba(255,255,255,0.15),transparent)', borderRadius: '50%', pointerEvents: 'none' }} />
                  <Loader2 className="animate-spin" style={{ width: '80px', height: '80px', color: 'white', margin: '0 auto 16px' }} />
                  <h2 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.01em' }}>核對中，請稍候</h2>
                  <p className="text-sm" style={{ opacity: 0.9 }}>正在比對 {totalItems} 張照片 · 已完成 {doneItems}/{totalItems}</p>
                </div>
              ) : totalItems === 0 ? (
                <div className="rounded-3xl p-8 text-center text-white"
                  style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: '-40%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(circle,rgba(255,255,255,0.15),transparent)', borderRadius: '50%', pointerEvents: 'none' }} />
                  <div style={{ width: '80px', height: '80px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
                    <CheckCircle2 style={{ width: '44px', height: '44px', color: 'white' }} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">本次無照片需核對</h2>
                  <p className="text-sm" style={{ opacity: 0.9 }}>可直接送出至總公司</p>
                </div>
              ) : allPass ? (
                <div className="rounded-3xl p-8 text-center text-white"
                  style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: '-40%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(circle,rgba(255,255,255,0.15),transparent)', borderRadius: '50%', pointerEvents: 'none' }} />
                  <div style={{ width: '80px', height: '80px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
                    <CheckCircle2 style={{ width: '44px', height: '44px', color: 'white' }} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">全部核對通過！</h2>
                  <p className="text-sm" style={{ opacity: 0.9 }}>所有 {totalItems} 項照片金額都與輸入一致 · 沒有發現異常</p>
                </div>
              ) : (
                <div className="rounded-3xl p-8 text-center text-white"
                  style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: '-40%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(circle,rgba(255,255,255,0.15),transparent)', borderRadius: '50%', pointerEvents: 'none' }} />
                  <div style={{ width: '80px', height: '80px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
                    <AlertCircle style={{ width: '44px', height: '44px', color: 'white' }} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">發現 {failItems.length} 項需要確認</h2>
                  <p className="text-sm" style={{ opacity: 0.9 }}>{passItems.length} 項通過 · {failItems.length} 項輸入金額與照片不符 · 請點下方項目進行處理</p>
                </div>
              )}

              {/* 核對項目清單 */}
              {aiItems.length > 0 && (
                <div className="bg-white rounded-2xl overflow-hidden"
                  style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid #f4f4f5' }}>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: '#eef2ff' }}>
                        <Sparkles className="h-4 w-4" style={{ color: '#6366f1' }} />
                      </div>
                      <p className="text-sm font-semibold" style={{ color: '#18181b' }}>核對項目</p>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: '#f4f4f5', color: '#52525b' }}>
                      {doneItems}/{totalItems} 已完成
                    </span>
                  </div>
                  <div className="p-4 space-y-2">
                    {aiItems.map(item => (
                      <div key={item.key} className="rounded-xl p-3 flex gap-3 items-start"
                        style={{
                          background: item.checking ? 'white'
                            : (item.matched || item.accepted) ? '#f0fdf4'
                            : '#fff8f8',
                          border: `1px solid ${item.checking ? '#f4f4f5' : (item.matched || item.accepted) ? '#bbf7d0' : '#fda4af'}`,
                        }}>
                        {/* 狀態圖示 */}
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                          background: item.checking ? '#a1a1aa'
                            : (item.matched || item.accepted) ? '#10b981'
                            : '#f43f5e',
                        }}>
                          {item.checking
                            ? <Loader2 className="animate-spin" style={{ width: '18px', height: '18px' }} />
                            : (item.matched || item.accepted)
                              ? <CheckCircle2 style={{ width: '18px', height: '18px' }} />
                              : <AlertCircle style={{ width: '18px', height: '18px' }} />
                          }
                        </div>

                        {/* 內容 */}
                        <div style={{ flex: 1, fontSize: '13px' }}>
                          <div className="font-semibold text-sm mb-0.5" style={{ color: '#18181b' }}>
                            {item.type === 'receipt' ? '單據' : '平台'} · {item.label}
                          </div>
                          {item.checking ? (
                            <span style={{ color: '#a1a1aa' }}>辨識中…</span>
                          ) : (item.matched || item.accepted) ? (
                            <span style={{ color: '#047857' }}>
                              {item.accepted && !item.matched ? `已確認差異（$${fmt(item.inputAmount)}）` : `照片金額 $${fmt(item.recognized)} ✓ 符合`}
                            </span>
                          ) : (
                            <>
                              <div style={{ color: '#71717a', marginBottom: '6px' }}>
                                你輸入 <span style={{ fontWeight: 600, color: '#52525b' }}>${fmt(item.inputAmount)}</span>
                                {' → '} 照片顯示 <span style={{ fontWeight: 600, color: '#be123c' }}>${fmt(item.recognized)}</span>
                                <span style={{ fontSize: '11px', marginLeft: '4px', color: '#be123c' }}>（差 ${fmt(Math.abs(item.inputAmount - item.recognized))}）</span>
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                <button
                                  onClick={async () => {
                                    if (item.type === 'receipt') {
                                      const supabase = createClient()
                                      await supabase.from('receipts').update({ total_amount: item.recognized }).eq('id', item.key)
                                      setLocalReceipts(prev => prev.map(r => r.id === item.key ? { ...r, total_amount: item.recognized } : r))
                                    } else {
                                      if (item.key === 'pos') set('pos_cash', item.recognized)
                                      else if (item.key === 'panda') set('panda_amount', item.recognized)
                                      else if (item.key === 'twpay') set('twpay_amount', item.recognized)
                                      else if (item.key === 'online') set('online_amount', item.recognized)
                                      else if (item.key.startsWith('uber_')) {
                                        const acc = item.key.replace('uber_', '')
                                        set('uber_amounts', { ...dataRef.current.uber_amounts, [acc]: item.recognized })
                                      }
                                    }
                                    setAiItems(prev => prev.map(a => a.key === item.key ? { ...a, inputAmount: item.recognized, matched: true } : a))
                                    toast.success(`已改為 $${fmt(item.recognized)}`)
                                  }}
                                  style={{ background: '#f43f5e', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  ✓ 改為 ${fmt(item.recognized)}
                                </button>
                                <button
                                  onClick={() => setAiItems(prev => prev.map(a => a.key === item.key ? { ...a, accepted: true } : a))}
                                  style={{ background: 'white', color: '#be123c', border: '1.5px solid #be123c', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  保留 ${fmt(item.inputAmount)}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 全通過卡片 */}
              {allDone && allPass && totalItems > 0 && (
                <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#d1fae5,#ecfdf5)', border: '1px solid #6ee7b7' }}>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: '#059669' }} />
                    <div>
                      <p className="text-sm font-bold" style={{ color: '#065f46' }}>所有資料已通過 AI 核對，可放心送出</p>
                      <p className="text-xs mt-1" style={{ color: '#047857' }}>送出後總公司會收到完整的單據照片、輸入金額、AI 核對紀錄</p>
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
              style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)', border: '1.5px solid #c7d2fe' }}>
              <p className="text-xs mb-1 font-semibold" style={{ color: '#6366f1' }}>應包進信封的錢</p>
              <p className="text-5xl font-extrabold tabular-nums tracking-tight mb-2" style={{ color: '#4338ca' }}>
                ${fmt(s.actualRemit)}
              </p>
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
              style={{ background: 'linear-gradient(135deg,#18181b,#4338ca)', boxShadow: '0 20px 50px -10px rgba(99,102,241,0.25)' }}>
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
                <p className="text-xs mb-1" style={{ opacity: 0.8 }}>請包入信封袋的金額</p>
                <p className="text-4xl font-extrabold tabular-nums tracking-tight">${fmt(s.actualRemit)}</p>
              </div>
            </div>
          </>
        )}

        {/* ── STEP 8: 零用金核對 ───────────────────────────────────────── */}
        {stepId === 'petty' && (
          <>
            <GradientTitle step={stepNum} total={totalSteps} title="零用金核對"
              desc="包好信封後，請清點店內剩餘零用金是否等於備付額。" />

            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
                <p className="text-sm font-semibold mb-0.5">零用金最終核對</p>
                <p className="text-xs" style={{ color: '#a1a1aa' }}>包好信封後，請清點剩餘零用金是否等於零用金備付額</p>
              </div>
              <div className="px-5 py-4">
                <div className="rounded-2xl p-4 text-center mb-4" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
                  <p className="text-xs mb-1" style={{ color: '#6366f1' }}>店面應剩餘零用金</p>
                  <p className="text-3xl font-extrabold tabular-nums" style={{ color: '#4338ca' }}>${fmt(store.petty_cash)}</p>
                </div>
                <div className="space-y-2.5 mb-4">
                  <div style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 1fr 3.5rem', gap: '0 8px' }}>
                    <span />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-center" style={{ color: '#a1a1aa' }}>張 / 枚</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-center" style={{ color: '#a1a1aa' }}>整筆金額</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-right" style={{ color: '#a1a1aa' }}>小計</span>
                  </div>
                  {DENOMINATIONS.map(({ label, countKey, lumpKey, unit, unitLabel }) => {
                    const countVal = pettyCounts[countKey] || 0
                    const lumpVal = pettyLumps[lumpKey] || 0
                    const subtotal = countVal * unit + lumpVal
                    return (
                      <div key={countKey} style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 1fr 3.5rem', gap: '0 8px', alignItems: 'center' }}>
                        <span className="text-xs shrink-0" style={{ color: '#52525b' }}>{label}</span>
                        <div className="flex items-center gap-1">
                          <SInput value={countVal} onChange={v => setPettyCounts(prev => ({ ...prev, [countKey]: parseInt(String(v)) || 0 }))} />
                          <span className="text-[10px] shrink-0" style={{ color: '#a1a1aa' }}>{unitLabel}</span>
                        </div>
                        <SInput value={lumpVal} onChange={v => setPettyLumps(prev => ({ ...prev, [lumpKey]: parseInt(String(v)) || 0 }))} />
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
          </>
        )}
      </div>

      {/* ── Fixed bottom bar ──────────────────────────────────────────────── */}
      {(!isLocked || submitDone) && (
        <div className="fixed bottom-14 lg:bottom-0 left-0 lg:left-60 right-0 bg-white px-4 py-3"
          style={{ borderTop: '1px solid #f4f4f5', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)' }}>
          <div className="max-w-xl mx-auto flex gap-3">

            {/* Step 8: 零用金核對 → 完成結束 */}
            {stepId === 'petty' && (
              <button onClick={() => router.push('/manager/summary')}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-base font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 8px 20px rgba(99,102,241,0.3)' }}>
                <CheckCircle2 className="h-5 w-5" />
                完成 · 結束今日
              </button>
            )}

            {/* Step 7: 摘要 → 繼續到零用金核對 */}
            {stepId === 'result' && (
              <button onClick={goNext}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
                繼續 → 零用金核對
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
                    background: isDisputed ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    boxShadow: isDisputed ? '0 4px 12px rgba(249,115,22,0.3)' : '0 4px 12px rgba(99,102,241,0.3)',
                    opacity: submitting ? 0.7 : 1,
                  }}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {isDisputed ? '確認重新送出' : '確認送出'}
                </button>
              </>
            )}

            {/* Steps 1-5 + ai_verify: 上一步 + 繼續 */}
            {step < submitStepIdx && (
              <>
                {step > 0 && (
                  <button onClick={goPrev} disabled={saving || aiRunning}
                    className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl text-sm font-semibold"
                    style={{ background: '#f4f4f5', color: '#52525b', opacity: (saving || aiRunning) ? 0.6 : 1 }}>
                    ← 上一步
                  </button>
                )}
                <button onClick={goNext} disabled={saving || aiRunning}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white"
                  style={{
                    background: aiRunning ? '#d4d4d8' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    boxShadow: aiRunning ? 'none' : '0 4px 12px rgba(99,102,241,0.3)',
                    opacity: (saving || aiRunning) ? 0.7 : 1,
                  }}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : aiRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {aiRunning ? 'AI 核對中…' : stepId === 'ai_verify' ? '確認，繼續送出 →' : '繼續 →'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
