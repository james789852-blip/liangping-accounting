'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Download, Loader2 } from 'lucide-react'
import { getMonthlyStats } from '@/app/actions/monthly-stats'

interface Store { id: string; name: string; mode: string; closing_layout?: string }

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

interface Stats {
  revenue: number
  posTotal: number
  ck: number
  food: number
  pack: number
  misc: number
  totalCost: number
  vendorBreakdown: Array<{ vendor_group: string; doc_type: string; food: number; pack: number; misc: number }>
}

export default function NativeExportClient({ stores }: { stores: Store[] }) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [storeId, setStoreId] = useState(stores[0]?.id ?? '')
  const [year, setYear] = useState(currentYear)
  const [monthNum, setMonthNum] = useState(currentMonth)
  const [downloading, setDownloading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)
  const storeName = stores.find(s => s.id === storeId)?.name ?? ''

  // 當店家 / 年 / 月變動 → 自動載入預覽
  useEffect(() => {
    if (!storeId) return
    setLoading(true)
    setStats(null)
    getMonthlyStats(storeId, year, monthNum)
      .then(r => {
        if ('error' in r && r.error) { toast.error(r.error); return }
        if ('stats' in r) setStats(r.stats as Stats)
      })
      .catch(e => toast.error('載入失敗：' + (e instanceof Error ? e.message : String(e))))
      .finally(() => setLoading(false))
  }, [storeId, year, monthNum])

  async function handleDownload() {
    if (!storeId) { toast.error('請選店家'); return }
    setDownloading(true)
    try {
      const month = `${year}-${String(monthNum).padStart(2, '0')}`
      const url = `/api/export/closing-native?storeId=${storeId}&month=${month}`
      const res = await fetch(url)
      if (!res.ok) { toast.error('匯出失敗：' + await res.text()); return }
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') ?? ''
      const filenameMatch = /filename\*=UTF-8''([^;]+)/.exec(disposition)
      const filename = filenameMatch
        ? decodeURIComponent(filenameMatch[1])
        : `${storeName}_${year}年${monthNum}月_月度總覽.xlsx`
      const dl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = dl; a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(dl)
      toast.success('匯出完成')
    } catch (e) {
      toast.error('匯出失敗：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 設定區 */}
      <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        {/* 店家 */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>店家</label>
          <select value={storeId} onChange={e => setStoreId(e.target.value)} style={inputStyle}>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* 年月 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>年份</label>
            <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={inputStyle}>
              {yearOptions.map(y => <option key={y} value={y}>{y} 年</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>月份</label>
            <select value={monthNum} onChange={e => setMonthNum(parseInt(e.target.value))} style={inputStyle}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m} 月</option>
              ))}
            </select>
          </div>
        </div>

        <button onClick={handleDownload} disabled={downloading || !storeId}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: downloading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: downloading ? 0.6 : 1 }}>
          {downloading ? <><Loader2 className="h-4 w-4 animate-spin" />匯出中…</> : <><Download className="h-4 w-4" />下載 Excel（{storeName} {monthNum}月）</>}
        </button>
      </div>

      {/* 月度資料預覽 */}
      <div className="bg-white rounded-2xl p-5 space-y-3" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3 className="text-base font-bold" style={{ color: '#18181b' }}>{storeName} {year} 年 {monthNum} 月 月度總覽</h3>
        {loading && (
          <div className="text-center py-8 text-sm" style={{ color: '#a1a1aa' }}>
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            載入中…
          </div>
        )}
        {!loading && !stats && (
          <p className="text-sm text-center py-8" style={{ color: '#a1a1aa' }}>無資料</p>
        )}
        {!loading && stats && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="營業額" value={stats.revenue} color="#16a34a" />
              <StatBlock label="POS 總額" value={stats.posTotal} color="#0369a1" />
              <StatBlock label="央廚配送費" value={stats.ck} color="#f97316" />
              <StatBlock label="食/耗/雜總成本" value={stats.totalCost} color="#be123c" />
            </div>
            <div className="rounded-xl px-3 py-2" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>食材：<span className="font-bold tabular-nums" style={{ color: '#047857' }}>${fmt(stats.food)}</span></div>
                <div>耗材：<span className="font-bold tabular-nums" style={{ color: '#92400E' }}>${fmt(stats.pack)}</span></div>
                <div>雜項：<span className="font-bold tabular-nums" style={{ color: '#71717a' }}>${fmt(stats.misc)}</span></div>
              </div>
            </div>
            {stats.vendorBreakdown.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>廠商分類明細</p>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                  <table className="w-full text-xs">
                    <thead style={{ background: '#fafafa' }}>
                      <tr>
                        <th className="px-3 py-2 text-left" style={{ color: '#71717a', fontWeight: 600 }}>廠商</th>
                        <th className="px-3 py-2 text-left" style={{ color: '#71717a', fontWeight: 600 }}>單據</th>
                        <th className="px-3 py-2 text-right" style={{ color: '#71717a', fontWeight: 600 }}>食材</th>
                        <th className="px-3 py-2 text-right" style={{ color: '#71717a', fontWeight: 600 }}>耗材</th>
                        <th className="px-3 py-2 text-right" style={{ color: '#71717a', fontWeight: 600 }}>雜項</th>
                        <th className="px-3 py-2 text-right" style={{ color: '#71717a', fontWeight: 600 }}>小計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.vendorBreakdown.map((row, i) => {
                        const total = row.food + row.pack + row.misc
                        if (total === 0) return null
                        return (
                          <tr key={`${row.vendor_group}-${row.doc_type}-${i}`} style={{ borderTop: '1px solid #f4f4f5' }}>
                            <td className="px-3 py-1.5" style={{ color: '#18181b' }}>{row.vendor_group}</td>
                            <td className="px-3 py-1.5" style={{ color: '#52525b' }}>{row.doc_type}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{row.food > 0 ? `$${fmt(row.food)}` : '—'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{row.pack > 0 ? `$${fmt(row.pack)}` : '—'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{row.misc > 0 ? `$${fmt(row.misc)}` : '—'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color: '#18181b' }}>${fmt(total)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
        💡 提示：所有資料即時從資料庫生成，點下載 Excel 拉的是最新版本。
      </p>
    </div>
  )
}

function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
      <p className="text-[11px]" style={{ color: '#71717a' }}>{label}</p>
      <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color }}>${fmt(value)}</p>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', border: '1.5px solid #e4e4e7',
  borderRadius: 10, fontSize: 14, outline: 'none', background: 'white', fontFamily: 'inherit',
}
