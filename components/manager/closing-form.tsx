'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Store, CKPrice } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Save, Send, Calculator, Package, Banknote, BarChart3, Loader2, Trash2, Plus, Wallet, X, Video } from 'lucide-react'
import VideoUploader from '@/components/manager/video-uploader'
import { saveCashCounts } from '@/app/actions/closings'

interface Props {
  store: Store
  ckPrices: CKPrice[]
  existingClosing: any
  userId: string
  today: string
}

interface FormData {
  pos_cash: number
  uber_amounts: Record<string, number>
  panda_amount: number
  twpay_amount: number
  online_amount: number
  ck_quantities: Record<string, number>
  // 現金清點（個數）
  bills_1000: number
  bills_500: number
  bills_100: number
  coins_50: number
  coins_10: number
  coins_5: number
  coins_1: number
  // 整筆金額
  lump_1000: number
  lump_500: number
  lump_100: number
  lump_50: number
  lump_10: number
  lump_5: number
  lump_1: number
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

function initFormData(store: Store, ckPrices: CKPrice[], existing: any): FormData {
  const uber_amounts: Record<string, number> = {}
  const ck_quantities: Record<string, number> = {}
  ;(store.uber_accounts ?? []).forEach(acc => { uber_amounts[acc] = 0 })
  ckPrices.forEach(p => { ck_quantities[p.item_name] = 0 })

  if (!existing) {
    return {
      pos_cash: 0, uber_amounts, panda_amount: 0, twpay_amount: 0,
      online_amount: 0, ck_quantities,
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
  ckPrices.forEach(p => {
    const o = orders.find((x: any) => x.item_name === p.item_name)
    ck_quantities[p.item_name] = o?.quantity ?? 0
  })

  return {
    pos_cash: rev.find((x: any) => x.channel === 'pos')?.gross_amount ?? 0,
    uber_amounts,
    panda_amount: rev.find((x: any) => x.channel === 'panda')?.gross_amount ?? 0,
    twpay_amount: rev.find((x: any) => x.channel === 'twpay')?.gross_amount ?? 0,
    online_amount: rev.find((x: any) => x.channel === 'online')?.gross_amount ?? 0,
    ck_quantities,
    bills_1000: cash.bills_1000 ?? 0,
    bills_500: cash.bills_500 ?? 0,
    bills_100: cash.bills_100 ?? 0,
    coins_50: cash.coins_50 ?? 0,
    coins_10: cash.coins_10 ?? 0,
    coins_5: cash.coins_5 ?? 0,
    coins_1: cash.coins_1 ?? 0,
    lump_1000: cash.lump_1000 ?? 0,
    lump_500: cash.lump_500 ?? 0,
    lump_100: cash.lump_100 ?? 0,
    lump_50: cash.lump_50 ?? 0,
    lump_10: cash.lump_10 ?? 0,
    lump_5: cash.lump_5 ?? 0,
    lump_1: cash.lump_1 ?? 0,
    note: existing.note ?? '',
  }
}

function initExpenses(existing: any): Expense[] {
  return (existing?.expense_items ?? []).map((e: any) => ({
    id: e.id,
    description: e.description,
    amount: e.amount,
  }))
}

function initHandwriteOrders(existing: any): HandwriteOrder[] {
  return (existing?.handwrite_orders ?? []).map((o: any) => ({
    id: o.id,
    order_number: o.order_number,
    amount: o.amount,
    voided: o.voided ?? false,
    void_reason: o.void_reason ?? '',
  }))
}

function calcSummary(data: FormData, store: Store, ckPrices: CKPrice[], totalExpenses: number, handwriteTotal: number) {
  const uberTotal = Object.values(data.uber_amounts).reduce((a, b) => a + b, 0)
  const platformTotal = uberTotal + data.panda_amount + data.twpay_amount + data.online_amount

  // ichef_uber_linked：iChef 總金額已含外送平台，直接就是總營業額，平台費只做扣除
  // 否則：總收 = POS現金 + 手寫訂單 + 平台
  const totalRevenue = store.ichef_uber_linked
    ? data.pos_cash
    : data.pos_cash + handwriteTotal + platformTotal

  const deliveryFee = ckPrices.reduce((s, p) => s + p.unit_price * (data.ck_quantities[p.item_name] ?? 0), 0)

  // 應包進信封 = 總營業額 − 平台費 − 其他現金支出（央廚費不扣，包在信封裡）
  const shouldEnvelope = totalRevenue - platformTotal - totalExpenses

  // 應匯入（HQ 淨收）= 應包進信封 − 央廚配送費
  const netToHQ = shouldEnvelope - deliveryFee

  // 現金清點 = 個數 × 面額 + 整筆金額
  const cashTotal =
    (data.bills_1000 * 1000 + data.lump_1000) +
    (data.bills_500  * 500  + data.lump_500)  +
    (data.bills_100  * 100  + data.lump_100)  +
    (data.coins_50   * 50   + data.lump_50)   +
    (data.coins_10   * 10   + data.lump_10)   +
    (data.coins_5    * 5    + data.lump_5)    +
    (data.coins_1    * 1    + data.lump_1)

  const actualRemit = cashTotal - store.petty_cash
  // 誤差 = 實際包進信封 − 應包進信封
  const variance = actualRemit - shouldEnvelope

  const storeRevenue = totalRevenue - platformTotal
  return { totalRevenue, platformTotal, storeRevenue, deliveryFee, totalExpenses, shouldEnvelope, netToHQ, cashTotal, actualRemit, variance }
}

function fmt(n: number) {
  return Math.round(n).toLocaleString('zh-TW')
}

function NumInput({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">{label}</Label>
      <Input
        type="number" min="0" inputMode="numeric" disabled={disabled}
        className="text-right tabular-nums text-base h-12 text-slate-900"
        value={value || ''} placeholder="0"
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
      />
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

export default function ClosingForm({ store, ckPrices, existingClosing, userId, today }: Props) {
  const [data, setData] = useState<FormData>(() => initFormData(store, ckPrices, existingClosing))
  const [expenses, setExpenses] = useState<Expense[]>(() => initExpenses(existingClosing))
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

  const set = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setData(prev => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    if (isLocked) return
    const t = setInterval(() => handleSave(true), 60000)
    return () => clearInterval(t)
  }, [data, expenses, handwriteOrders, isLocked, isDisputed])

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
      toast.error('請輸入有效的起始和結束單號')
      return
    }
    if (rangeEnd - rangeStart > 200) {
      toast.error('單次最多建立 200 筆')
      return
    }
    const existingNums = new Set(handwriteOrders.map(o => o.order_number))
    const newOrders: HandwriteOrder[] = []
    for (let n = rangeStart; n <= rangeEnd; n++) {
      if (!existingNums.has(String(n))) {
        newOrders.push({ id: crypto.randomUUID(), order_number: String(n), amount: 0, voided: false, void_reason: '' })
      }
    }
    if (newOrders.length === 0) {
      toast.info('該範圍內的單號已全部存在')
      return
    }
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
    const d = dataRef.current  // 永遠讀最新 data，避免 stale closure
    try {
      let cid = closingId

      const payload = {
        store_id: store.id, manager_id: userId, business_date: today, status: isDisputed ? 'disputed' : 'draft',
        total_revenue: s.totalRevenue,
        total_cost: s.deliveryFee,
        total_expenses: totalExpenses,
        expected_remit: s.netToHQ,
        actual_remit: s.actualRemit,
        should_include_delivery: s.shouldEnvelope,
        variance: s.variance,
        note: d.note,
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

      // Revenue items
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

      // Cash count（用 server action + service role 繞過 RLS）
      if (!cid) throw new Error('無法取得帳目 ID')
      const cashPayload = {
        bills_1000: d.bills_1000, bills_500: d.bills_500, bills_100: d.bills_100,
        coins_50: d.coins_50, coins_10: d.coins_10, coins_5: d.coins_5, coins_1: d.coins_1,
        lump_1000: d.lump_1000, lump_500: d.lump_500, lump_100: d.lump_100,
        lump_50: d.lump_50, lump_10: d.lump_10, lump_5: d.lump_5, lump_1: d.lump_1,
      }
      const cashResult = await saveCashCounts(cid, cashPayload)
      if (cashResult.error) throw new Error('現金清點儲存失敗：' + cashResult.error)

      // CK order items
      await supabase.from('order_items').delete().eq('closing_id', cid)
      const ckItems = ckPrices
        .filter(p => (d.ck_quantities[p.item_name] ?? 0) > 0)
        .map(p => ({
          closing_id: cid, vendor: '央廚', item_name: p.item_name,
          unit_price: p.unit_price, quantity: d.ck_quantities[p.item_name],
          total_amount: p.unit_price * d.ck_quantities[p.item_name],
          excel_column: p.excel_column,
        }))
      if (ckItems.length) await supabase.from('order_items').insert(ckItems)

      // Expense items
      await supabase.from('expense_items').delete().eq('closing_id', cid)
      const expItems = expenses
        .filter(e => e.description.trim() || e.amount > 0)
        .map(e => ({ closing_id: cid, description: e.description.trim() || '支出', amount: e.amount }))
      if (expItems.length) await supabase.from('expense_items').insert(expItems)

      // Handwrite orders
      await supabase.from('handwrite_orders').delete().eq('closing_id', cid)
      const hwItems = handwriteOrders
        .filter(o => o.order_number.trim())
        .map(o => ({
          closing_id: cid,
          store_id: store.id,
          order_number: o.order_number.trim(),
          amount: o.voided ? 0 : o.amount,
          voided: o.voided,
          void_reason: o.void_reason || null,
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

  const varColor = Math.abs(s.variance) === 0 ? 'text-green-600' : Math.abs(s.variance) <= 200 ? 'text-yellow-600' : 'text-red-600'
  const varBg = Math.abs(s.variance) === 0 ? 'border-green-300 bg-green-50' : Math.abs(s.variance) <= 200 ? 'border-yellow-300 bg-yellow-50' : 'border-red-300 bg-red-50'
  const varMsg = Math.abs(s.variance) === 0 ? '金額正確' : Math.abs(s.variance) <= 200 ? '差距微小，請確認' : '差距過大，請重新核查'

  return (
    <div className="max-w-xl mx-auto px-4 py-4 space-y-4 pb-32 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">每日結帳</h1>
          <p className="text-sm text-slate-500">{store.name} · {today}</p>
        </div>
        <Badge variant={isLocked ? 'default' : isDisputed ? 'destructive' : 'secondary'}>
          {status === 'draft' ? '草稿' : status === 'submitted' ? '已送出' : status === 'verified' ? '已審核' : '退回修改'}
        </Badge>
      </div>

      {/* 退回修改提示 */}
      {isDisputed && disputeNote && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-red-700">總公司已退回，請修正後重新送出</p>
          <p className="text-sm text-red-600">{disputeNote}</p>
        </div>
      )}
      {isDisputed && !disputeNote && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">總公司已退回此帳目，請修正後重新送出</p>
        </div>
      )}

      {/* 1. 營收 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-700">
            <Banknote className="h-4 w-4 text-blue-500" /> 營收輸入
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {store.mode !== 'handwrite' && (
            <div className="space-y-1">
              {store.ichef_uber_linked && (
                <p className="text-[11px] text-blue-600 bg-blue-50 rounded-md px-2 py-1">
                  輸入 iChef 結帳總金額（含外送平台）
                </p>
              )}
              <NumInput
                label={store.ichef_uber_linked ? 'iChef 結帳總金額' : 'POS 現金'}
                value={data.pos_cash}
                onChange={v => set('pos_cash', v)}
                disabled={isLocked}
              />
            </div>
          )}
          {store.ichef_uber_linked && (
            <p className="text-[11px] text-slate-400 -mt-1">↓ 輸入各平台金額（僅用於計算扣除，不加入總收）</p>
          )}
          {(store.uber_accounts ?? []).map(acc => (
            <NumInput key={acc} label={`Uber Eats（${acc}）`} value={data.uber_amounts[acc] ?? 0}
              onChange={v => set('uber_amounts', { ...data.uber_amounts, [acc]: v })} disabled={isLocked} />
          ))}
          {store.panda_enabled && (
            <NumInput label="熊貓 foodpanda" value={data.panda_amount} onChange={v => set('panda_amount', v)} disabled={isLocked} />
          )}
          {store.twpay_enabled && (
            <NumInput label="台灣Pay" value={data.twpay_amount} onChange={v => set('twpay_amount', v)} disabled={isLocked} />
          )}
          {store.online_enabled && (
            <NumInput label="線上點餐" value={data.online_amount} onChange={v => set('online_amount', v)} disabled={isLocked} />
          )}
          {store.mode !== 'ichef' && handwriteTotal > 0 && (
            <div className="flex justify-between items-center text-xs text-slate-500">
              <span>手寫訂單合計</span>
              <span className="tabular-nums font-medium text-slate-700">${fmt(handwriteTotal)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-slate-700">總營業額</span>
            <span className="text-lg font-bold tabular-nums">${fmt(s.totalRevenue)}</span>
          </div>
          {store.ichef_uber_linked && s.platformTotal > 0 && (
            <div className="flex justify-between items-center text-xs text-slate-500">
              <span>店舖現金（iChef − 平台）</span>
              <span className="tabular-nums">${fmt(s.storeRevenue)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. 手寫訂單（手寫 / 混合模式） */}
      {store.mode !== 'ichef' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-700">
              <Banknote className="h-4 w-4 text-emerald-500" /> 手寫訂單
            </CardTitle>
            <p className="text-xs text-slate-400">金額為 0 的單號不計入合計</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 批量建立單號範圍 */}
            {!isLocked && (
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-500">批量建立單號範圍</p>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number" min="1" inputMode="numeric"
                    placeholder="起始"
                    className="h-9 text-sm text-center w-24"
                    value={rangeStart || ''}
                    onChange={e => setRangeStart(parseInt(e.target.value) || 0)}
                  />
                  <span className="text-slate-400 text-sm shrink-0">—</span>
                  <Input
                    type="number" min="1" inputMode="numeric"
                    placeholder="結束"
                    className="h-9 text-sm text-center w-24"
                    value={rangeEnd || ''}
                    onChange={e => setRangeEnd(parseInt(e.target.value) || 0)}
                  />
                  <button
                    type="button"
                    onClick={generateRange}
                    className="flex items-center gap-1 px-3 h-9 rounded-lg bg-slate-700 text-white text-xs font-medium hover:bg-slate-600 transition-colors shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" /> 建立
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">已存在的單號不重複建立 · 最多 200 筆</p>
              </div>
            )}

            {/* 訂單列表（含可編輯金額與作廢） */}
            {handwriteOrders.length > 0 && (
              <div className="rounded-lg border border-slate-100 overflow-hidden divide-y divide-slate-100">
                {/* 表頭 */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-[10px] text-slate-400 font-medium">
                  <span className="flex-1">單號</span>
                  <span className="w-20 text-right">金額</span>
                  {!isLocked && <span className="w-8" />}
                  {!isLocked && <span className="w-5" />}
                </div>
                {handwriteOrders.map((o, idx) => (
                  <div key={o.id} className={cn(o.voided ? 'bg-red-50/60' : '')}>
                    {/* 主列 */}
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className={cn('flex-1 text-sm font-mono min-w-0 truncate', o.voided ? 'text-slate-400 line-through' : 'text-slate-700')}>
                        {o.order_number}
                      </span>
                      {isLocked ? (
                        o.voided
                          ? <span className="w-20 text-right text-xs font-medium text-red-400 shrink-0">作廢</span>
                          : <span className={cn('w-20 text-sm tabular-nums text-right font-medium shrink-0', o.amount === 0 ? 'text-slate-300' : '')}>
                              ${fmt(o.amount)}
                            </span>
                      ) : (
                        <Input
                          type="number" min="0" inputMode="numeric"
                          className={cn('h-8 w-20 text-sm text-right tabular-nums px-2 shrink-0', o.voided && 'opacity-30')}
                          value={o.voided ? '' : (o.amount || '')}
                          placeholder="0"
                          disabled={o.voided}
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
                        <button
                          type="button"
                          onClick={() => toggleVoidOrder(o.id)}
                          className={cn(
                            'shrink-0 h-7 w-8 text-[10px] rounded border font-semibold transition-colors',
                            o.voided
                              ? 'bg-red-100 text-red-500 border-red-300'
                              : 'bg-white text-slate-400 border-slate-200 hover:border-red-300 hover:text-red-400'
                          )}
                        >
                          廢
                        </button>
                      )}
                      {!isLocked && (
                        <button type="button" onClick={() => removeHandwriteOrder(o.id)}
                          className="shrink-0 text-slate-300 hover:text-red-500 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {/* 作廢原因 */}
                    {o.voided && (
                      <div className="px-3 pb-2">
                        {isLocked ? (
                          <p className="text-xs text-slate-400">{o.void_reason || '未填原因'}</p>
                        ) : (
                          <Input
                            placeholder="作廢原因（選填，如：廚房失誤、客人取消）"
                            className="h-7 text-xs border-red-200 focus-visible:ring-red-300"
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

            {/* 手動新增單筆 */}
            {!isLocked && (
              <div className="flex gap-2 items-end">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs text-slate-500">手動新增</Label>
                  <Input
                    ref={newOrderNumRef}
                    placeholder="單號"
                    className="h-10 text-sm font-mono"
                    value={newOrderNum}
                    onChange={e => setNewOrderNum(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); newOrderAmtRef.current?.focus() } }}
                  />
                </div>
                <div className="space-y-1 w-28">
                  <Label className="text-xs text-slate-500 invisible">金額</Label>
                  <Input
                    ref={newOrderAmtRef}
                    type="number" min="0" inputMode="numeric"
                    placeholder="金額"
                    className="h-10 text-sm text-right tabular-nums"
                    value={newOrderAmt || ''}
                    onChange={e => setNewOrderAmt(parseInt(e.target.value) || 0)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHandwriteOrder() } }}
                  />
                </div>
                <button
                  type="button"
                  onClick={addHandwriteOrder}
                  className="flex items-center gap-1 px-3 h-10 rounded-lg bg-emerald-50 text-emerald-600 text-sm hover:bg-emerald-100 transition-colors shrink-0">
                  <Plus className="h-3.5 w-3.5" /> 新增
                </button>
              </div>
            )}

            {handwriteOrders.filter(o => o.amount > 0).length > 0 ? (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-700">
                    合計（{handwriteOrders.filter(o => o.amount > 0).length} 筆有效）
                  </span>
                  <span className="text-base font-bold tabular-nums text-emerald-700">${fmt(handwriteTotal)}</span>
                </div>
              </>
            ) : handwriteOrders.length === 0 && !isLocked ? (
              <p className="text-xs text-slate-400 text-center py-2">請使用批量建立或手動新增訂單</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* 2b. 今日菜單影片 */}
      {store.mode !== 'ichef' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-700">
              <Video className="h-4 w-4 text-blue-500" /> 今日菜單影片
            </CardTitle>
            <p className="text-xs text-slate-400">上傳今日菜單影片（選填）</p>
          </CardHeader>
          <CardContent>
            <VideoUploader storeId={store.id} businessDate={today} userId={userId} disabled={isLocked} />
          </CardContent>
        </Card>
      )}

      {/* 3. 央廚配送 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-700">
            <Package className="h-4 w-4 text-orange-500" /> 央廚配送
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {ckPrices.map(p => (
            <div key={p.id} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-slate-500">{p.item_name}</Label>
                <Input
                  type="number" min="0" step="0.5" inputMode="decimal" disabled={isLocked}
                  className="text-right tabular-nums h-11"
                  value={data.ck_quantities[p.item_name] || ''} placeholder="0"
                  onChange={e => set('ck_quantities', { ...data.ck_quantities, [p.item_name]: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <span className="text-xs text-slate-400 pb-3">× ${p.unit_price}</span>
              <span className="text-sm font-medium tabular-nums pb-3 w-20 text-right">
                = ${fmt(p.unit_price * (data.ck_quantities[p.item_name] ?? 0))}
              </span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-slate-700">配送費合計</span>
            <span className="text-base font-bold tabular-nums">${fmt(s.deliveryFee)}</span>
          </div>
        </CardContent>
      </Card>

      {/* 3. 當日現金支出 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-700">
            <Wallet className="h-4 w-4 text-purple-500" /> 當日現金支出
          </CardTitle>
          <p className="text-xs text-slate-400">現金付款的進貨、雜費等（不含央廚）</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {expenses.length === 0 && !isLocked && (
            <p className="text-xs text-slate-400 text-center py-2">無當日現金支出</p>
          )}
          {expenses.map(e => (
            <div key={e.id} className="flex items-center gap-2">
              <Input
                placeholder="說明（例：菜商、雜貨）"
                className="flex-1 h-10 text-sm"
                value={e.description}
                disabled={isLocked}
                onChange={ev => updateExpense(e.id, 'description', ev.target.value)}
              />
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-400">$</span>
                <Input
                  type="number" min="0" inputMode="numeric"
                  className="w-24 h-10 text-right tabular-nums text-sm"
                  value={e.amount || ''} placeholder="0"
                  disabled={isLocked}
                  onChange={ev => updateExpense(e.id, 'amount', parseFloat(ev.target.value) || 0)}
                />
              </div>
              {!isLocked && (
                <button onClick={() => removeExpense(e.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {!isLocked && (
            <button onClick={addExpense}
              className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 transition-colors mt-1">
              <Plus className="h-3.5 w-3.5" /> 新增支出項目
            </button>
          )}
          {expenses.length > 0 && (
            <>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">支出合計</span>
                <span className="text-base font-bold tabular-nums text-purple-700">${fmt(totalExpenses)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 4. 現金清點 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-700">
            <Calculator className="h-4 w-4 text-green-500" /> 現金清點
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {/* 表頭 */}
            <div className="grid grid-cols-[3rem_1fr_1fr_3.5rem] gap-x-2 items-center">
              <span />
              <span className="text-[10px] text-slate-400 text-center">張 / 枚</span>
              <span className="text-[10px] text-slate-400 text-center">整筆金額</span>
              <span className="text-[10px] text-slate-400 text-right">小計</span>
            </div>
            {DENOMINATIONS.map(({ label, countKey, lumpKey, unit, unitLabel }) => {
              const countVal = data[countKey] as number
              const lumpVal = data[lumpKey] as number
              const subtotal = countVal * unit + lumpVal
              return (
                <div key={countKey} className="grid grid-cols-[3rem_1fr_1fr_3.5rem] gap-x-2 items-center">
                  <span className="text-xs text-slate-500 shrink-0">{label}</span>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number" min="0" inputMode="numeric" disabled={isLocked}
                      className="text-right tabular-nums h-9 text-sm px-2 w-full rounded-lg border border-slate-200 bg-transparent outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      value={countVal === 0 ? '' : countVal} placeholder="0"
                      onChange={e => set(countKey, parseInt(e.target.value) || 0)}
                      onBlur={e => set(countKey, parseInt(e.target.value) || 0)}
                    />
                    <span className="text-[10px] text-slate-400 shrink-0">{unitLabel}</span>
                  </div>
                  <input
                    type="number" min="0" inputMode="numeric" disabled={isLocked}
                    className="text-right tabular-nums h-9 text-sm px-2 w-full rounded-lg border border-slate-200 bg-transparent outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    value={lumpVal === 0 ? '' : lumpVal} placeholder="0"
                    onChange={e => set(lumpKey, parseInt(e.target.value) || 0)}
                    onBlur={e => set(lumpKey, parseInt(e.target.value) || 0)}
                  />
                  <span className={cn(
                    'text-right text-xs tabular-nums shrink-0',
                    subtotal > 0 ? 'text-slate-700 font-medium' : 'text-slate-300'
                  )}>
                    ${fmt(subtotal)}
                  </span>
                </div>
              )
            })}
          </div>
          <Separator className="my-3" />
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-sm text-slate-600">現金總額</span>
              <span className="font-bold tabular-nums text-lg">${fmt(s.cashTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">扣零用金（${fmt(store.petty_cash)}）</span>
              <span className="font-bold tabular-nums text-blue-700">${fmt(s.actualRemit)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. 結算摘要 */}
      <Card className={cn('border-2', varBg)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-700">
            <BarChart3 className="h-4 w-4" /> 結算摘要
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">總營業額</span>
            <span className="tabular-nums font-medium">${fmt(s.totalRevenue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">− 平台收款（Uber / 熊貓等）</span>
            <span className="tabular-nums text-slate-400">−${fmt(s.platformTotal)}</span>
          </div>
          {totalExpenses > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">− 現金支出</span>
              <span className="tabular-nums text-slate-400">−${fmt(totalExpenses)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>應包進信封</span>
            <span className="tabular-nums">${fmt(s.shouldEnvelope)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500 pl-2">
            <span>其中央廚配送費</span>
            <span className="tabular-nums">${fmt(s.deliveryFee)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500 pl-2">
            <span>應匯入 HQ（淨）</span>
            <span className="tabular-nums font-medium text-slate-700">${fmt(s.netToHQ)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-medium">
            <span>實際包進信封（現金 − 零用金）</span>
            <span className="tabular-nums">${fmt(s.actualRemit)}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center pt-1">
            <span className="font-bold text-slate-900 text-base">誤差</span>
            <div className="text-right">
              <p className={cn('text-3xl font-bold tabular-nums', varColor)}>
                {s.variance >= 0 ? '+' : ''}{fmt(s.variance)}
              </p>
              <p className={cn('text-xs mt-0.5', varColor)}>{varMsg}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 備註 */}
      <div className="space-y-1">
        <Label className="text-sm text-slate-600">備註</Label>
        <textarea
          disabled={isLocked}
          className="w-full min-h-[72px] px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          placeholder="如有異常情況請說明..."
          value={data.note}
          onChange={e => set('note', e.target.value)}
        />
      </div>

      {/* 操作按鈕 */}
      {!isLocked ? (
        <div className="fixed bottom-16 left-0 right-0 lg:static lg:bottom-auto bg-white lg:bg-transparent border-t lg:border-0 p-4 lg:p-0 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => handleSave()} disabled={saving || submitting}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            儲存草稿
          </Button>
          <Button
            className={cn('flex-1', isDisputed ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700')}
            onClick={handleSubmit} disabled={saving || submitting}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {isDisputed ? '修正後重新送出' : '送出今日結帳'}
          </Button>
        </div>
      ) : (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
          <p className="text-slate-600 font-medium text-sm">
            {status === 'verified' ? '此帳目已核准，如需修改請聯絡總公司' : '帳目已送出，等待總公司審核'}
          </p>
        </div>
      )}
    </div>
  )
}
