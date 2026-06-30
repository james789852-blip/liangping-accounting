'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Download, Loader2 } from 'lucide-react'

interface Store { id: string; name: string; mode: string; closing_layout?: string }

type ReportType = 'month' | 'year'

export default function NativeExportClient({ stores }: { stores: Store[] }) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [reportType, setReportType] = useState<ReportType>('month')
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '')
  const [year, setYear] = useState(currentYear)
  const [monthNum, setMonthNum] = useState(currentMonth)
  const [downloading, setDownloading] = useState(false)

  const layout = (() => {
    const s = stores.find(s => s.id === storeId)
    if (!s) return ''
    if (s.closing_layout === 'handwrite' || s.closing_layout === 'ichef') return s.closing_layout
    return (s.mode === 'handwrite' || s.mode === 'mixed') ? 'handwrite' : 'ichef'
  })()

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)

  async function handleDownload() {
    if (!storeId) { toast.error('請選店家'); return }
    setDownloading(true)
    try {
      let url: string
      if (reportType === 'year') {
        url = `/api/export/closing-native?storeId=${storeId}&type=year&year=${year}`
      } else {
        const month = `${year}-${String(monthNum).padStart(2, '0')}`
        url = `/api/export/closing-native?storeId=${storeId}&month=${month}`
      }
      const res = await fetch(url)
      if (!res.ok) { toast.error('匯出失敗：' + await res.text()); return }
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') ?? ''
      const filenameMatch = /filename\*=UTF-8''([^;]+)/.exec(disposition)
      const filename = filenameMatch
        ? decodeURIComponent(filenameMatch[1])
        : `export-${storeId}-${year}-${reportType}.xlsx`
      const dl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = dl; a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(dl)

      // 預警：有金額但沒對應到欄位的 item — 會在 Excel 裡漏失
      const orphan = res.headers.get('X-Orphan-Items')
      if (orphan) {
        const decoded = decodeURIComponent(orphan)
        toast.warning(`⚠ 以下品項有金額但沒對應欄位，已被略過：${decoded}（請去「品項 / 分類」加進系統，或在店家品項頁啟用）`, { duration: 12000 })
      } else {
        toast.success('匯出完成')
      }
    } catch (e) {
      toast.error('匯出失敗：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      {/* 報表類型切換 */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>報表類型</label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setReportType('month')} style={tabStyle(reportType === 'month')}>
            單月報表
          </button>
          <button type="button" onClick={() => setReportType('year')} style={tabStyle(reportType === 'year')}>
            年度報表
          </button>
        </div>
      </div>

      {/* 店家 */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>店家</label>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} style={inputStyle}>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* 年份 + 月份 */}
      <div className={`grid gap-3 ${reportType === 'year' ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>年份</label>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={inputStyle}>
            {yearOptions.map(y => <option key={y} value={y}>{y} 年</option>)}
          </select>
        </div>
        {reportType === 'month' && (
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>月份</label>
            <select value={monthNum} onChange={e => setMonthNum(parseInt(e.target.value))} style={inputStyle}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m} 月</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {layout && (
        <div className="text-xs px-3 py-2 rounded-xl"
          style={{ background: layout === 'ichef' ? '#E0F2FE' : '#FEF3C7', color: layout === 'ichef' ? '#0369A1' : '#92400E' }}>
          將使用 <strong>{layout === 'ichef' ? 'B 型（iChef 連動）' : 'A 型（手寫菜單）'}</strong> 版型
        </div>
      )}

      <div className="text-xs px-3 py-2 rounded-xl" style={{ background: '#F4F4F5', color: '#52525b' }}>
        {reportType === 'month'
          ? <>📄 將產出 <strong>1 個分頁</strong>：{monthNum} 月度總覽</>
          : <>📄 將產出 <strong>13 個分頁</strong>：年度總覽 + 1~12 月度總覽</>}
      </div>

      <button onClick={handleDownload} disabled={downloading || !storeId}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
        style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: downloading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: downloading ? 0.6 : 1 }}>
        {downloading ? <><Loader2 className="h-4 w-4 animate-spin" />匯出中…</> : <><Download className="h-4 w-4" />下載 Excel</>}
      </button>

      <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
        💡 提示：所有資料即時從資料庫生成，匯出時拉的是最新版本。
      </p>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', border: '1.5px solid #e4e4e7',
  borderRadius: 10, fontSize: 14, outline: 'none', background: 'white', fontFamily: 'inherit',
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    height: 40,
    padding: '0 12px',
    border: active ? '1.5px solid #F59E0B' : '1.5px solid #e4e4e7',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    background: active ? '#FEF3C7' : 'white',
    color: active ? '#B45309' : '#52525b',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}
