'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FileSpreadsheet, Upload, Download, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { syncCKMonthToSheets } from '@/app/actions/ck'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

interface CKDayRow {
  date: string
  weekday: string
  revenueTotal: number
  expenseTotal: number
  foodTotal: number
  packTotal: number
  miscTotal: number
}

interface Props {
  stores: { id: string; name: string; type?: string }[]
  storeId: string
  month: string
  rows: CKDayRow[]
  hasTemplate: boolean
  templateMeta: { filename: string; uploadedAt: string } | null
  monthTotals: { revenue: number; expense: number; food: number; pack: number; misc: number }
}

export default function CKTemplateClient({
  stores, storeId, month, rows, hasTemplate, templateMeta, monthTotals,
}: Props) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [templateOk, setTemplateOk] = useState(hasTemplate)
  const fileRef = useRef<HTMLInputElement>(null)

  const ckStores = stores.filter(s => s.type === '央廚')
  const currentStore = stores.find(s => s.id === storeId)

  function handleStoreChange(newId: string) {
    const params = new URLSearchParams()
    params.set('storeId', newId)
    params.set('month', month)
    params.set('type', 'ck')
    router.push(`/hq/food-cost-preview?${params.toString()}`)
  }

  function handleMonthChange(newMonth: string) {
    const params = new URLSearchParams()
    params.set('storeId', storeId)
    params.set('month', newMonth)
    params.set('type', 'ck')
    router.push(`/hq/food-cost-preview?${params.toString()}`)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/ck-stores/${storeId}/template`, { method: 'POST', body: fd })
      if (!res.ok) { toast.error('上傳失敗'); return }
      setTemplateOk(true)
      toast.success('模板已更新，下次匯出/同步自動套用')
      router.refresh()
    } catch { toast.error('上傳失敗') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`/api/export/ck?ckStoreId=${storeId}&month=${month}`)
      if (!res.ok) { toast.error('匯出失敗'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${currentStore?.name ?? 'export'}_${month.replace('-', '')}_央廚食耗.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('匯出完成')
    } catch { toast.error('匯出失敗') }
    finally { setExporting(false) }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const r = await syncCKMonthToSheets(storeId, month)
      if (r.error) toast.error('同步失敗：' + r.error)
      else toast.success('已同步到 Google 試算表')
    } catch (e: any) {
      toast.error('同步失敗：' + (e?.message ?? '未知錯誤'))
    } finally { setSyncing(false) }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-5 pb-28 space-y-4">
      {/* 工具列：店家、月份、模板、匯出、同步 */}
      <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <select value={storeId} onChange={e => handleStoreChange(e.target.value)}
            className="text-sm px-3 py-2 rounded-xl outline-none border transition-colors"
            style={{ border: '1.5px solid #e4e4e7', background: 'white', color: '#18181b', fontFamily: 'inherit' }}>
            {ckStores.length === 0 && <option value="">尚無央廚店家</option>}
            {ckStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="month" value={month} onChange={e => handleMonthChange(e.target.value)}
            className="text-sm px-3 py-2 rounded-xl outline-none border transition-colors"
            style={{ border: '1.5px solid #e4e4e7', background: 'white', color: '#18181b', fontFamily: 'inherit' }}
          />
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
              <FileSpreadsheet className="h-4 w-4 shrink-0" style={{ color: templateOk ? '#10b981' : '#a1a1aa' }} />
              <span className="text-xs font-medium" style={{ color: '#52525b' }}>
                {templateOk ? (templateMeta?.filename ?? '模板已設定') : '尚未上傳模板'}
              </span>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleUpload} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl shrink-0 transition-colors hover:opacity-80"
              style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {templateOk ? '更換模板' : '上傳模板'}
            </button>
            <button type="button" onClick={handleExport} disabled={exporting}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl text-white shrink-0 transition-colors hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              匯出 Excel
            </button>
            <button type="button" onClick={handleSync} disabled={syncing}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl shrink-0 transition-colors hover:opacity-80"
              style={{ background: 'white', border: '1px solid #10b981', color: '#047857' }}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              同步試算表
            </button>
          </div>
        </div>
      </div>

      {/* 月份摘要 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: '叫貨收入', value: monthTotals.revenue, color: '#10b981' },
          { label: '當月支出', value: monthTotals.expense, color: '#f97316' },
          { label: '食材', value: monthTotals.food, color: '#92400e' },
          { label: '耗材', value: monthTotals.pack, color: '#047857' },
          { label: '雜項', value: monthTotals.misc, color: '#52525b' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl px-4 py-3" style={{ border: '1px solid #f4f4f5' }}>
            <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#a1a1aa' }}>{label}</p>
            <p className="text-base font-bold tabular-nums" style={{ color }}>${fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* 每日明細 */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
          <p className="text-sm font-semibold" style={{ color: '#18181b' }}>每日明細</p>
          <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>檢視每天的叫貨收入與分類支出</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th className="text-left px-4 py-2.5 font-semibold" style={{ color: '#a1a1aa' }}>日期</th>
                <th className="text-left px-3 py-2.5 font-semibold" style={{ color: '#a1a1aa' }}>星期</th>
                <th className="text-right px-3 py-2.5 font-semibold" style={{ color: '#a1a1aa' }}>叫貨收入</th>
                <th className="text-right px-3 py-2.5 font-semibold" style={{ color: '#a1a1aa' }}>食材</th>
                <th className="text-right px-3 py-2.5 font-semibold" style={{ color: '#a1a1aa' }}>耗材</th>
                <th className="text-right px-3 py-2.5 font-semibold" style={{ color: '#a1a1aa' }}>雜項</th>
                <th className="text-right px-3 py-2.5 font-semibold" style={{ color: '#a1a1aa' }}>支出合計</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const hasData = r.revenueTotal > 0 || r.expenseTotal > 0
                return (
                  <tr key={r.date} style={{ borderTop: '1px solid #f4f4f5' }}>
                    <td className="px-4 py-2 tabular-nums" style={{ color: hasData ? '#18181b' : '#d4d4d8' }}>{r.date.slice(5)}</td>
                    <td className="px-3 py-2" style={{ color: hasData ? '#52525b' : '#d4d4d8' }}>{r.weekday}</td>
                    <td className="text-right px-3 py-2 tabular-nums" style={{ color: r.revenueTotal > 0 ? '#10b981' : '#d4d4d8' }}>{r.revenueTotal > 0 ? `$${fmt(r.revenueTotal)}` : '—'}</td>
                    <td className="text-right px-3 py-2 tabular-nums" style={{ color: r.foodTotal > 0 ? '#92400e' : '#d4d4d8' }}>{r.foodTotal > 0 ? `$${fmt(r.foodTotal)}` : '—'}</td>
                    <td className="text-right px-3 py-2 tabular-nums" style={{ color: r.packTotal > 0 ? '#047857' : '#d4d4d8' }}>{r.packTotal > 0 ? `$${fmt(r.packTotal)}` : '—'}</td>
                    <td className="text-right px-3 py-2 tabular-nums" style={{ color: r.miscTotal > 0 ? '#52525b' : '#d4d4d8' }}>{r.miscTotal > 0 ? `$${fmt(r.miscTotal)}` : '—'}</td>
                    <td className="text-right px-3 py-2 tabular-nums font-semibold" style={{ color: r.expenseTotal > 0 ? '#f97316' : '#d4d4d8' }}>{r.expenseTotal > 0 ? `$${fmt(r.expenseTotal)}` : '—'}</td>
                  </tr>
                )
              })}
              <tr style={{ background: '#fafafa', borderTop: '1.5px solid #e4e4e7' }}>
                <td className="px-4 py-2.5 font-bold" style={{ color: '#18181b' }} colSpan={2}>月合計</td>
                <td className="text-right px-3 py-2.5 tabular-nums font-bold" style={{ color: '#10b981' }}>${fmt(monthTotals.revenue)}</td>
                <td className="text-right px-3 py-2.5 tabular-nums font-bold" style={{ color: '#92400e' }}>${fmt(monthTotals.food)}</td>
                <td className="text-right px-3 py-2.5 tabular-nums font-bold" style={{ color: '#047857' }}>${fmt(monthTotals.pack)}</td>
                <td className="text-right px-3 py-2.5 tabular-nums font-bold" style={{ color: '#52525b' }}>${fmt(monthTotals.misc)}</td>
                <td className="text-right px-3 py-2.5 tabular-nums font-bold" style={{ color: '#f97316' }}>${fmt(monthTotals.expense)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl px-5 py-4" style={{ border: '1px solid #f4f4f5' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: '#52525b' }}>
          <FileSpreadsheet className="inline h-3.5 w-3.5 mr-1" />
          如何讓資料自動流入 Excel？
        </p>
        <ul className="text-xs space-y-1 pl-5" style={{ color: '#71717a', listStyleType: 'decimal' }}>
          <li>上傳央廚 Excel 模板（包含「{month.split('-')[1]}月食耗成本」工作表，第 3 列為欄位名稱）</li>
          <li>店長填入每日叫貨資料與支出明細</li>
          <li>點「匯出 Excel」下載完整檔案，或「同步試算表」自動推到 Google Sheets</li>
        </ul>
      </div>
    </div>
  )
}
