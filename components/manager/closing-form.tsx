'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Store, CKPrice } from '@/lib/types'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Save, Send, Calculator, Package, Banknote, BarChart3, Loader2, Trash2, Plus, Wallet, X, Video, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'
import VideoUploader from '@/components/manager/video-uploader'
import { saveCashCounts } from '@/app/actions/closings'

interface TodayReceipt {
  id: string
  vendor_name: string
  total_amount: number
  receipt_type: string
  receipt_items?: { item_name: string; amount: number }[]
}

function isCKReceipt(receipt: TodayReceipt, ckPrices: CKPrice[]): boolean {
  if (!receipt.receipt_items || receipt.receipt_items.length === 0) return false
  const ckNames = ckPrices.map(p => p.item_name)
  return receipt.receipt_items.some(item =>
    ckNames.some(ck => item.item_name === ck || item.item_name.includes(ck) || ck.includes(item.item_name))
  )
}

function findCKPrice(itemName: string, ckPrices: CKPrice[]): CKPrice | undefined {
  return ckPrices.find(p =>
    p.item_name === itemName || itemName.includes(p.item_name) || p.item_name.includes(itemName)
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
    // 自動從央廚收據加總配送金額
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
  // CK 永遠以今日收據為準；若無收據則退回用已存的
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
  // 若無既有支出，自動從今日非央廚收據填入
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
  value, onChange, placeholder = '0', disabled, step, textRight = true,
  onKeyDown,
}: {
  value: number | string; onChange: (v: number) => void; placeholder?: string
  disabled?: boolean; step?: string; textRight?: boolean; onKeyDown?: React.KeyboardEventHandler
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type="number" min="0" inputMode="numeric" disabled={disabled}
      step={step}
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

function TextInputStyled({
  value, onChange, placeholder, disabled, forwardRef,
  onKeyDown, mono,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string
  disabled?: boolean; forwardRef?: React.RefObject<HTMLInputElement | null>
  onKeyDown?: React.KeyboardEventHandler; mono?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      ref={forwardRef}
      type="text" disabled={disabled}
      style={{
        padding: '10px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px',
        fontSize: '14px', background: disabled ? '#fafafa' : 'white', outline: 'none',
        fontFamily: mono ? 'monospace' : 'inherit', width: '100%',
        borderColor: focused ? '#6366f1' : '#e4e4e7',
        boxShadow: focused ? '0 0 0 4px rgba(99,102,241,0.1)' : 'none',
        color: '#18181b', opacity: disabled ? 0.5 : 1,
      }}
      value={value} placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => onChange(e.target.value)}
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
          <div className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{ background: iconColor + '18' }}>
            <span style={{ color: iconColor }}>{icon}</span>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#18181b' }}>{title}</p>
            {subtitle && <p className="text-xs" style={{ color: '#a1a1aa' }}>{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="px-4 py-4">
        {children}
      </div>
    </div>
  )
}

function Divider() {
  return <div style={{ borderTop: '1px solid #f4f4f5', margin: '12px 0' }} />
}

function Row({ label, value, muted, bold, accent }: { label: string; value: string; muted?: boolean; bold?: boolean; accent?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm" style={{ color: muted ? '#a1a1aa' : '#52525b' }}>{label}</span>
      <span className="text-sm tabular-nums" style={{ color: accent ?? (bold ? '#18181b' : '#52525b'), fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  )
}

export default function ClosingForm({ store, ckPrices, existingClosing, userId, today, todayReceipts = [] }: Props) {
  const [data, setData] = useState<FormData>(() => initFormData(store, ckPrices, existingClosing, todayReceipts))
  const [expenses, setExpenses] = useState<Expense[]>(() => initExpenses(existingClosing, ckPrices, todayReceipts))
  const [syncing, setSyncing] = useState(false)
  const [handwriteOrders, setHandwriteOrders] = useState<HandwriteOrder[]>(() => initHandwriteOrders(existingClosing))
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
  const isLocked = status === 'submitted' || status === 'verified'
  const isDisputed = status === 'disputed'
  const disputeNote = existingClosing?.dispute_note ?? ''

  const absVar = Math.abs(s.variance)
  const varColor = absVar === 0 ? '#047857' : absVar <= 200 ? '#b45309' : '#be123c'
  const varBg    = absVar === 0 ? '#d1fae5' : absVar <= 200 ? '#fef3c7' : '#ffe4e6'
  const varBorder = absVar === 0 ? '#6ee7b7' : absVar <= 200 ? '#fcd34d' : '#fda4af'
  const varMsg   = absVar === 0 ? '金額正確 ✓' : absVar <= 200 ? '差距微小，請確認' : '差距過大，請重新核查'

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
    if (isLocked) return
    const t = setInterval(() => handleSave(true), 60000)
    return () => clearInterval(t)
  }, [data, expenses, handwriteOrders, isLocked, isDisputed])

  // 切回此 tab 時自動更新央廚金額
  useEffect(() => {
    if (isLocked) return
    async function autoSyncCK() {
      if (document.hidden) return
      const supabase = createClient()
      const { data: receipts } = await supabase
        .from('receipts')
        .select('id, vendor_name, total_amount, receipt_type, receipt_items(item_name, amount)')
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
      .select('id, vendor_name, total_amount, receipt_type, receipt_items(item_name, amount)')
      .eq('store_id', store.id)
      .eq('business_date', today)
      .order('created_at')
    if (receipts) {
      const typed = receipts as TodayReceipt[]
      // 非央廚收據 → 支出
      setExpenses(receiptsToExpenses(typed, ckPrices))
      // 央廚收據 → 加總配送金額
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
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
      toast.error('請輸入有效的起始和結束單號'); return
    }
    if (rangeEnd - rangeStart > 200) {
      toast.error('單次最多建立 200 筆'); return
    }
    const existingNums = new Set(handwriteOrders.map(o => o.order_number))
    const newOrders: HandwriteOrder[] = []
    for (let n = rangeStart; n <= rangeEnd; n++) {
      if (!existingNums.has(String(n))) {
        newOrders.push({ id: crypto.randomUUID(), order_number: String(n), amount: 0, voided: false, void_reason: '' })
      }
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
      router.push('/manager/summary')
    } catch (err: any) {
      toast.error('送出失敗：' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* 頁首 */}
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-xl mx-auto flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
              <BarChart3 className="h-3.5 w-3.5" />
              每日結帳
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>{store.name}</h1>
            <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>{today}</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full mt-1"
            style={{ background: st.bg, color: st.color }}>
            {st.label}
          </span>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4 pb-32 lg:pb-24">

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

        {/* 1. 營收輸入 */}
        <SectionCard icon={<Banknote className="h-4 w-4" />} title="營收輸入" iconColor="#6366f1">
          {store.mode !== 'handwrite' && (
            <div className="mb-3">
              {store.ichef_uber_linked && (
                <div className="mb-2 text-xs px-3 py-2 rounded-xl" style={{ background: '#eef2ff', color: '#4338ca' }}>
                  輸入 iChef 結帳總金額（含外送平台）
                </div>
              )}
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>
                {store.ichef_uber_linked ? 'iChef 結帳總金額' : 'POS 現金'}
              </label>
              <SInput value={data.pos_cash} onChange={v => set('pos_cash', v)} disabled={isLocked} />
            </div>
          )}
          {store.ichef_uber_linked && (
            <p className="text-xs mb-2" style={{ color: '#a1a1aa' }}>↓ 輸入各平台金額（僅用於計算扣除，不加入總收）</p>
          )}
          {(store.uber_accounts ?? []).map(acc => (
            <div key={acc} className="mb-3">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>Uber Eats（{acc}）</label>
              <SInput value={data.uber_amounts[acc] ?? 0} onChange={v => set('uber_amounts', { ...data.uber_amounts, [acc]: v })} disabled={isLocked} />
            </div>
          ))}
          {store.panda_enabled && (
            <div className="mb-3">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>熊貓 foodpanda</label>
              <SInput value={data.panda_amount} onChange={v => set('panda_amount', v)} disabled={isLocked} />
            </div>
          )}
          {store.twpay_enabled && (
            <div className="mb-3">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>台灣Pay</label>
              <SInput value={data.twpay_amount} onChange={v => set('twpay_amount', v)} disabled={isLocked} />
            </div>
          )}
          {store.online_enabled && (
            <div className="mb-3">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>線上點餐</label>
              <SInput value={data.online_amount} onChange={v => set('online_amount', v)} disabled={isLocked} />
            </div>
          )}
          {store.mode !== 'ichef' && handwriteTotal > 0 && (
            <div className="flex justify-between items-center mb-2 text-sm">
              <span style={{ color: '#52525b' }}>手寫訂單合計</span>
              <span className="font-semibold tabular-nums" style={{ color: '#18181b' }}>${fmt(handwriteTotal)}</span>
            </div>
          )}
          <Divider />
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold" style={{ color: '#18181b' }}>總營業額</span>
            <span className="text-xl font-bold tabular-nums" style={{ color: '#6366f1' }}>${fmt(s.totalRevenue)}</span>
          </div>
          {store.ichef_uber_linked && s.platformTotal > 0 && (
            <div className="flex justify-between items-center mt-1.5 text-xs">
              <span style={{ color: '#a1a1aa' }}>店舖現金（iChef − 平台）</span>
              <span className="tabular-nums" style={{ color: '#52525b' }}>${fmt(s.storeRevenue)}</span>
            </div>
          )}
        </SectionCard>

        {/* 2. 手寫訂單 */}
        {store.mode !== 'ichef' && (
          <SectionCard icon={<Banknote className="h-4 w-4" />} title="手寫訂單" subtitle="金額為 0 的單號不計入合計" iconColor="#10b981">
            {/* 批量建立 */}
            {!isLocked && (
              <div className="mb-3 p-3 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #f4f4f5' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: '#52525b' }}>批量建立單號範圍</p>
                <div className="flex gap-2 items-center mb-1.5">
                  <input
                    type="number" min="1" inputMode="numeric" placeholder="起始"
                    style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', background: 'white', outline: 'none', width: '88px', textAlign: 'center' }}
                    value={rangeStart || ''}
                    onChange={e => setRangeStart(parseInt(e.target.value) || 0)}
                  />
                  <span style={{ color: '#a1a1aa' }}>—</span>
                  <input
                    type="number" min="1" inputMode="numeric" placeholder="結束"
                    style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', background: 'white', outline: 'none', width: '88px', textAlign: 'center' }}
                    value={rangeEnd || ''}
                    onChange={e => setRangeEnd(parseInt(e.target.value) || 0)}
                  />
                  <button type="button" onClick={generateRange}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg,#18181b,#3f3f46)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                    <Plus className="h-3.5 w-3.5" /> 建立
                  </button>
                </div>
                <p className="text-[10px]" style={{ color: '#a1a1aa' }}>已存在的單號不重複建立 · 最多 200 筆</p>
              </div>
            )}

            {/* 訂單列表 */}
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
                          : <span className="w-20 text-right text-sm tabular-nums font-semibold" style={{ color: o.amount === 0 ? '#d4d4d8' : '#18181b' }}>
                              ${fmt(o.amount)}
                            </span>
                      ) : (
                        <input
                          type="number" min="0" inputMode="numeric"
                          style={{ width: '80px', padding: '6px 8px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', textAlign: 'right', outline: 'none', background: o.voided ? '#f4f4f5' : 'white', opacity: o.voided ? 0.4 : 1, fontVariantNumeric: 'tabular-nums' }}
                          value={o.voided ? '' : (o.amount || '')}
                          placeholder="0" disabled={o.voided}
                          ref={el => { if (el) amtRefsMap.current.set(o.id, el); else amtRefsMap.current.delete(o.id) }}
                          onChange={e => updateHandwriteOrderAmount(o.id, parseInt(e.target.value) || 0)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const next = handwriteOrders[idx + 1]
                              if (next) amtRefsMap.current.get(next.id)?.focus()
                              else newOrderNumRef.current?.focus()
                            }
                          }}
                        />
                      )}
                      {!isLocked && (
                        <button type="button" onClick={() => toggleVoidOrder(o.id)}
                          className="shrink-0 h-7 w-8 text-[10px] rounded-lg font-semibold"
                          style={{
                            background: o.voided ? '#ffe4e6' : 'white',
                            color: o.voided ? '#be123c' : '#a1a1aa',
                            border: `1px solid ${o.voided ? '#fda4af' : '#e4e4e7'}`,
                          }}>
                          廢
                        </button>
                      )}
                      {!isLocked && (
                        <button type="button" onClick={() => removeHandwriteOrder(o.id)}
                          className="shrink-0" style={{ color: '#d4d4d8' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#be123c')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#d4d4d8')}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {o.voided && (
                      <div className="px-3 pb-2">
                        {isLocked ? (
                          <p className="text-xs" style={{ color: '#a1a1aa' }}>{o.void_reason || '未填原因'}</p>
                        ) : (
                          <input
                            placeholder="作廢原因（選填，如：廚房失誤、客人取消）"
                            style={{ padding: '6px 10px', border: '1.5px solid #fda4af', borderRadius: '8px', fontSize: '12px', background: 'white', outline: 'none', fontFamily: 'inherit', width: '100%' }}
                            value={o.void_reason}
                            onChange={e => updateVoidReason(o.id, e.target.value)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 手動新增 */}
            {!isLocked && (
              <div className="flex gap-2 items-end mb-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>手動新增</label>
                  <input
                    ref={newOrderNumRef} type="text" placeholder="單號"
                    style={{ padding: '10px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', background: 'white', outline: 'none', fontFamily: 'monospace', width: '100%' }}
                    value={newOrderNum}
                    onChange={e => setNewOrderNum(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); newOrderAmtRef.current?.focus() } }}
                  />
                </div>
                <div style={{ width: '110px' }}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'transparent' }}>_</label>
                  <input
                    ref={newOrderAmtRef} type="number" min="0" inputMode="numeric" placeholder="金額"
                    style={{ padding: '10px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', background: 'white', outline: 'none', fontFamily: 'inherit', width: '100%', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                    value={newOrderAmt || ''}
                    onChange={e => setNewOrderAmt(parseInt(e.target.value) || 0)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHandwriteOrder() } }}
                  />
                </div>
                <button type="button" onClick={addHandwriteOrder}
                  className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-sm font-semibold shrink-0"
                  style={{ background: '#f0fdf4', color: '#047857', border: '1px solid #a7f3d0' }}>
                  <Plus className="h-3.5 w-3.5" /> 新增
                </button>
              </div>
            )}

            {handwriteOrders.filter(o => o.amount > 0).length > 0 ? (
              <>
                <Divider />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold" style={{ color: '#18181b' }}>
                    合計（{handwriteOrders.filter(o => o.amount > 0).length} 筆有效）
                  </span>
                  <span className="text-xl font-bold tabular-nums" style={{ color: '#047857' }}>${fmt(handwriteTotal)}</span>
                </div>
              </>
            ) : handwriteOrders.length === 0 && !isLocked ? (
              <p className="text-xs text-center py-2" style={{ color: '#a1a1aa' }}>請使用批量建立或手動新增訂單</p>
            ) : null}
          </SectionCard>
        )}

        {/* 3. 今日菜單影片 */}
        {store.mode !== 'ichef' && (
          <SectionCard icon={<Video className="h-4 w-4" />} title="今日菜單影片" subtitle="上傳今日菜單影片（選填）" iconColor="#3b82f6">
            <VideoUploader storeId={store.id} businessDate={today} userId={userId} disabled={isLocked} />
          </SectionCard>
        )}

        {/* 4. 央廚配送 */}
        <SectionCard icon={<Package className="h-4 w-4" />} title="央廚配送" subtitle="配送總金額（月底結）" iconColor="#f97316">
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
          <SInput
            value={data.ck_total || 0}
            onChange={v => set('ck_total', v)}
            disabled={isLocked}
          />
          <Divider />
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold" style={{ color: '#18181b' }}>配送費合計</span>
            <span className="text-xl font-bold tabular-nums" style={{ color: '#f97316' }}>${fmt(s.deliveryFee)}</span>
          </div>
        </SectionCard>

        {/* 5. 當日現金支出 */}
        <SectionCard icon={<Wallet className="h-4 w-4" />} title="當日現金支出" subtitle="現金付款的進貨、雜費等（不含央廚）" iconColor="#8b5cf6">
          {/* 從收據同步按鈕 */}
          {!isLocked && (
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs" style={{ color: '#a1a1aa' }}>
                {expenses.length > 0 ? `${expenses.length} 筆` : '尚無支出'}
              </p>
              <button onClick={syncFromReceipts} disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: '#faf5ff', color: '#7c3aed', border: '1px solid #e9d5ff', opacity: syncing ? 0.6 : 1 }}>
                {syncing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                從收據同步
              </button>
            </div>
          )}
          {expenses.length === 0 && !isLocked && (
            <p className="text-xs text-center py-2 mb-2" style={{ color: '#a1a1aa' }}>無當日現金支出</p>
          )}
          <div className="space-y-2">
            {expenses.map(e => (
              <div key={e.id} className="flex items-center gap-2">
                <input
                  placeholder="說明（例：菜商、雜貨）"
                  disabled={isLocked}
                  style={{ flex: 1, padding: '10px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', background: isLocked ? '#fafafa' : 'white', outline: 'none', fontFamily: 'inherit' }}
                  value={e.description}
                  onChange={ev => updateExpense(e.id, 'description', ev.target.value)}
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs" style={{ color: '#a1a1aa' }}>$</span>
                  <input
                    type="number" min="0" inputMode="numeric" disabled={isLocked}
                    style={{ width: '88px', padding: '10px 10px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', background: isLocked ? '#fafafa' : 'white', outline: 'none', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                    value={e.amount || ''} placeholder="0"
                    onChange={ev => updateExpense(e.id, 'amount', parseFloat(ev.target.value) || 0)}
                  />
                </div>
                {!isLocked && (
                  <button onClick={() => removeExpense(e.id)}
                    className="p-2 rounded-xl shrink-0"
                    style={{ background: '#fff8f8', color: '#fda4af', border: '1px solid #fecdd3' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#ffe4e6' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff8f8' }}>
                    <Trash2 className="h-4 w-4" style={{ color: '#be123c' }} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!isLocked && (
            <button onClick={addExpense}
              className="flex items-center gap-1.5 text-xs font-semibold mt-3"
              style={{ color: '#7c3aed' }}>
              <Plus className="h-3.5 w-3.5" /> 新增支出項目
            </button>
          )}
          {expenses.length > 0 && (
            <>
              <Divider />
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold" style={{ color: '#18181b' }}>支出合計</span>
                <span className="text-xl font-bold tabular-nums" style={{ color: '#7c3aed' }}>${fmt(totalExpenses)}</span>
              </div>
            </>
          )}
        </SectionCard>

        {/* 6. 現金清點 */}
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
          <Divider />
          <div className="space-y-1.5">
            <Row label="現金總額" value={`$${fmt(s.cashTotal)}`} bold />
            <Row label={`扣零用金（$${fmt(store.petty_cash)}）`} value={`$${fmt(s.actualRemit)}`} bold accent="#4338ca" />
          </div>
        </SectionCard>

        {/* 7. 結算摘要 */}
        <div className="rounded-2xl overflow-hidden"
          style={{ border: `1.5px solid ${varBorder}` }}>
          <div className="px-4 pt-4 pb-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${varBorder}`, background: varBg }}>
            <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: varBg }}>
              <BarChart3 className="h-4 w-4" style={{ color: varColor }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: '#18181b' }}>結算摘要</p>
          </div>
          <div className="px-4 py-4 bg-white space-y-2">
            <Row label="總營業額" value={`$${fmt(s.totalRevenue)}`} bold />
            <Row label="− 平台收款（Uber / 熊貓等）" value={`−$${fmt(s.platformTotal)}`} muted />
            {totalExpenses > 0 && <Row label="− 現金支出" value={`−$${fmt(totalExpenses)}`} muted />}
            <Divider />
            <Row label="應包進信封" value={`$${fmt(s.shouldEnvelope)}`} bold />
            <div className="pl-3 space-y-1">
              <Row label="其中央廚配送費" value={`$${fmt(s.deliveryFee)}`} muted />
              <Row label="應匯入 HQ（淨）" value={`$${fmt(s.netToHQ)}`} />
            </div>
            <Divider />
            <Row label="實際包進信封（現金 − 零用金）" value={`$${fmt(s.actualRemit)}`} bold />
            <Divider />
            <div className="flex justify-between items-center pt-1">
              <span className="text-sm font-bold" style={{ color: '#18181b' }}>誤差</span>
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums" style={{ color: varColor }}>
                  {s.variance >= 0 ? '+' : ''}{fmt(s.variance)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: varColor }}>{varMsg}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 8. 備註 */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#a1a1aa' }}>備註</label>
          <textarea
            disabled={isLocked}
            style={{
              width: '100%', minHeight: '72px', padding: '12px', fontSize: '14px',
              border: '1.5px solid #e4e4e7', borderRadius: '12px', resize: 'none', outline: 'none',
              fontFamily: 'inherit', background: isLocked ? '#fafafa' : 'white', color: '#18181b',
            }}
            placeholder="如有異常情況請說明..."
            value={data.note}
            onChange={e => set('note', e.target.value)}
          />
        </div>

        {/* 9. 已鎖定提示 */}
        {isLocked && (
          <div className="rounded-2xl px-4 py-3.5 flex items-center gap-2.5"
            style={{ background: '#f8fafc', border: '1px solid #f4f4f5' }}>
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: status === 'verified' ? '#10b981' : '#6366f1' }} />
            <p className="text-sm" style={{ color: '#52525b' }}>
              {status === 'verified' ? '此帳目已核准，如需修改請聯絡總公司' : '帳目已送出，等待總公司審核'}
            </p>
          </div>
        )}
      </div>

      {/* 底部操作列 */}
      {!isLocked && (
        <div className="fixed bottom-14 lg:bottom-0 left-0 lg:left-64 right-0 bg-white px-4 py-3"
          style={{ borderTop: '1px solid #f4f4f5', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)' }}>
          <div className="max-w-xl mx-auto flex gap-3">
            <button onClick={() => handleSave()} disabled={saving || submitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
              style={{
                background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b',
                opacity: saving || submitting ? 0.6 : 1,
              }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              儲存草稿
            </button>
            <button onClick={handleSubmit} disabled={saving || submitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white"
              style={{
                background: isDisputed
                  ? 'linear-gradient(135deg,#f97316,#ea580c)'
                  : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                boxShadow: isDisputed
                  ? '0 4px 12px rgba(249,115,22,0.3)'
                  : '0 4px 12px rgba(99,102,241,0.3)',
                opacity: saving || submitting ? 0.7 : 1,
              }}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isDisputed ? '修正後重新送出' : '送出今日結帳'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
