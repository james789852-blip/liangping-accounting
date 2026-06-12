'use client'

import { useState, useRef, useTransition, useCallback } from 'react'
import { Calculator, CheckCircle2, AlertTriangle, Info, Save, History } from 'lucide-react'
import { savePettyCashCount } from '@/app/actions/petty-cash'

interface HistoryRow {
  count_date: string
  updated_at?: string
  bills_1000: number; bills_500: number; bills_100: number
  coins_50: number; coins_10: number; coins_5: number; coins_1: number
  lump_1000: number; lump_500: number; lump_100: number
  lump_50: number; lump_10: number; lump_5: number; lump_1: number
}

interface Props {
  storeName: string
  pettyCash: number
  storeId: string
  today: string
  closing: { id: string; status: string; actual_remit: number; total_revenue: number; variance: number } | null
  savedPettyCashCount: any
  history: HistoryRow[]
}

const DENOMS = [
  { label: '千元鈔', countKey: 'bills_1000', lumpKey: 'lump_1000', unit: 1000, unitLabel: '張' },
  { label: '五百元', countKey: 'bills_500',  lumpKey: 'lump_500',  unit: 500,  unitLabel: '張' },
  { label: '百元鈔', countKey: 'bills_100',  lumpKey: 'lump_100',  unit: 100,  unitLabel: '張' },
  { label: '五十元', countKey: 'coins_50',   lumpKey: 'lump_50',   unit: 50,   unitLabel: '枚' },
  { label: '十元',   countKey: 'coins_10',   lumpKey: 'lump_10',   unit: 10,   unitLabel: '枚' },
  { label: '五元',   countKey: 'coins_5',    lumpKey: 'lump_5',    unit: 5,    unitLabel: '枚' },
  { label: '一元',   countKey: 'coins_1',    lumpKey: 'lump_1',    unit: 1,    unitLabel: '枚' },
]

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

function calcTotal(vals: Record<string, number>) {
  return DENOMS.reduce((s, d) => s + (vals[d.countKey] || 0) * d.unit + (vals[d.lumpKey] || 0), 0)
}

function initValues(saved: any): Record<string, number> {
  const init: Record<string, number> = {}
  DENOMS.forEach(d => {
    init[d.countKey] = saved?.[d.countKey] ?? 0
    init[d.lumpKey]  = saved?.[d.lumpKey]  ?? 0
  })
  return init
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00+08:00')
  return `${d.getMonth() + 1}/${d.getDate()}（${['日','一','二','三','四','五','六'][d.getDay()]}）`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

const BASE_INPUT: React.CSSProperties = {
  padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '10px',
  fontSize: '14px', background: 'white', outline: 'none', fontFamily: 'inherit',
  width: '100%', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
}

function NumInput({ value, onChange, inputRef, onEnter }: {
  value: number; onChange: (v: number) => void
  inputRef?: (el: HTMLInputElement | null) => void; onEnter?: () => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      ref={inputRef}
      type="number" min="0" inputMode="numeric"
      style={{
        ...BASE_INPUT,
        borderColor: focused ? '#F59E0B' : '#e4e4e7',
        boxShadow: focused ? '0 0 0 4px rgba(245,158,11,0.12)' : 'none',
      }}
      value={value === 0 ? '' : value} placeholder="0"
      onFocus={e => { setFocused(true); e.target.select() }}
      onBlur={e => { setFocused(false); onChange(parseInt(e.target.value) || 0) }}
      onChange={e => onChange(parseInt(e.target.value) || 0)}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.() } }}
    />
  )
}

export default function CashCountForm({
  storeName, pettyCash, storeId, today, closing, savedPettyCashCount, history,
}: Props) {
  const [values, setValues] = useState<Record<string, number>>(() => initValues(savedPettyCashCount))
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [isPending, startTransition] = useTransition()
  const valuesRef = useRef(values)
  valuesRef.current = values

  // inputRefs[0..6] = 左欄（張/枚），inputRefs[7..13] = 右欄（整筆金額）
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(14).fill(null))
  const focusNext = useCallback((idx: number) => {
    const next = inputRefs.current[idx + 1]
    if (next) { next.focus(); next.select() }
  }, [])

  const set = (key: string, val: number) => {
    setSaveStatus('idle')
    setValues(prev => ({ ...prev, [key]: val }))
  }

  const total = calcTotal(values)
  const diff = total - pettyCash
  const isExact = diff === 0 && total > 0
  const isClose = Math.abs(diff) <= 50 && !isExact && total > 0

  const diffColor = isExact ? '#047857' : isClose ? '#b45309' : total > 0 ? '#be123c' : '#a1a1aa'
  const diffBg    = isExact ? '#d1fae5' : isClose ? '#fef3c7' : total > 0 ? '#ffe4e6' : '#f4f4f5'
  const diffBorder = isExact ? '#6ee7b7' : isClose ? '#fcd34d' : total > 0 ? '#fda4af' : '#e4e4e7'

  const statusLabel: Record<string, string> = {
    draft: '草稿', submitted: '已送出', verified: '已審核', disputed: '退回修改'
  }

  function handleSave() {
    const v = valuesRef.current
    startTransition(async () => {
      const counts = {
        bills_1000: v.bills_1000 || 0, bills_500: v.bills_500 || 0, bills_100: v.bills_100 || 0,
        coins_50: v.coins_50 || 0, coins_10: v.coins_10 || 0, coins_5: v.coins_5 || 0, coins_1: v.coins_1 || 0,
        lump_1000: v.lump_1000 || 0, lump_500: v.lump_500 || 0, lump_100: v.lump_100 || 0,
        lump_50: v.lump_50 || 0, lump_10: v.lump_10 || 0, lump_5: v.lump_5 || 0, lump_1: v.lump_1 || 0,
      }
      const result = await savePettyCashCount(storeId, today, counts)
      if (result?.error) {
        setSaveError(result.error)
        setSaveStatus('error')
      } else {
        setSaveStatus('saved')
      }
    })
  }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* 頁首 */}
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <Calculator className="h-3.5 w-3.5" />
            現金清點
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>{storeName}</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>{today}</p>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4 pb-28">

        {/* 今日結帳狀態 */}
        {closing ? (
          <div className="bg-white rounded-2xl px-4 py-3.5 space-y-2"
            style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: '#52525b' }}>今日結帳</span>
              <span className="text-sm font-semibold" style={{ color: '#92400E' }}>{statusLabel[closing.status] ?? closing.status}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: '#52525b' }}>應包入信封</span>
              <span className="text-base font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(closing.actual_remit)}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl px-4 py-3.5 flex items-start gap-2.5"
            style={{ background: '#FFFBEB', border: '1px solid #FEF3C7' }}>
            <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#92400E' }} />
            <span className="text-sm" style={{ color: '#92400E' }}>今日尚未提交結帳，以下為零用金確認工具</span>
          </div>
        )}

        {/* 逐項清點 */}
        <div className="bg-white rounded-2xl overflow-hidden"
          style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div className="px-4 pt-4 pb-2">
            <p className="text-sm font-semibold" style={{ color: '#18181b' }}>逐項清點</p>
            <div className="grid mt-2 text-[10px] font-semibold uppercase tracking-wide"
              style={{ gridTemplateColumns: '3.5rem 1fr 1fr 3.5rem', gap: '0 8px', color: '#a1a1aa' }}>
              <span />
              <span className="text-center">張 / 枚</span>
              <span className="text-center">整筆金額</span>
              <span className="text-right">小計</span>
            </div>
          </div>

          <div className="px-4 pb-4 space-y-2.5">
            {DENOMS.map(({ label, countKey, lumpKey, unit, unitLabel }, rowIdx) => {
              const countVal = values[countKey] || 0
              const lumpVal  = values[lumpKey]  || 0
              const subtotal = countVal * unit + lumpVal
              return (
                <div key={countKey} style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 1fr 3.5rem', gap: '0 8px', alignItems: 'center' }}>
                  <span className="text-xs shrink-0" style={{ color: '#52525b' }}>{label}</span>
                  <div className="flex items-center gap-1">
                    <NumInput value={countVal} onChange={v => set(countKey, v)}
                      inputRef={el => { inputRefs.current[rowIdx] = el }}
                      onEnter={() => focusNext(rowIdx)} />
                    <span className="text-[10px] shrink-0" style={{ color: '#a1a1aa' }}>{unitLabel}</span>
                  </div>
                  <NumInput value={lumpVal} onChange={v => set(lumpKey, v)}
                    inputRef={el => { inputRefs.current[rowIdx + 7] = el }}
                    onEnter={() => focusNext(rowIdx + 7)} />
                  <span className="text-right text-xs tabular-nums shrink-0"
                    style={{ color: subtotal > 0 ? '#18181b' : '#d4d4d8', fontWeight: subtotal > 0 ? 600 : 400 }}>
                    ${fmt(subtotal)}
                  </span>
                </div>
              )
            })}

            <div style={{ borderTop: '1px solid #f4f4f5', paddingTop: '12px', marginTop: '4px' }}
              className="flex justify-between items-center">
              <span className="text-sm font-semibold" style={{ color: '#18181b' }}>清點總額</span>
              <span className="text-xl font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* 零用金核對 */}
        <div className="rounded-2xl overflow-hidden"
          style={{ border: `1.5px solid ${diffBorder}`, background: diffBg }}>
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
              {isExact ? (
                <CheckCircle2 className="h-5 w-5" style={{ color: diffColor }} />
              ) : total > 0 ? (
                <AlertTriangle className="h-5 w-5" style={{ color: diffColor }} />
              ) : (
                <Calculator className="h-5 w-5" style={{ color: '#a1a1aa' }} />
              )}
              <span className="text-sm font-semibold" style={{ color: '#18181b' }}>零用金核對</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span style={{ color: '#52525b' }}>清點總額</span>
                <span className="font-semibold tabular-nums" style={{ color: '#18181b' }}>${fmt(total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#52525b' }}>應留零用金</span>
                <span className="font-semibold tabular-nums" style={{ color: '#18181b' }}>${fmt(pettyCash)}</span>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${diffBorder}`, paddingTop: '12px' }}
              className="flex justify-between items-center">
              <span className="text-sm font-semibold" style={{ color: '#18181b' }}>差額</span>
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums" style={{ color: diffColor }}>
                  {total === 0 ? '—' : (diff >= 0 ? '+' : '') + fmt(diff)}
                </p>
                {total > 0 && (
                  <p className="text-xs mt-0.5" style={{ color: diffColor }}>
                    {isExact ? '零用金正確 ✓' :
                     isClose ? '差距微小，請再確認' :
                     diff > 0 ? `多 $${fmt(Math.abs(diff))}` : `少 $${fmt(Math.abs(diff))}`}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 儲存按鈕 */}
        <div className="space-y-2">
          <button
            type="button"
            disabled={isPending || total === 0}
            onClick={handleSave}
            className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{
              background: total === 0
                ? '#f4f4f5'
                : saveStatus === 'saved'
                ? 'linear-gradient(135deg,#10b981,#059669)'
                : 'linear-gradient(135deg,#F59E0B,#F97316)',
              color: total === 0 ? '#a1a1aa' : 'white',
              boxShadow: total === 0 ? 'none'
                : saveStatus === 'saved' ? '0 4px 12px rgba(16,185,129,0.3)'
                : '0 4px 12px rgba(245,158,11,0.3)',
              cursor: total === 0 ? 'not-allowed' : 'pointer',
            }}>
            {isPending ? (
              <span style={{ opacity: 0.8 }}>儲存中…</span>
            ) : saveStatus === 'saved' ? (
              <><CheckCircle2 className="h-4 w-4" /> 已儲存</>
            ) : (
              <><Save className="h-4 w-4" /> 儲存清點紀錄</>
            )}
          </button>

          {saveStatus === 'error' && (
            <p className="text-xs text-center" style={{ color: '#be123c' }}>{saveError}</p>
          )}

          {total > 0 && (
            <button
              type="button"
              onClick={() => { setValues(initValues(null)); setSaveStatus('idle') }}
              className="w-full py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
              清除重填
            </button>
          )}
        </div>

        {/* 近期清點紀錄 */}
        {history.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 px-1">
              <History className="h-3.5 w-3.5" style={{ color: '#a1a1aa' }} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>
                近期清點紀錄
              </span>
            </div>
            <div className="bg-white rounded-2xl overflow-hidden"
              style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              {history.map((row, idx) => {
                const rowTotal = calcTotal(row as any)
                const rowDiff  = rowTotal - pettyCash
                const rowExact = rowDiff === 0
                const rowClose = Math.abs(rowDiff) <= 50 && !rowExact
                const rColor = rowExact ? '#047857' : rowClose ? '#b45309' : '#be123c'
                return (
                  <div key={row.count_date}
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: idx !== history.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                    <span className="text-sm" style={{ color: '#52525b' }}>{formatDate(row.count_date)}</span>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: '#18181b' }}>${fmt(rowTotal)}</p>
                      <p className="text-xs tabular-nums" style={{ color: rColor }}>
                        {rowExact ? '正確 ✓' : (rowDiff >= 0 ? '+' : '') + fmt(rowDiff)}
                      </p>
                      {row.updated_at && (
                        <p className="text-[10px] mt-0.5" style={{ color: '#a1a1aa' }}>{formatTime(row.updated_at)}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
