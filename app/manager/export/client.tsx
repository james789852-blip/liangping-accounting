'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react'

export default function ExportClient({ storeId, storeName }: { storeId: string; storeName: string }) {
  const now = new Date()
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  )
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const res = await fetch(`/api/export/food-cost?storeId=${storeId}&month=${month}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? '匯出失敗，請稍後再試')
        return
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const cd = res.headers.get('content-disposition') ?? ''
      const match = cd.match(/filename\*=UTF-8''(.+)/)
      a.download = match ? decodeURIComponent(match[1]) : `食耗成本_${month}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
    } finally {
      setLoading(false)
    }
  }

  const [y, m] = month.split('-')
  const label = `${y} 年 ${parseInt(m)} 月`

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <FileSpreadsheet className="h-3.5 w-3.5" />
            匯出報表
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>食耗成本匯出</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>{storeName}</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl p-5 space-y-5" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>

          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: '#18181b' }}>選擇月份</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              style={{
                width: '100%', height: '44px', padding: '0 14px',
                border: '1.5px solid #e4e4e7', borderRadius: '12px',
                fontSize: '15px', outline: 'none', background: 'white',
                fontFamily: 'inherit', color: '#18181b',
              }}
            />
          </div>

          <div className="rounded-xl px-4 py-3" style={{ background: '#f4f4f5' }}>
            <p className="text-xs" style={{ color: '#71717a' }}>匯出內容</p>
            <p className="text-sm font-semibold mt-0.5" style={{ color: '#18181b' }}>
              {label} · 食耗成本明細
            </p>
            <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>
              包含每日收入、央廚配送、食材耗材雜項明細
            </p>
          </div>

          <button
            onClick={handleDownload}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm"
            style={{
              background: loading ? '#d4d4d8' : 'linear-gradient(135deg,#F59E0B,#F97316)',
              boxShadow: loading ? 'none' : '0 4px 12px rgba(245,158,11,0.3)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" />產生中…</>
              : <><Download className="h-4 w-4" />下載 Excel</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
