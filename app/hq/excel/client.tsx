'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

interface Store { id: string; name: string }

export default function HQExcelClient({ stores }: { stores: Store[] }) {
  const now = new Date()
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '')
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  )
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    if (!storeId) return
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

  const selectedStore = stores.find(s => s.id === storeId)
  const [y, m] = month.split('-')

  return (
    <div className="max-w-md mx-auto px-4 py-6 pb-28">
      <div className="bg-white rounded-2xl p-5 space-y-5" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>

        {/* 店家選擇 */}
        {stores.length > 1 && (
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: '#18181b' }}>選擇店家</label>
            <select
              value={storeId}
              onChange={e => setStoreId(e.target.value)}
              style={{
                width: '100%', height: '44px', padding: '0 14px',
                border: '1.5px solid #e4e4e7', borderRadius: '12px',
                fontSize: '15px', outline: 'none', background: 'white',
                fontFamily: 'inherit', color: '#18181b',
              }}>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* 月份選擇 */}
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

        {/* 預覽 */}
        <div className="rounded-xl px-4 py-3" style={{ background: '#f4f4f5' }}>
          <p className="text-xs" style={{ color: '#71717a' }}>匯出內容</p>
          <p className="text-sm font-semibold mt-0.5" style={{ color: '#18181b' }}>
            {selectedStore?.name ?? '—'} · {y} 年 {parseInt(m)} 月 食耗成本
          </p>
          <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>
            包含每日收入、央廚配送、食材耗材雜項明細
          </p>
        </div>

        <button
          onClick={handleDownload}
          disabled={loading || !storeId}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm"
          style={{
            background: (loading || !storeId) ? '#d4d4d8' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            boxShadow: (loading || !storeId) ? 'none' : '0 4px 12px rgba(99,102,241,0.3)',
            cursor: (loading || !storeId) ? 'not-allowed' : 'pointer',
          }}>
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" />產生中…</>
            : <><Download className="h-4 w-4" />下載 Excel</>}
        </button>
      </div>
    </div>
  )
}
