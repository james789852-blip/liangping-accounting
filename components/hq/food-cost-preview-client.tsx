'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Download, FileBarChart2, Upload } from 'lucide-react'
import { setItemMapping } from '@/app/actions/item-mappings'

function fmt(n: number) {
  return n.toLocaleString('zh-TW')
}

interface MappedItem {
  vendor: string; item_name: string; excel_column: string; category: string; vendor_group: string | null; amount: number
}
interface UnmappedItem {
  vendor: string; item_name: string; amount: number
}
interface DayRow {
  date: string; weekday: string; revenue: number
  foodTotal: number; packTotal: number; miscTotal: number; grandTotal: number
  mappedItems: MappedItem[]; unmappedItems: UnmappedItem[]; receiptCount: number
}

type StoreMapping = { id: string; item_name: string; excel_column: string; item_category: string; vendor_group?: string | null }

interface Props {
  stores: { id: string; name: string; type?: string }[]
  storeId: string
  month: string
  rows: DayRow[]
  totalMapped: number
  totalUnmapped: number
  mappingCount: number
  colBreakdown: { col: string; category: string; vendor_group: string | null; total: number }[]
  hasTemplate: boolean
  templateColumns: Record<string, string[]> | null
  templateMeta: { filename: string; uploadedAt: string } | null
  storeMappings: StoreMapping[]
}

const CAT_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  '食材': { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  '耗材': { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  '雜項': { bg: '#f4f4f5', text: '#52525b', border: '#e4e4e7' },
}

export default function FoodCostPreviewClient({
  stores, storeId, month, rows, totalMapped, totalUnmapped, mappingCount, colBreakdown,
  hasTemplate, templateColumns, templateMeta, storeMappings,
}: Props) {
  const router = useRouter()
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [templateOk, setTemplateOk] = useState(hasTemplate)
  const [toast, setToast] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [assigningItem, setAssigningItem] = useState<string | null>(null)
  const [assigningSearch, setAssigningSearch] = useState('')
  const [assigningSaving, setAssigningSaving] = useState(false)

  useEffect(() => { setAssigningItem(null) }, [rows])

  async function handleAssignColumn(itemName: string, colName: string, category: '食材' | '耗材' | '雜項') {
    setAssigningSaving(true)
    try {
      await setItemMapping(itemName, colName, category, storeId)
      setAssigningItem(null)
      setAssigningSearch('')
      router.refresh()
    } finally {
      setAssigningSaving(false)
    }
  }

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
      const mode = res.headers.get('X-Export-Mode')
      const debug = res.headers.get('X-Template-Debug') ?? ''
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `食耗成本_${month}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      if (mode === 'template') {
        setToast('✓ 已套用模板格式匯出')
      } else if (templateOk) {
        setToast(`⚠ 模板載入失敗（${debug}），已以預設格式匯出`)
      }
    } finally {
      setExporting(false)
      setTimeout(() => setToast(''), 5000)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/stores/${storeId}/excel-template`, { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setToast(j.error ?? '上傳失敗')
      } else {
        const j = await res.json().catch(() => ({}))
        const counts = j.counts
        setTemplateOk(true)
        setToast(counts
          ? `✓ 模板已更新，已自動建立對應：食材 ${counts['食材']} 欄、耗材 ${counts['耗材']} 欄、雜項 ${counts['雜項']} 欄`
          : '✓ 模板已更新（未能解析欄位，請確認格式）'
        )
        router.refresh()
      }
    } finally {
      setUploading(false)
      setTimeout(() => setToast(''), 6000)
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

      {/* 工具列：手機分行、桌機橫排 */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 space-y-3" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        {/* 第 1 行：店家 + 月份 */}
        <div className="flex items-center gap-2">
          <select value={storeId} onChange={e => changeStore(e.target.value)}
            className="flex-1 min-w-0"
            style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="month" value={month} onChange={e => changeMonth(e.target.value)}
            className="shrink-0"
            style={{ padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b', maxWidth: '160px' }} />
        </div>
        {/* 第 2 行：模板狀態 */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
          <FileBarChart2 className="h-4 w-4 shrink-0" style={{ color: templateOk ? '#10b981' : '#a1a1aa' }} />
          {templateMeta ? (
            <div className="leading-tight min-w-0 flex-1">
              <p className="truncate" style={{ fontSize: '12px', fontWeight: 600, color: '#52525b' }}>{templateMeta.filename}</p>
              <p suppressHydrationWarning style={{ fontSize: '10px', color: '#a1a1aa' }}>
                {new Date(templateMeta.uploadedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
              </p>
            </div>
          ) : (
            <span className="text-xs font-medium" style={{ color: '#a1a1aa' }}>尚未上傳模板</span>
          )}
        </div>
        {/* 第 3 行：動作按鈕（手機 2 等分，桌機並排） */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2 sm:justify-end">
          <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={handleUpload} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'white', border: '1.5px solid #e4e4e7', cursor: 'pointer', fontFamily: 'inherit', color: '#52525b' }}>
            <Upload className="h-3.5 w-3.5" />
            {uploading ? '上傳中…' : templateOk ? '更換模板' : '上傳模板'}
          </button>
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(245,158,11,0.25)' }}>
            <Download className="h-3.5 w-3.5" />
            {exporting ? '匯出中…' : '匯出 Excel'}
          </button>
        </div>
      </div>
      {toast && (
        <div className="rounded-xl px-4 py-2.5 text-sm font-medium" style={{ background: toast.startsWith('✓') ? '#f0fdf4' : '#fef2f2', color: toast.startsWith('✓') ? '#16a34a' : '#dc2626', border: `1px solid ${toast.startsWith('✓') ? '#bbf7d0' : '#fecaca'}` }}>
          {toast}
        </div>
      )}


      {/* 概覽卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '本月營業額', value: monthlyRevenue, color: '#F59E0B' },
          { label: '食材成本', value: monthlyFood, color: '#f97316', sub: monthlyRevenue > 0 ? `佔 ${Math.round(monthlyFood / monthlyRevenue * 100)}%` : '' },
          { label: '耗材成本', value: monthlyPack, color: '#92400E' },
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
          <a href={storeId ? `/hq/item-mappings?storeId=${storeId}` : '/hq/item-mappings'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 2px 8px rgba(245,158,11,0.25)' }}>
            🔧 品項對應管理（新增/排序/類別）
          </a>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#f4f4f5' }}>
            <div style={{ width: `${coverageRate}%`, height: '100%', background: 'linear-gradient(90deg,#F59E0B,#22c55e)', borderRadius: '9999px', transition: 'width 0.5s' }} />
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
                      ? <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: '#F59E0B' }} />
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
                  <span style={{ fontSize: '13px', fontWeight: row.grandTotal > 0 ? 700 : 400, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.grandTotal > 0 ? '#92400E' : '#d4d4d8' }}>
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
                                    {it.vendor_group || it.category}
                                  </span>
                                  <span style={{ color: '#a1a1aa', flexShrink: 0, fontSize: '11px' }}>{it.vendor}</span>
                                  <span style={{ color: '#18181b' }}>{(() => {
                                    const vg = it.vendor_group?.trim()
                                    return vg && it.item_name.startsWith(vg) && it.item_name !== vg ? it.item_name.slice(vg.length) : it.item_name
                                  })()}</span>
                                  <span style={{ color: '#F59E0B', fontSize: '11px' }}>→ {it.excel_column}</span>
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
                            未對應品項（指定 Excel 欄位後即可計入）
                          </p>
                          <div className="space-y-1.5">
                            {row.unmappedItems.map((it, idx) => {
                              const isAssigning = assigningItem === `${row.date}-${it.item_name}-${idx}`
                              const key = `${row.date}-${it.item_name}-${idx}`
                              return (
                                <div key={idx} className="flex items-center gap-2 flex-wrap" style={{ fontSize: '12px' }}>
                                  <span style={{ color: '#a1a1aa', flexShrink: 0, fontSize: '11px' }}>{it.vendor}</span>
                                  <span style={{ color: '#f97316', fontWeight: 500 }}>{it.item_name}</span>
                                  <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#18181b', fontVariantNumeric: 'tabular-nums' }}>${fmt(it.amount)}</span>
                                  {isAssigning ? (
                                    <div style={{ position: 'relative', width: '100%' }}>
                                      <input autoFocus value={assigningSearch} onChange={e => setAssigningSearch(e.target.value)}
                                        onKeyDown={e => e.key === 'Escape' && (setAssigningItem(null), setAssigningSearch(''))}
                                        placeholder="搜尋欄位名稱…"
                                        style={{ width: '100%', padding: '4px 10px', border: '1.5px solid #F59E0B', borderRadius: '8px', fontSize: '12px', outline: 'none', fontFamily: 'inherit' }} />
                                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'white', border: '1px solid #e4e4e7', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' }}>
                                        {templateColumns
                                          ? (['食材', '耗材', '雜項'] as const).map(cat => {
                                              const cols = (templateColumns[cat] ?? []).filter(c => !assigningSearch || c.includes(assigningSearch))
                                              if (!cols.length) return null
                                              return (
                                                <div key={cat}>
                                                  <p style={{ fontSize: '10px', fontWeight: 700, color: '#a1a1aa', padding: '6px 12px 2px', letterSpacing: '0.05em' }}>{cat}</p>
                                                  {cols.map(col => (
                                                    <button key={col} disabled={assigningSaving}
                                                      onMouseDown={e => { e.preventDefault(); handleAssignColumn(it.item_name, col, cat) }}
                                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: '13px', background: 'none', border: 'none', borderBottom: '1px solid #f9f9f9', cursor: 'pointer', color: '#18181b', fontFamily: 'inherit' }}>
                                                      {col}
                                                    </button>
                                                  ))}
                                                </div>
                                              )
                                            })
                                          : <p style={{ padding: '8px 12px', fontSize: '12px', color: '#a1a1aa' }}>請先上傳 Excel 模板</p>
                                        }
                                      </div>
                                      <button onClick={() => { setAssigningItem(null); setAssigningSearch('') }}
                                        style={{ position: 'absolute', right: '6px', top: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: '14px', lineHeight: 1 }}>✕</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => { setAssigningItem(key); setAssigningSearch('') }}
                                      style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', color: '#ea580c', fontFamily: 'inherit', fontWeight: 600 }}>
                                      指定欄位
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
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
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#92400E', gridColumn: '1/3' }}>月合計</span>
          <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#92400E' }}>
            {monthlyRevenue > 0 ? `$${fmt(monthlyRevenue)}` : '—'}
          </span>
          {[monthlyFood, monthlyPack, monthlyMisc].map((v, i) => (
            <span key={i} style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#92400E' }}>
              {v > 0 ? `$${fmt(v)}` : '—'}
            </span>
          ))}
          <span style={{ fontSize: '13px', fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#92400E' }}>
            {monthlyTotal > 0 ? `$${fmt(monthlyTotal)}` : '—'}
          </span>
        </div>
      </div>

      {/* 本月欄位明細 */}
      {colBreakdown.length > 0 && (() => {
        const GROUP_PALETTE = [
          { bg: '#fef3c7', color: '#92400e', bar: '#f59e0b' },
          { bg: '#dcfce7', color: '#166534', bar: '#22c55e' },
          { bg: '#FFFBEB', color: '#92400E', bar: '#F59E0B' },
          { bg: '#fce7f3', color: '#9d174d', bar: '#FBBF24' },
          { bg: '#f0f9ff', color: '#0c4a6e', bar: '#0ea5e9' },
          { bg: '#fdf4ff', color: '#6b21a8', bar: '#a855f7' },
          { bg: '#f4f4f5', color: '#52525b', bar: '#a1a1aa' },
        ]
        const groupMap: { key: string; items: typeof colBreakdown; total: number }[] = []
        for (const item of colBreakdown) {
          const key = item.vendor_group || item.category
          const existing = groupMap.find(g => g.key === key)
          if (existing) { existing.items.push(item); existing.total += item.total }
          else groupMap.push({ key, items: [item], total: item.total })
        }

        return (
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
              <p className="text-sm font-semibold" style={{ color: '#18181b' }}>本月欄位明細</p>
              <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>依廠商類別分組，各品項欄位當月累計金額</p>
            </div>
            <div className="divide-y" style={{ borderColor: '#f4f4f5' }}>
              {groupMap.map(({ key, items, total }, gi) => {
                const cs = GROUP_PALETTE[gi % GROUP_PALETTE.length]
                return (
                  <div key={key} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: cs.bg, color: cs.color }}>{key}</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: cs.color }}>${fmt(total)}</span>
                    </div>
                    <div className="space-y-1.5">
                      {items.map(({ col, total: colTotal }) => (
                        <div key={col} className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: '#52525b', width: '7rem', flexShrink: 0 }}>{col}</span>
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#f4f4f5' }}>
                            <div style={{ width: `${Math.min(100, total > 0 ? (colTotal / total * 100) : 0)}%`, height: '100%', background: cs.bar, borderRadius: '9999px' }} />
                          </div>
                          <span className="text-xs font-semibold tabular-nums" style={{ color: '#18181b', width: '4.5rem', textAlign: 'right' }}>${fmt(colTotal)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* 說明 */}
      <div className="rounded-2xl px-4 py-4" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
        <p className="text-sm font-bold mb-2" style={{ color: '#92400E' }}>
          <FileBarChart2 className="h-4 w-4 inline mr-1" />
          如何讓資料自動流入 Excel？
        </p>
        <ol className="space-y-1" style={{ fontSize: '13px', color: '#52525b' }}>
          <li>① 店長填收據時，為每筆品項輸入品項名稱、數量、單價</li>
          <li>② 展開任一天，對「未對應品項」點「指定欄位」，選擇對應的 Excel 欄位</li>
          <li>③ 橘色「未對應品項」清零後，點「匯出 Excel」即完成</li>
        </ol>
      </div>
    </div>
  )
}
