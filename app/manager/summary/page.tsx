import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getBusinessDate } from '@/lib/business-date'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import {
  CheckCircle2, AlertTriangle, Package, Banknote,
  Calculator, BarChart3, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import HandwriteOrdersList from '@/components/manager/handwrite-orders-list'
import { getPreReservedExpenseTotal } from '@/lib/pre-reserved-expenses'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

interface LargeCashExpense {
  id: string
  description: string
  amount: number
  preReserved?: boolean
}

function parseLargeCashExpenses(value: unknown): LargeCashExpense[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item: unknown) => {
      const row = item as Partial<LargeCashExpense>
      return {
        id: typeof row.id === 'string' ? row.id : `${row.description ?? 'expense'}-${row.amount ?? 0}`,
        description: typeof row.description === 'string' && row.description.trim() ? row.description.trim() : '大額支出',
        amount: Math.abs(Number(row.amount) || 0),
        preReserved: row.preReserved === true,
      }
    })
    .filter(item => item.amount > 0)
}

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  draft:     { label: '草稿',    bg: '#f1f5f9', color: '#475569' },
  submitted: { label: '已送出',  bg: '#FFFBEB', color: '#92400E' },
  verified:  { label: '已審核',  bg: '#d1fae5', color: '#065f46' },
  disputed:  { label: '退回修改', bg: '#ffe4e6', color: '#be123c' },
}

const CHANNEL_LABEL: Record<string, string> = {
  pos: 'POS 現金', uber: 'Uber Eats', panda: '熊貓',
  twpay: '台灣 Pay', online: '線上點餐', handwrite: '手寫訂單',
}

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const supabase = await createClient()
  const user = await getAuthedUser()
  if (!user) redirect('/login')
  const params = await searchParams

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, store_ids, is_hq, primary_store_id').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) return <div className="p-6" style={{ color: '#a1a1aa' }}>尚未指派店家</div>

  const realToday = getBusinessDate()
  const requested = params.date
  const today = (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= realToday)
    ? requested
    : realToday
  const closingHref = `/manager/closing?date=${encodeURIComponent(today)}`

  const [{ data: closing }, { data: store }] = await Promise.all([
    supabase.from('daily_closings')
      .select('*, revenue_items(*), order_items(*), expense_items(*), handwrite_orders(*)')
      .eq('store_id', storeId).eq('business_date', today).maybeSingle(),
    supabase.from('stores').select('name, petty_cash').eq('id', storeId).single(),
  ])

  if (closing) {
    const admin = createAdminClient()
    const { data: cashCounts } = await admin.from('cash_counts').select('*').eq('closing_id', closing.id)
    ;(closing as any).cash_counts = cashCounts ?? []
  }

  if (!closing) {
    return (
      <div className="min-h-full flex items-center justify-center" style={{ background: '#fafafa' }}>
        <div className="text-center px-6 py-16">
          <div className="h-20 w-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
            style={{ background: '#f1f5f9' }}>
            <Calculator className="h-9 w-9" style={{ color: '#a1a1aa' }} />
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ color: '#18181b' }}>此日期尚未結帳</h1>
          <p className="text-sm mb-6" style={{ color: '#a1a1aa' }}>請先完成 {today} 的結帳再查看結算結果</p>
          <Link href={closingHref}
            className="inline-flex items-center gap-2 px-5 py-3 text-white rounded-xl text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 14px rgba(245,158,11,0.3)' }}>
            前往結帳頁面
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    )
  }

  const petty = (closing as any).petty_counts as { verified_at?: string } | null | undefined
  const pettyDone = !!petty?.verified_at
  const closingIncomplete = closing.status === 'draft' || (['submitted', 'verified'].includes(closing.status) && !pettyDone)
  if (closingIncomplete) {
    const title = closing.status === 'draft' ? '此日期尚未完成結帳' : '零用金尚未核對完成'
    const desc = closing.status === 'draft'
      ? `請先完成 ${today} 的結帳再查看結算結果`
      : `請先完成 ${today} 的零用金核對，才會產生結算結果`
    return (
      <div className="min-h-full flex items-center justify-center" style={{ background: '#fafafa' }}>
        <div className="text-center px-6 py-16">
          <div className="h-20 w-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
            style={{ background: '#f1f5f9' }}>
            <Calculator className="h-9 w-9" style={{ color: '#a1a1aa' }} />
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ color: '#18181b' }}>{title}</h1>
          <p className="text-sm mb-6" style={{ color: '#a1a1aa' }}>{desc}</p>
          <Link href={closingHref}
            className="inline-flex items-center gap-2 px-5 py-3 text-white rounded-xl text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 14px rgba(245,158,11,0.3)' }}>
            前往結帳頁面
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    )
  }

  const rev = closing.revenue_items ?? []
  const cash = (closing as any).cash_counts?.[0]
  const orders = closing.order_items ?? []
  const expenseItems = closing.expense_items ?? []
  const handwriteOrders = closing.handwrite_orders ?? []
  const cashRow = cash as { large_expenses?: unknown; cash_total?: number | string } | undefined
  const largeCashExpenses = parseLargeCashExpenses(cashRow?.large_expenses)
  const largeCashExpenseTotal = largeCashExpenses.reduce((sum, item) => sum + item.amount, 0)
  const preReservedExpenseTotal = getPreReservedExpenseTotal(largeCashExpenses)
  const countedCashTotal = Number(cashRow?.cash_total ?? 0)
  const adjustedCashTotal = countedCashTotal - largeCashExpenseTotal

  // 結果頁要與送出頁一致：預留款是從實際匯入中扣除，不應繼續顯示預留前的信封金額。
  const reserveItems = Array.isArray((closing as any).reserve_items) ? (closing as any).reserve_items as any[] : []
  const totalReserved = reserveItems.reduce((sum, item) => sum + Math.max(0, Number(item?.amount) || 0), 0)
  const adjustmentTotal = Array.isArray((closing as any).remittance_adjustments)
    ? (closing as any).remittance_adjustments.reduce((sum: number, item: any) => sum + (Number(item?.amount) || 0), 0)
    : 0
  const finalRemit = Number(closing.actual_remit ?? 0) + adjustmentTotal
  const remitToHQ = finalRemit - totalReserved + preReservedExpenseTotal
  const hasReserved = totalReserved > 0
  const hasRemittanceAdjustment = adjustmentTotal !== 0
  const hasRemittanceChange = hasReserved || hasRemittanceAdjustment || preReservedExpenseTotal > 0
  const originalExpectedEnvelope = Number(closing.should_include_delivery ?? 0)
  const displayExpectedEnvelope = hasRemittanceChange ? remitToHQ : originalExpectedEnvelope
  const expectedEnvelopeDescription = hasRemittanceChange
    ? [
        hasRemittanceAdjustment ? `原始應包 ${fmt(originalExpectedEnvelope)} ${adjustmentTotal >= 0 ? '+' : '−'} 匯款調整 ${fmt(Math.abs(adjustmentTotal))}` : '',
        hasReserved ? `扣預留款 ${fmt(totalReserved)}` : '',
        preReservedExpenseTotal > 0 ? `前幾日已預留支出加回 ${fmt(preReservedExpenseTotal)}` : '',
      ].filter(Boolean).join('；')
    : ''
  const displayActualEnvelope = hasRemittanceChange ? remitToHQ : Number(closing.actual_remit ?? 0)
  const actualEnvelopeDescription = hasRemittanceChange
    ? [
        hasRemittanceAdjustment ? `原始實匯入 ${fmt(Number(closing.actual_remit ?? 0))} ${adjustmentTotal >= 0 ? '+' : '−'} 匯款調整 ${fmt(Math.abs(adjustmentTotal))}` : '',
        hasReserved ? `扣預留款 ${fmt(totalReserved)}` : '',
        preReservedExpenseTotal > 0 ? `前幾日已預留支出加回 ${fmt(preReservedExpenseTotal)}` : '',
      ].filter(Boolean).join('；')
    : `現金 ${fmt(adjustedCashTotal)} − 零用金 ${fmt(store?.petty_cash ?? 0)}`

  const st = STATUS_CFG[closing.status] ?? STATUS_CFG.draft
  const platformTotal = rev
    .filter((r: any) => ['uber', 'panda', 'twpay', 'online'].includes(r.channel))
    .reduce((s: number, r: any) => s + r.gross_amount, 0)

  const absVar = Math.abs(closing.variance)
  const varStyle = absVar === 0
    ? { bg: 'linear-gradient(135deg,#d1fae5,#ecfdf5)', border: '#6ee7b7', num: '#047857', label: '✓ 完美對帳' }
    : absVar <= 200
    ? { bg: 'linear-gradient(135deg,#fef3c7,#fffbeb)', border: '#fcd34d', num: '#b45309', label: '⚠ 小額誤差' }
    : { bg: 'linear-gradient(135deg,#ffe4e6,#fff1f2)', border: '#fda4af', num: '#be123c', label: '✕ 誤差過大' }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* 頁面標頭 */}
      <div className="bg-white px-6 py-4 sticky top-0 z-10"
        style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between max-w-xl mx-auto">
          <div>
            <p className="text-xs" style={{ color: '#a1a1aa' }}>
              每日結帳 / <strong style={{ color: '#18181b' }}>結算結果</strong>
            </p>
            <p className="text-sm font-semibold mt-0.5" style={{ color: '#18181b' }}>
              {store?.name} · {today}
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: st.bg, color: st.color }}>
            {st.label}
          </span>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4 pb-28">

        {/* 退回提示 */}
        {closing.status === 'disputed' && (
          <div className="rounded-2xl p-4 border"
            style={{ background: 'linear-gradient(135deg,#ffe4e6,#fff1f2)', borderColor: '#fda4af' }}>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: '#ffe4e6', color: '#be123c' }}>
                <AlertTriangle className="h-[18px] w-[18px]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold mb-1" style={{ color: '#be123c' }}>總公司已退回，請修正後重新送出</p>
                {(closing as any).dispute_note && (
                  <p className="text-sm" style={{ color: '#9f1239' }}>{(closing as any).dispute_note}</p>
                )}
                <Link href={`/manager/edit/${closing.id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white mt-3"
                  style={{ background: '#be123c' }}>
                  前往修改此帳目 <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Hero 卡片 */}
        <div className="rounded-3xl p-8 relative overflow-hidden text-white"
          style={{ background: 'linear-gradient(135deg,#FBBF24 0%,#F59E0B 50%,#F97316 100%)', boxShadow: '0 20px 50px -10px rgba(245,158,11,0.2)' }}>
          <div className="absolute -top-1/2 -right-[10%] w-96 h-96 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle,rgba(255,255,255,0.15),transparent)' }} />
          <div className="relative">
            <div className="flex items-center gap-2 text-sm mb-2 opacity-85">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {closing.status === 'draft' ? '草稿 · ' : '已準備好送出 · '}{store?.name}
            </div>
            <p className="font-extrabold tabular-nums leading-none mb-2"
              style={{ fontSize: 'clamp(40px,8vw,56px)', letterSpacing: '-0.03em' }}>
              $ {fmt(closing.total_revenue)}
            </p>
            <p className="text-sm mb-5 opacity-70">今日總營業額</p>
            <div className="flex gap-6 flex-wrap">
              {closing.total_cost > 0 && (
                <div>
                  <p className="text-xs mb-1 opacity-70">食耗（含配送）</p>
                  <p className="text-xl font-bold tabular-nums">${fmt(closing.total_cost)}</p>
                </div>
              )}
              <div>
                <p className="text-xs mb-1 opacity-70">應匯入</p>
                <p className="text-xl font-bold tabular-nums">${fmt(closing.expected_remit ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs mb-1 opacity-70">應包進信封</p>
                <p className="text-xl font-bold tabular-nums">${fmt(displayExpectedEnvelope)}</p>
                {hasRemittanceChange && <p className="text-[11px] mt-1 opacity-75">{expectedEnvelopeDescription}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* 匯入計算卡片 */}
        <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="h-8 w-8 rounded-xl flex items-center justify-center text-base"
              style={{ background: '#d1fae5' }}>💰</span>
            <h3 className="text-base font-semibold" style={{ color: '#18181b' }}>匯入計算</h3>
          </div>
          {[
            { label: '應匯入 HQ（淨）', hint: '營業額 − 平台收款 − 現金支出', val: `$${fmt(closing.expected_remit ?? 0)}`, color: '#18181b' },
            ...(closing.total_cost > 0 ? [{ label: '＋ 央廚配送費', hint: '代收給總公司', val: `$${fmt(closing.total_cost)}`, color: '#f97316' }] : []),
          ].map(({ label, hint, val, color }) => (
            <div key={label} className="flex items-center justify-between py-3.5"
              style={{ borderBottom: '1px solid #f4f4f5' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: '#18181b' }}>{label}</p>
                <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>{hint}</p>
              </div>
              <span className="text-lg font-bold tabular-nums shrink-0" style={{ color }}>{val}</span>
            </div>
          ))}
          <div className="flex items-center justify-between py-3.5 rounded-xl px-3 mt-2"
            style={{ background: 'linear-gradient(135deg,#FFFBEB,#f5f3ff)' }}>
            <div>
              <p className="text-sm font-bold" style={{ color: '#92400E' }}>＝ 應包進信封</p>
              {hasRemittanceChange && <p className="text-xs mt-1" style={{ color: '#b45309' }}>{expectedEnvelopeDescription}</p>}
            </div>
            <span className="text-2xl font-extrabold tabular-nums" style={{ color: '#92400E' }}>${fmt(displayExpectedEnvelope)}</span>
          </div>
          <div className="flex items-center justify-between py-3.5 mt-1">
            <div>
              <p className="text-sm font-medium" style={{ color: '#18181b' }}>實際包進信封</p>
              <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>{actualEnvelopeDescription}</p>
            </div>
            <span className="text-lg font-bold tabular-nums" style={{ color: '#18181b' }}>
              ${fmt(displayActualEnvelope)}
            </span>
          </div>
        </div>

        {/* 誤差結果 */}
        <div className="rounded-2xl p-6 relative overflow-hidden" style={{
          background: varStyle.bg, border: `1px solid ${varStyle.border}`,
        }}>
          <p className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: '#52525b' }}>
            {absVar === 0
              ? <CheckCircle2 className="h-[18px] w-[18px]" style={{ color: '#047857' }} />
              : <AlertTriangle className="h-[18px] w-[18px]" style={{ color: absVar <= 200 ? '#b45309' : '#be123c' }} />
            }
            {varStyle.label}
          </p>
          <p className="font-extrabold tabular-nums" style={{ fontSize: '40px', letterSpacing: '-0.02em', color: varStyle.num, lineHeight: 1 }}>
            $ {fmt(closing.variance)}
          </p>
          <p className="text-sm mt-3" style={{ color: '#52525b' }}>
            {absVar === 0 ? '完美對帳！清點與輸入完全吻合，可送出。'
              : absVar <= 200 ? '小額誤差（在 ±200 容忍範圍內），可送出但建議再核查。'
              : '⚠ 已超過 ±200 上限。請重新檢查現金清點與輸入金額。'}
          </p>
        </div>

        {/* 信封袋資訊 */}
        <div className="rounded-2xl p-5" style={{
          background: 'linear-gradient(135deg,#fef3c7,#fce7f3)',
          border: '1px solid rgba(255,255,255,0.5)',
        }}>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="h-8 w-8 rounded-xl flex items-center justify-center text-base bg-white">✉️</span>
            <h3 className="text-base font-semibold" style={{ color: '#18181b' }}>信封袋資訊</h3>
          </div>
          <div className="bg-white rounded-xl p-4 text-sm space-y-1.5" style={{ lineHeight: 1.8 }}>
            <div><strong style={{ color: '#52525b' }}>日期：</strong>{today}</div>
            <div><strong style={{ color: '#52525b' }}>店名：</strong>{store?.name}</div>
            <div className="pt-2 mt-1" style={{ borderTop: '1px solid #f4f4f5' }}>
              <strong style={{ color: '#52525b' }}>實匯入金額：</strong>
              <span className="font-extrabold text-2xl tabular-nums ml-1" style={{ color: '#92400E', letterSpacing: '-0.02em' }}>
                ${fmt(displayActualEnvelope)}
              </span>
            </div>
          </div>
        </div>

        {/* 營收明細 */}
        {rev.filter((r: any) => r.channel !== 'handwrite').length > 0 && (
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: '#FFFBEB' }}>
                <Banknote className="h-[18px] w-[18px]" style={{ color: '#92400E' }} />
              </span>
              <h3 className="text-sm font-semibold" style={{ color: '#18181b' }}>營收明細</h3>
            </div>
            <div className="space-y-2">
              {rev.filter((r: any) => r.channel !== 'handwrite').map((r: any) => (
                <div key={r.id} className="flex justify-between items-center py-1">
                  <span className="text-sm" style={{ color: '#52525b' }}>
                    {CHANNEL_LABEL[r.channel] ?? r.channel}
                    {r.account_name ? `（${r.account_name}）` : ''}
                  </span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: '#18181b' }}>${fmt(r.gross_amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid #f4f4f5' }}>
                <span className="text-sm font-bold" style={{ color: '#18181b' }}>總計</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(closing.total_revenue)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 手寫訂單 */}
        {handwriteOrders.length > 0 && (
          <HandwriteOrdersList orders={handwriteOrders} />
        )}

        {/* 央廚配送 */}
        {orders.length > 0 && (
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="h-8 w-8 rounded-xl flex items-center justify-center text-base" style={{ background: '#ffedd5' }}>🚚</span>
              <h3 className="text-sm font-semibold" style={{ color: '#18181b' }}>央廚配送</h3>
            </div>
            <div className="space-y-2">
              {orders.map((o: any) => (
                <div key={o.id} className="flex justify-between items-center py-1">
                  <span className="text-sm" style={{ color: '#52525b' }}>{o.item_name} × {o.quantity}</span>
                  <span className="text-sm font-medium tabular-nums" style={{ color: '#18181b' }}>${fmt(o.total_amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-3 px-3 rounded-xl mt-1" style={{ background: '#ffedd5' }}>
                <span className="text-sm font-bold" style={{ color: '#c2410c' }}>配送費合計</span>
                <span className="text-xl font-extrabold tabular-nums" style={{ color: '#c2410c' }}>${fmt(closing.total_cost)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 現金支出 */}
        {expenseItems.length > 0 && (
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#f5f3ff' }}>
                <Banknote className="h-[18px] w-[18px]" style={{ color: '#7c3aed' }} />
              </span>
              <h3 className="text-sm font-semibold" style={{ color: '#18181b' }}>當日現金支出</h3>
            </div>
            <div className="space-y-2">
              {expenseItems.map((e: any) => (
                <div key={e.id} className="flex justify-between items-center py-1">
                  <span className="text-sm" style={{ color: '#52525b' }}>{e.description}</span>
                  <span className="text-sm font-medium tabular-nums" style={{ color: '#18181b' }}>${fmt(e.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid #f4f4f5' }}>
                <span className="text-sm font-bold" style={{ color: '#18181b' }}>支出合計</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: '#7c3aed' }}>${fmt(closing.total_expenses ?? 0)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 現金清點摘要 */}
        {cash && (
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#d1fae5' }}>
                <Calculator className="h-[18px] w-[18px]" style={{ color: '#047857' }} />
              </span>
              <h3 className="text-sm font-semibold" style={{ color: '#18181b' }}>現金清點</h3>
            </div>
            <div className="space-y-1">
              {([
                { label: '千元鈔', ck: 'bills_1000', lk: 'lump_1000', unit: 1000 },
                { label: '五百元', ck: 'bills_500',  lk: 'lump_500',  unit: 500  },
                { label: '百元鈔', ck: 'bills_100',  lk: 'lump_100',  unit: 100  },
                { label: '五十元', ck: 'coins_50',   lk: 'lump_50',   unit: 50   },
                { label: '十元',   ck: 'coins_10',   lk: 'lump_10',   unit: 10   },
                { label: '五元',   ck: 'coins_5',    lk: 'lump_5',    unit: 5    },
                { label: '一元',   ck: 'coins_1',    lk: 'lump_1',    unit: 1    },
              ]).map(({ label, ck, lk, unit }) => {
                const count = (cash as any)[ck] ?? 0
                const lump  = (cash as any)[lk] ?? 0
                const sub   = count * unit + lump
                if (sub === 0) return null
                return (
                  <div key={label} className="flex justify-between items-center py-1">
                    <span className="text-sm" style={{ color: '#52525b' }}>{label}</span>
                    <span className="text-sm font-medium tabular-nums" style={{ color: '#18181b' }}>${fmt(sub)}</span>
                  </div>
                )
              })}
              <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid #f4f4f5' }}>
                <span className="text-sm font-bold" style={{ color: '#18181b' }}>{largeCashExpenseTotal > 0 ? '現金清點小計' : '現金總額'}</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(countedCashTotal)}</span>
              </div>
              {largeCashExpenses.map(item => (
                <div key={item.id} className="flex justify-between items-center py-1">
                  <span className="text-xs" style={{ color: '#c2410c' }}>{item.description}</span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: '#dc2626' }}>-${fmt(item.amount)}</span>
                </div>
              ))}
              {largeCashExpenseTotal > 0 && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-bold" style={{ color: '#18181b' }}>現金總額</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(adjustedCashTotal)}</span>
                </div>
              )}
              {hasRemittanceAdjustment && (
                <>
                  {(closing as any).remittance_adjustments
                    .filter((item: any) => Number(item?.amount) !== 0)
                    .map((item: any, index: number) => (
                      <div key={`adjustment-${index}`} className="flex justify-between items-center py-1">
                        <span className="text-xs" style={{ color: '#2563eb' }}>{item.label || '匯款調整'}</span>
                        <span className="text-sm font-semibold tabular-nums" style={{ color: Number(item.amount) >= 0 ? '#047857' : '#2563eb' }}>
                          {Number(item.amount) >= 0 ? '+' : '−'}${fmt(Math.abs(Number(item.amount) || 0))}
                        </span>
                      </div>
                    ))}
                </>
              )}
              <div className="flex justify-between items-center py-1">
                <span className="text-xs" style={{ color: '#a1a1aa' }}>
                  {hasRemittanceChange ? '調整前實匯入' : `扣零用金（$${fmt(store?.petty_cash ?? 0)}）`}
                </span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: '#92400E' }}>${fmt(hasRemittanceChange ? finalRemit : Number(closing.actual_remit ?? 0))}</span>
              </div>
              {hasReserved && (
                <>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs" style={{ color: '#a1a1aa' }}>扣預留款</span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: '#c2410c' }}>−${fmt(totalReserved)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm font-bold" style={{ color: '#18181b' }}>實際匯入公司</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: '#047857' }}>${fmt(remitToHQ)}</span>
                  </div>
                </>
              )}
              {hasRemittanceAdjustment && !hasReserved && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-bold" style={{ color: '#18181b' }}>實際匯入公司</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: '#047857' }}>${fmt(remitToHQ)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 備註 */}
        {(closing as any).note && (
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5' }}>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#a1a1aa' }}>備註</p>
            <p className="text-sm" style={{ color: '#52525b' }}>{(closing as any).note}</p>
          </div>
        )}

        {/* 底部按鈕 */}
        <div className="flex gap-3 pt-2">
          <Link
            href={closing.status === 'disputed' ? `/manager/edit/${closing.id}` : closing.status === 'draft' ? closingHref : '/manager/dashboard'}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 14px rgba(245,158,11,0.2)' }}>
            <BarChart3 className="h-4 w-4" />
            {closing.status === 'disputed' ? '修改帳目' : closing.status === 'draft' ? '繼續填寫結帳' : '回到今日狀態頁面'}
          </Link>
        </div>

      </div>
    </div>
  )
}
