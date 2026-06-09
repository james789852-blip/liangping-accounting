'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Download, FileBarChart2 } from 'lucide-react'

function fmt(n: number) {
  return n.toLocaleString('zh-TW')
}

interface MappedItem {
  vendor: string; item_name: string; excel_column: string; category: string; amount: number
}
interface UnmappedItem {
  vendor: string; item_name: string; amount: number
}
interface DayRow {
  date: string; weekday: string; revenue: number
  foodTotal: number; packTotal: number; miscTotal: number; grandTotal: number
  mappedItems: MappedItem[]; unmappedItems: UnmappedItem[]; receiptCount: number
}

interface Props {
  stores: { id: string; name: string }[]
  storeId: string
  month: string
  rows: DayRow[]
  totalMapped: number
  totalUnmapped: number
  mappingCount: number
}

const CAT_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  '食材': { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  '耗材': { bg: '#eef2ff', text: '#4338ca', border: '#c7d2fe' },
  '雜項': { bg: '#f4f4f5', text: '#52525b', border: '#e4e4e7' },
}

export default function FoodCostPreviewClient({
  stores, storeId, month, rows, totalMapped, totalUnmapped, mappingCount,
}: Props) {
  const router = useRouter()
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  function changeStore(id: string) {
    router.push(`/hq/food-cost-preview?storeId=${id}&month=${month}`)
  }
  function changeMonth(m: string) {
    router.push(`/hq/food-cost-preview?storeId=${storeId}&month=${m}`)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`/api/export/food-cost?storeId=${storeId}&month=${month}`)
      if (!res.ok) { alert('匯出失敗'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `食耗成本_${month}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const monthlyRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const monthlyFood = rows.reduce((s, r) => s + r.foodTotal, 0)
  const monthlyPack = rows.reduce((s, r) => s + r.packTotal, 0)
  const monthlyMisc = rows.reduce((s, r) => s + r.miscTotal, 0)
  const monthlyTotal = monthlyFood + monthlyPack + monthlyMisc
  const coverageRate = totalMapped + totalUnmapped === 0 ? 0
    : Math.round(totalMapped / (totalMapped + totalUnmapped) * 100)

  const hasAnyData = rows.some(r => r.receiptCount > 0)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

      {/* 選擇器 */}
      <div className="bg-white rounded-2xl px-4 py-3 flex gap-3 flex-wrap items-center" style={{ border: '1px solid #f4f4f5' }}>
        <select value={storeId} onChange={e => changeStore(e.target.value)}
          style={{ padding: '7px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="month" value={month} onChange={e => changeMonth(e.target.value)}
          style={{ padding: '7px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }} />
        <button onClick={handleExport} disabled={exporting || !hasAnyData}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white ml-auto"
          style={{ background: hasAnyData ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : '#d4d4d8', border: 'none', cursor: hasAnyData ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
          <Download className="h-3.5 w-3.5" />
          {exporting ? '匯出中…' : '匯出 Excel'}
        </button>
      </div>

      {/* 概覽卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '本月營業額', value: monthlyRevenue, color: '#6366f1' },
          { label: '食材成本', value: monthlyFood, color: '#f97316', sub: monthlyRevenue > 0 ? `佔 ${Math.round(monthlyFood / monthlyRevenue * 100)}%` : '' },
          { label: '耗材成本', value: monthlyPack, color: '#4338ca' },
          { label: '雜項成本', value: monthlyMisc, color: '#71717a' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-white rounded-2xl px-4 py-3" style={{ border: '1px solid #f4f4f5' }}>
            <p style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>{label}</p>
            <p style={{ fontSize: '20px', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              ${fmt(value)}
            </p>
            {sub && <p style={{ fontSize: '11px', color: '#a1a1aa' }}>{sub}</p>}
          </div>
        ))}
      </div>

      {/* 對應狀況 */}
      <div className="bg-white rounded-2xl px-4 py-3" style={{ border: '1px solid #f4f4f5' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold" style={{ color: '#18181b' }}>品項對應狀況</p>
          <a href="/hq/item-mappings" className="text-xs font-medium" style={{ color: '#6366f1' }}>管理對應 →</a>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#f4f4f5' }}>
            <div style={{ width: `${coverageRate}%`, height: '100%', background: 'linear-gradient(90deg,#6366f1,#22c55e)', borderRadius: '9999px', transition: 'width 0.5s' }} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: coverageRate === 100 ? '#16a34a' : coverageRate > 50 ? '#f97316' : '#ef4444' }}>
            {coverageRate}%
          </span>
        </div>
        <div className="flex gap-4 mt-2">
          <span className="flex items-center gap-1 text-xs" style={{ color: '#16a34a' }}>
            <CheckCircle2 className="h-3.5 w-3.5" />{totalMapped} 筆已對應
          </span>
          {totalUnmapped > 0 && (
            <span className="flex items-center gap-1 text-xs" style={{ color: '#ef4444' }}>
              <AlertCircle className="h-3.5 w-3.5" />{totalUnmapped} 筆未對應（需設定）
            </span>
          )}
          <span className="text-xs ml-auto" style={{ color: '#a1a1aa' }}>已設定 {mappingCount} 個品項對應</span>
        </div>
      </div>

      {/* 每日明細 */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
          <p className="text-sm font-semibold" style={{ color: '#18181b' }}>每日明細</p>
          <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>點開任一天查看細項來源</p>
        </div>

        {/* 表頭 */}
        <div className="grid px-4 py-2" style={{ gridTemplateColumns: '90px 60px 1fr 80px 80px 80px 90px', gap: '8px', borderBottom: '1px solid #f4f4f5', background: '#fafafa' }}>
          {['日期', '星期', '營業額', '食材', '耗材', '雜項', '成本合計'].map(h => (
            <span key={h} style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600, textAlign: h === '日期' || h === '星期' ? 'left' : 'right' }}>{h}</span>
          ))}
        </div>

        {rows.map(row => {
          const isExpanded = expandedDate === row.date
          const hasData = row.receiptCount > 0
          const hasUnmapped = row.unmappedItems.length > 0

          return (
            <div key={row.date} style={{ borderBottom: '1px solid #f4f4f5' }}>
              <button className="w-full text-left" onClick={() => setExpandedDate(isExpanded ? null : row.date)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <div className="grid px-4 py-2.5 hover:bg-slate-50 transition-colors"
                  style={{ gridTemplateColumns: '90px 60px 1fr 80px 80px 80px 90px', gap: '8px', alignItems: 'center' }}>
                  <div className="flex items-center gap-1.5">
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: '#6366f1' }} />
                      : <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: '#d4d4d8' }} />}
                    <span style={{ fontSize: '13px', color: '#18181b', fontWeight: hasData ? 600 : 400 }}>
                      {row.date.slice(5)}
                    </span>
                    {hasUnmapped && <AlertCircle className="h-3 w-3 shrink-0" style={{ color: '#f97316' }} />}
                  </div>
                  <span style={{ fontSize: '12px', color: '#a1a1aa' }}>{row.weekday}</span>
                  <span style={{ fontSize: '13px', color: '#18181b', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {row.revenue > 0 ? `$${fmt(row.revenue)}` : <span style={{ color: '#d4d4d8' }}>—</span>}
                  </span>
                  {[row.foodTotal, row.packTotal, row.miscTotal].map((v, i) => (
                    <span key={i} style={{ fontSize: '13px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: v > 0 ? '#18181b' : '#d4d4d8' }}>
                      {v > 0 ? `$${fmt(v)}` : '—'}
                    </span>
                  ))}
                  <span style={{ fontSize: '13px', fontWeight: row.grandTotal > 0 ? 700 : 400, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.grandTotal > 0 ? '#4338ca' : '#d4d4d8' }}>
                    {row.grandTotal > 0 ? `$${fmt(row.grandTotal)}` : '—'}
                  </span>
                </div>
              </button>

              {/* 展開細項 */}
              {isExpanded && (
                <div style={{ padding: '8px 16px 12px', background: '#fafafa', borderTop: '1px solid #f4f4f5' }}>
                  {row.receiptCount === 0 ? (
                    <p style={{ fontSize: '13px', color: '#a1a1aa' }}>當日無收據資料</p>
                  ) : (
                    <div className="space-y-3">
                      {/* 已對應品項 */}
                      {row.mappedItems.length > 0 && (
                        <div>
                          <p style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                            已對應品項（自動填入 Excel）
                          </p>
                          <div className="space-y-1">
                            {row.mappedItems.map((it, idx) => {
                              const cs = CAT_COLOR[it.category] ?? CAT_COLOR['雜項']
                              return (
                                <div key={idx} className="flex items-center gap-2" style={{ fontSize: '12px' }}>
                                  <span style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}`, padding: '1px 6px', borderRadius: '6px', fontSize: '11px', flexShrink: 0 }}>
                                    {it.category}
                                  </span>
                                  <span style={{ color: '#a1a1aa', flexShrink: 0, fontSize: '11px' }}>{it.vendor}</span>
                                  <span style={{ color: '#18181b' }}>{it.item_name}</span>
                                  <span style={{ color: '#6366f1', fontSize: '11px' }}>→ {it.excel_column}</span>
                                  <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#18181b', fontVariantNumeric: 'tabular-nums' }}>${fmt(it.amount)}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* 未對應品項 */}
                      {row.unmappedItems.length > 0 && (
                        <div>
                          <p style={{ fontSize: '11px', color: '#f97316', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <AlertCircle style={{ width: '12px', height: '12px' }} />
                            未對應品項（需至「品項對應」設定後才能計入 Excel）
                          </p>
                          <div className="space-y-1">
                            {row.unmappedItems.map((it, idx) => (
                              <div key={idx} className="flex items-center gap-2" style={{ fontSize: '12px' }}>
                                <span style={{ color: '#a1a1aa', flexShrink: 0, fontSize: '11px' }}>{it.vendor}</span>
                                <span style={{ color: '#f97316' }}>{it.item_name}</span>
                                <span style={{ color: '#ef4444', fontSize: '11px' }}>→ 未設定對應</span>
                                <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#18181b', fontVariantNumeric: 'tabular-nums' }}>${fmt(it.amount)}</span>
                              </div>
                            ))}
                          </div>
                          <a href="/hq/item-mappings" style={{ fontSize: '11px', color: '#6366f1', display: 'inline-block', marginTop: '6px' }}>
                            → 前往設定品項對應
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* 月合計列 */}
        <div className="grid px-4 py-3" style={{ gridTemplateColumns: '90px 60px 1fr 80px 80px 80px 90px', gap: '8px', background: '#f0f4ff' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#4338ca', gridColumn: '1/3' }}>月合計</span>
          <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#4338ca' }}>
            {monthlyRevenue > 0 ? `$${fmt(monthlyRevenue)}` : '—'}
          </span>
          {[monthlyFood, monthlyPack, monthlyMisc].map((v, i) => (
            <span key={i} style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#4338ca' }}>
              {v > 0 ? `$${fmt(v)}` : '—'}
            </span>
          ))}
          <span style={{ fontSize: '13px', fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#4338ca' }}>
            {monthlyTotal > 0 ? `$${fmt(monthlyTotal)}` : '—'}
          </span>
        </div>
      </div>

      {/* 說明 */}
      <div className="rounded-2xl px-4 py-4" style={{ background: '#eef2ff', border: '1px solid #c7d2fe' }}>
        <p className="text-sm font-bold mb-2" style={{ color: '#4338ca' }}>
          <FileBarChart2 className="h-4 w-4 inline mr-1" />
          如何讓資料自動流入 Excel？
        </p>
        <ol className="space-y-1" style={{ fontSize: '13px', color: '#52525b' }}>
          <li>① 店長填收據時，為每筆品項輸入品項名稱、數量、單價</li>
          <li>② 總公司在「<a href="/hq/item-mappings" style={{ color: '#6366f1', fontWeight: 600 }}>品項對應</a>」設定好每個品項名稱對應的 Excel 欄位</li>
          <li>③ 上方橘色「未對應品項」清零後，點「匯出 Excel」即完成</li>
        </ol>
      </div>
    </div>
  )
}
