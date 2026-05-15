'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Save, Send, Calculator, Package, Banknote, BarChart3, Loader2, Trash2, Plus, Wallet } from 'lucide-react'

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
  handwrite_amount: number
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

function initFormData(store: Store, ckPrices: CKPrice[], existing: any): FormData {
  const uber_amounts: Record<string, number> = {}
  const ck_quantities: Record<string, number> = {}
  ;(store.uber_accounts ?? []).forEach(acc => { uber_amounts[acc] = 0 })
  ckPrices.forEach(p => { ck_quantities[p.item_name] = 0 })

  if (!existing) {
    return {
      pos_cash: 0, uber_amounts, panda_amount: 0, twpay_amount: 0,
      online_amount: 0, handwrite_amount: 0, ck_quantities,
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
    handwrite_amount: rev.find((x: any) => x.channel === 'handwrite')?.gross_amount ?? 0,
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

function calcSummary(data: FormData, store: Store, ckPrices: CKPrice[], totalExpenses: number) {
  const uberTotal = Object.values(data.uber_amounts).reduce((a, b) => a + b, 0)
  const platformTotal = uberTotal + data.panda_amount + data.twpay_amount + data.online_amount

  // iChef 模式：pos_cash 是 iChef 結帳總金額（已含外送平台），直接就是總營業額
  // 平台費只做扣除用，不再加到總收入
  // 其他模式：總收 = 現金 + 平台 + 手寫
  const totalRevenue = store.mode === 'ichef'
    ? data.pos_cash
    : data.pos_cash + platformTotal + data.handwrite_amount

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
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(existingClosing?.id ?? null)
  const [status, setStatus] = useState(existingClosing?.status ?? 'draft')

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const s = calcSummary(data, store, ckPrices, totalExpenses)
  const isSubmitted = status === 'submitted' || status === 'verified'

  const set = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setData(prev => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    if (isSubmitted) return
    const t = setInterval(() => handleSave(true), 60000)
    return () => clearInterval(t)
  }, [data, expenses, isSubmitted])

  function addExpense() {
    setExpenses(prev => [...prev, { id: crypto.randomUUID(), description: '', amount: 0 }])
  }

  function updateExpense(id: string, field: 'description' | 'amount', value: string | number) {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e))
  }

  function removeExpense(id: string) {
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  async function handleSave(silent = false) {
    setSaving(true)
    const supabase = createClient()
    try {
      let cid = closingId

      const payload = {
        store_id: store.id, manager_id: userId, business_date: today, status: 'draft',
        total_revenue: s.totalRevenue,
        total_cost: s.deliveryFee,
        total_expenses: totalExpenses,
        expected_remit: s.netToHQ,
        actual_remit: s.actualRemit,
        should_include_delivery: s.shouldEnvelope,
        variance: s.variance,
        note: data.note,
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
        ...(store.mode !== 'handwrite' ? [{ closing_id: cid, channel: 'pos', gross_amount: data.pos_cash, is_cash: true }] : []),
        ...(store.uber_accounts ?? []).map(acc => ({ closing_id: cid, channel: 'uber', account_name: acc, gross_amount: data.uber_amounts[acc] ?? 0, is_cash: false })),
        ...(store.panda_enabled ? [{ closing_id: cid, channel: 'panda', gross_amount: data.panda_amount, is_cash: false }] : []),
        ...(store.twpay_enabled ? [{ closing_id: cid, channel: 'twpay', gross_amount: data.twpay_amount, is_cash: false }] : []),
        ...(store.online_enabled ? [{ closing_id: cid, channel: 'online', gross_amount: data.online_amount, is_cash: false }] : []),
        ...(store.mode !== 'ichef' ? [{ closing_id: cid, channel: 'handwrite', gross_amount: data.handwrite_amount, is_cash: true }] : []),
      ]
      if (revItems.length) await supabase.from('revenue_items').insert(revItems)

      // Cash count（含整筆金額）
      await supabase.from('cash_counts').delete().eq('closing_id', cid)
      await supabase.from('cash_counts').insert({
        closing_id: cid,
        bills_1000: data.bills_1000, bills_500: data.bills_500, bills_100: data.bills_100,
        coins_50: data.coins_50, coins_10: data.coins_10, coins_5: data.coins_5, coins_1: data.coins_1,
        lump_1000: data.lump_1000, lump_500: data.lump_500, lump_100: data.lump_100,
        lump_50: data.lump_50, lump_10: data.lump_10, lump_5: data.lump_5, lump_1: data.lump_1,
        cash_total: s.cashTotal,
      })

      // CK order items
      await supabase.from('order_items').delete().eq('closing_id', cid)
      const ckItems = ckPrices
        .filter(p => (data.ck_quantities[p.item_name] ?? 0) > 0)
        .map(p => ({
          closing_id: cid, vendor: '央廚', item_name: p.item_name,
          unit_price: p.unit_price, quantity: data.ck_quantities[p.item_name],
          total_amount: p.unit_price * data.ck_quantities[p.item_name],
          excel_column: p.excel_column,
        }))
      if (ckItems.length) await supabase.from('order_items').insert(ckItems)

      // Expense items
      await supabase.from('expense_items').delete().eq('closing_id', cid)
      const expItems = expenses
        .filter(e => e.description.trim() || e.amount > 0)
        .map(e => ({ closing_id: cid, description: e.description.trim() || '支出', amount: e.amount }))
      if (expItems.length) await supabase.from('expense_items').insert(expItems)

      if (!silent) toast.success('草稿已儲存')
    } catch (err: any) {
      toast.error('儲存失敗：' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (!closingId) await handleSave(true)
    setSubmitting(true)
    const supabase = createClient()
    try {
      await supabase.from('daily_closings')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', closingId)
      setStatus('submitted')
      toast.success('今日結帳已送出！')
      if (Math.abs(s.variance) > 200) {
        await supabase.from('audit_logs').insert({
          event_type: 'variance_alert', severity: 'error',
          store_id: store.id, user_id: userId, closing_id: closingId,
          description: `${store.name} ${today} 誤差 ${Math.round(s.variance)} 元`,
          metadata: { variance: s.variance, business_date: today },
        })
      }
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
        <Badge variant={isSubmitted ? 'default' : 'secondary'}>
          {status === 'draft' ? '草稿' : status === 'submitted' ? '已送出' : status === 'verified' ? '已審核' : '異議中'}
        </Badge>
      </div>

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
              {store.mode === 'ichef' && (
                <p className="text-[11px] text-blue-600 bg-blue-50 rounded-md px-2 py-1">
                  輸入 iChef 結帳總金額（含外送平台）
                </p>
              )}
              <NumInput
                label={store.mode === 'ichef' ? 'iChef 結帳總金額' : 'POS 現金'}
                value={data.pos_cash}
                onChange={v => set('pos_cash', v)}
                disabled={isSubmitted}
              />
            </div>
          )}
          {store.mode === 'ichef' && (
            <p className="text-[11px] text-slate-400 -mt-1">↓ 輸入各平台金額（僅用於計算扣除，不加入總收）</p>
          )}
          {(store.uber_accounts ?? []).map(acc => (
            <NumInput key={acc} label={`Uber Eats（${acc}）`} value={data.uber_amounts[acc] ?? 0}
              onChange={v => set('uber_amounts', { ...data.uber_amounts, [acc]: v })} disabled={isSubmitted} />
          ))}
          {store.panda_enabled && (
            <NumInput label="熊貓 foodpanda" value={data.panda_amount} onChange={v => set('panda_amount', v)} disabled={isSubmitted} />
          )}
          {store.twpay_enabled && (
            <NumInput label="台灣Pay" value={data.twpay_amount} onChange={v => set('twpay_amount', v)} disabled={isSubmitted} />
          )}
          {store.online_enabled && (
            <NumInput label="線上點餐" value={data.online_amount} onChange={v => set('online_amount', v)} disabled={isSubmitted} />
          )}
          {store.mode !== 'ichef' && (
            <NumInput label="手寫訂單合計" value={data.handwrite_amount} onChange={v => set('handwrite_amount', v)} disabled={isSubmitted} />
          )}
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-slate-700">總營業額</span>
            <span className="text-lg font-bold tabular-nums">${fmt(s.totalRevenue)}</span>
          </div>
          {store.mode === 'ichef' && s.platformTotal > 0 && (
            <div className="flex justify-between items-center text-xs text-slate-500">
              <span>店舖現金（iChef − 平台）</span>
              <span className="tabular-nums">${fmt(s.storeRevenue)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. 央廚配送 */}
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
                  type="number" min="0" step="0.5" inputMode="decimal" disabled={isSubmitted}
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
          {expenses.length === 0 && !isSubmitted && (
            <p className="text-xs text-slate-400 text-center py-2">無當日現金支出</p>
          )}
          {expenses.map(e => (
            <div key={e.id} className="flex items-center gap-2">
              <Input
                placeholder="說明（例：菜商、雜貨）"
                className="flex-1 h-10 text-sm"
                value={e.description}
                disabled={isSubmitted}
                onChange={ev => updateExpense(e.id, 'description', ev.target.value)}
              />
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-400">$</span>
                <Input
                  type="number" min="0" inputMode="numeric"
                  className="w-24 h-10 text-right tabular-nums text-sm"
                  value={e.amount || ''} placeholder="0"
                  disabled={isSubmitted}
                  onChange={ev => updateExpense(e.id, 'amount', parseFloat(ev.target.value) || 0)}
                />
              </div>
              {!isSubmitted && (
                <button onClick={() => removeExpense(e.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {!isSubmitted && (
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
                    <Input
                      type="number" min="0" inputMode="numeric" disabled={isSubmitted}
                      className="text-right tabular-nums h-9 text-sm px-2"
                      value={countVal || ''} placeholder="0"
                      onChange={e => set(countKey, parseInt(e.target.value) || 0)}
                    />
                    <span className="text-[10px] text-slate-400 shrink-0">{unitLabel}</span>
                  </div>
                  <Input
                    type="number" min="0" inputMode="numeric" disabled={isSubmitted}
                    className="text-right tabular-nums h-9 text-sm px-2"
                    value={lumpVal || ''} placeholder="0"
                    onChange={e => set(lumpKey, parseInt(e.target.value) || 0)}
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
          disabled={isSubmitted}
          className="w-full min-h-[72px] px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          placeholder="如有異常情況請說明..."
          value={data.note}
          onChange={e => set('note', e.target.value)}
        />
      </div>

      {/* 操作按鈕 */}
      {!isSubmitted ? (
        <div className="fixed bottom-16 left-0 right-0 lg:static lg:bottom-auto bg-white lg:bg-transparent border-t lg:border-0 p-4 lg:p-0 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => handleSave()} disabled={saving || submitting}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            儲存草稿
          </Button>
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleSubmit} disabled={saving || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            送出今日結帳
          </Button>
        </div>
      ) : (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
          <p className="text-slate-600 font-medium text-sm">今日結帳已送出，如需修改請聯絡管理員</p>
        </div>
      )}
    </div>
  )
}
