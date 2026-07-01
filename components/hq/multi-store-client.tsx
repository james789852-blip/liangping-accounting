'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { fetchMultiStoreMonthly, type MultiStoreRow } from '@/app/actions/multi-store-stats'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

export default function MultiStoreClient() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<MultiStoreRow[]>([])

  useEffect(() => {
    setLoading(true)
    setRows([])
    fetchMultiStoreMonthly(year, monthNum)
      .then(r => {
        if ('error' in r && r.error) { toast.error(r.error); return }
        if ('rows' in r) setRows(r.rows)
      })
      .catch(e => toast.error('載入失敗：' + (e instanceof Error ? e.message : String(e))))
      .finally(() => setLoading(false))
  }, [year, monthNum])

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  // 底部合計 row（所有店加總）
  const grandTotal = rows.reduce((acc, r) => ({
    revenue: acc.revenue + r.revenue,
    onsite: acc.onsite + r.onsite,
    actual: acc.actual + r.actual,
    ck: acc.ck + r.ck,
    variance: acc.variance + r.variance,
    food: acc.food + r.food,
    pack: acc.pack + r.pack,
    misc: acc.misc + r.misc,
    totalCost: acc.totalCost + r.totalCost,
    invoiceTotal: acc.invoiceTotal + r.invoiceTotal,
    receiptTotal: acc.receiptTotal + r.receiptTotal,
    taxRefund: acc.taxRefund + r.taxRefund,
  }), { revenue: 0, onsite: 0, actual: 0, ck: 0, variance: 0, food: 0, pack: 0, misc: 0, totalCost: 0, invoiceTotal: 0, receiptTotal: 0, taxRefund: 0 })

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4" style={{ background: '#fafafa', minHeight: '100vh' }}>
      <div>
        <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>多店月度比較</h1>
        <p className="text-xs" style={{ color: '#a1a1aa' }}>一頁看所有店家該月主要數字，點店名進單店詳細</p>
      </div>

      <div className="bg-white rounded-2xl p-4 grid grid-cols-2 gap-2" style={{ border: '1px solid #f4f4f5' }}>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={inputStyle}>
          {yearOptions.map(y => <option key={y} value={y}>{y} 年</option>)}
        </select>
        <select value={monthNum} onChange={e => setMonthNum(parseInt(e.target.value))} style={inputStyle}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{m} 月</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl p-8 text-center" style={{ border: '1px solid #f4f4f5' }}>
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          <p className="text-sm" style={{ color: '#a1a1aa' }}>載入中…（12+ 店家分開查詢）</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-2xl p-3" style={{ border: '1px solid #f4f4f5' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: '#fafafa' }}>
                <tr>
                  <th className="px-2 py-2 text-left sticky left-0" style={{ color: '#71717a', background: '#fafafa', minWidth: 100 }}>店家</th>
                  <th className="px-2 py-2 text-right" style={{ color: '#71717a' }}>營業額</th>
                  <th className="px-2 py-2 text-right" style={{ color: '#71717a' }}>現場</th>
                  <th className="px-2 py-2 text-right" style={{ color: '#71717a' }}>實際</th>
                  <th className="px-2 py-2 text-right" style={{ color: '#71717a' }}>配送</th>
                  <th className="px-2 py-2 text-right" style={{ color: '#71717a' }}>結果</th>
                  <th className="px-2 py-2 text-right" style={{ color: '#71717a' }}>總成本</th>
                  <th className="px-2 py-2 text-right" style={{ color: '#71717a' }}>食</th>
                  <th className="px-2 py-2 text-right" style={{ color: '#71717a' }}>耗</th>
                  <th className="px-2 py-2 text-right" style={{ color: '#71717a' }}>雜</th>
                  <th className="px-2 py-2 text-right" style={{ color: '#71717a' }}>總發票</th>
                  <th className="px-2 py-2 text-right" style={{ color: '#71717a' }}>總收據</th>
                  <th className="px-2 py-2 text-right" style={{ color: '#71717a' }}>梁平退稅</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.storeId} style={{ borderTop: '1px solid #f4f4f5' }}>
                    <td className="px-2 py-2 sticky left-0" style={{ background: 'white' }}>
                      <Link href={`/hq/store-overview?storeId=${r.storeId}`} className="font-semibold hover:underline" style={{ color: '#B45309' }}>
                        {r.storeName}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(r.revenue)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(r.onsite)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(r.actual)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(r.ck)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(r.variance)}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: '#be123c', fontWeight: 600 }}>{fmt(r.totalCost)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(r.food)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(r.pack)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(r.misc)}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: '#dc2626' }}>{fmt(r.invoiceTotal)}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: '#0369a1' }}>{fmt(r.receiptTotal)}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: '#f59e0b' }}>{fmt(r.taxRefund)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #e4e4e7', background: '#fef3c7' }}>
                  <td className="px-2 py-2 sticky left-0 font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>合計</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold" style={{ color: '#16a34a' }}>{fmt(grandTotal.revenue)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold">{fmt(grandTotal.onsite)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold">{fmt(grandTotal.actual)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold">{fmt(grandTotal.ck)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold">{fmt(grandTotal.variance)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold" style={{ color: '#be123c' }}>{fmt(grandTotal.totalCost)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold">{fmt(grandTotal.food)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold">{fmt(grandTotal.pack)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold">{fmt(grandTotal.misc)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold" style={{ color: '#dc2626' }}>{fmt(grandTotal.invoiceTotal)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold" style={{ color: '#0369a1' }}>{fmt(grandTotal.receiptTotal)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold" style={{ color: '#f59e0b' }}>{fmt(grandTotal.taxRefund)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', border: '1.5px solid #e4e4e7',
  borderRadius: 10, fontSize: 14, outline: 'none', background: 'white', fontFamily: 'inherit',
}
