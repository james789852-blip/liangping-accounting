'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Calculator, CheckCircle2, AlertTriangle, Info } from 'lucide-react'

interface Props {
  storeName: string
  pettyCash: number
  today: string
  closing: { id: string; status: string; actual_remit: number; total_revenue: number; variance: number } | null
  savedCashCounts: any
}

const DENOMS = [
  { label: '千元鈔', key: 'bills_1000', unit: 1000, unitLabel: '張' },
  { label: '五百元', key: 'bills_500',  unit: 500,  unitLabel: '張' },
  { label: '百元鈔', key: 'bills_100',  unit: 100,  unitLabel: '張' },
  { label: '五十元', key: 'coins_50',   unit: 50,   unitLabel: '枚' },
  { label: '十元',   key: 'coins_10',   unit: 10,   unitLabel: '枚' },
  { label: '五元',   key: 'coins_5',    unit: 5,    unitLabel: '枚' },
  { label: '一元',   key: 'coins_1',    unit: 1,    unitLabel: '枚' },
]

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

function initCounts(saved: any): Record<string, number> {
  const init: Record<string, number> = {}
  DENOMS.forEach(d => { init[d.key] = saved?.[d.key] ?? 0 })
  return init
}

export default function CashCountForm({ storeName, pettyCash, today, closing, savedCashCounts }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>(() => initCounts(savedCashCounts))

  const total = DENOMS.reduce((s, d) => s + (counts[d.key] || 0) * d.unit, 0)
  const diff = total - pettyCash
  const isExact = diff === 0
  const isClose = Math.abs(diff) <= 50 && !isExact

  const statusLabel: Record<string, string> = {
    draft: '草稿', submitted: '已送出', verified: '已審核', disputed: '退回修改'
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Calculator className="h-5 w-5 text-green-500" /> 現金清點
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">{storeName} · {today}</p>
      </div>

      {/* 今日結帳狀態提示 */}
      {closing ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between text-slate-600">
            <span>今日結帳</span>
            <span className="font-medium">{statusLabel[closing.status] ?? closing.status}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>應包入信封</span>
            <span className="tabular-nums font-medium">${fmt(closing.actual_remit)}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>今日尚未提交結帳，以下為零用金確認工具</span>
        </div>
      )}

      {/* 清點輸入 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">逐項清點</CardTitle>
          <div className="grid grid-cols-[3.5rem_1fr_1fr_3rem] gap-x-2 text-[10px] text-slate-400 mt-1">
            <span />
            <span className="text-center">張 / 枚數</span>
            <span className="text-center">面額</span>
            <span className="text-right">小計</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {DENOMS.map(({ label, key, unit, unitLabel }) => {
            const count = counts[key] || 0
            const subtotal = count * unit
            return (
              <div key={key} className="grid grid-cols-[3.5rem_1fr_1fr_3rem] gap-x-2 items-center">
                <span className="text-xs text-slate-500">{label}</span>
                <div className="flex items-center gap-0.5">
                  <input
                    type="number" min="0" inputMode="numeric"
                    className="text-right tabular-nums h-10 text-sm px-2 w-full rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-500"
                    value={count === 0 ? '' : count} placeholder="0"
                    onChange={e => setCounts(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                    onBlur={e => setCounts(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                  />
                  <span className="text-[10px] text-slate-400 shrink-0">{unitLabel}</span>
                </div>
                <div className="text-center text-xs text-slate-400">× ${fmt(unit)}</div>
                <span className={cn('text-right text-xs tabular-nums', subtotal > 0 ? 'text-slate-700 font-medium' : 'text-slate-300')}>
                  ${fmt(subtotal)}
                </span>
              </div>
            )
          })}

          <Separator className="my-1" />

          {/* 合計 */}
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-slate-700">清點總額</span>
            <span className="text-xl font-bold tabular-nums">${fmt(total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* 零用金比對結果 */}
      <Card className={cn('border-2', isExact ? 'border-green-300 bg-green-50' : isClose ? 'border-yellow-300 bg-yellow-50' : diff !== 0 || total > 0 ? 'border-red-300 bg-red-50' : 'border-slate-200')}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            {isExact ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (total > 0 || diff !== 0) ? (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            ) : (
              <Calculator className="h-5 w-5 text-slate-400" />
            )}
            <span className="font-semibold text-slate-800 text-sm">零用金核對</span>
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>清點總額</span>
              <span className="tabular-nums font-medium">${fmt(total)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>應留零用金</span>
              <span className="tabular-nums font-medium">${fmt(pettyCash)}</span>
            </div>
          </div>

          <Separator />

          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-900">差額</span>
            <div className="text-right">
              <p className={cn('text-3xl font-bold tabular-nums',
                isExact ? 'text-green-600' : isClose ? 'text-yellow-600' : total > 0 ? 'text-red-600' : 'text-slate-400'
              )}>
                {total === 0 ? '—' : (diff >= 0 ? '+' : '') + fmt(diff)}
              </p>
              {total > 0 && (
                <p className={cn('text-xs mt-0.5', isExact ? 'text-green-600' : isClose ? 'text-yellow-600' : 'text-red-600')}>
                  {isExact ? '零用金正確 ✓' : isClose ? '差距微小，請再確認' : diff > 0 ? `多 $${fmt(Math.abs(diff))}` : `少 $${fmt(Math.abs(diff))}`}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 重設按鈕 */}
      {total > 0 && (
        <button
          type="button"
          onClick={() => setCounts(initCounts(null))}
          className="w-full py-2.5 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition-colors"
        >
          清除重填
        </button>
      )}
    </div>
  )
}
