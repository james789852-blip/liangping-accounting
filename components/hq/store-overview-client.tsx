'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Download } from 'lucide-react'
import { fetchDailyStats, fetchMonthlyStats } from '@/app/actions/store-overview'
import type { DailyStats, MonthlyStats } from '@/lib/store-aggregator'

interface Store { id: string; name: string }

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

export default function StoreOverviewClient({ stores }: { stores: Store[] }) {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '')
  const [tab, setTab] = useState<'daily' | 'monthly'>('daily')
  const [date, setDate] = useState(todayStr)
  const [year, setYear] = useState(now.getFullYear())
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [daily, setDaily] = useState<DailyStats | null>(null)
  const [monthly, setMonthly] = useState<MonthlyStats | null>(null)

  useEffect(() => {
    if (!storeId) return
    setLoading(true)
    if (tab === 'daily') {
      setDaily(null)
      fetchDailyStats(storeId, date)
        .then(r => {
          if ('error' in r && r.error) { toast.error(r.error); return }
          if ('stats' in r && r.stats) setDaily(r.stats)
        })
        .catch(e => toast.error('載入失敗：' + (e instanceof Error ? e.message : String(e))))
        .finally(() => setLoading(false))
    } else {
      setMonthly(null)
      fetchMonthlyStats(storeId, year, monthNum)
        .then(r => {
          if ('error' in r && r.error) { toast.error(r.error); return }
          if ('stats' in r) setMonthly(r.stats)
        })
        .catch(e => toast.error('載入失敗：' + (e instanceof Error ? e.message : String(e))))
        .finally(() => setLoading(false))
    }
  }, [storeId, tab, date, year, monthNum])

  const storeName = stores.find(s => s.id === storeId)?.name ?? ''
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const [downloading, setDownloading] = useState(false)

  async function handleExport() {
    if (!storeId) { toast.error('請選店家'); return }
    setDownloading(true)
    try {
      const url = `/api/export/food-cost-native?storeId=${storeId}&year=${year}&month=${monthNum}&t=${Date.now()}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) { toast.error('匯出失敗：' + await res.text()); return }
      const blob = await res.blob()
      const disp = res.headers.get('content-disposition') ?? ''
      const m = /filename\*=UTF-8''([^;]+)/.exec(disp)
      const filename = m ? decodeURIComponent(m[1]) : `${storeName}_${year}年${monthNum}月_食耗成本.xlsx`
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
    <div className="max-w-6xl mx-auto p-4 space-y-4" style={{ background: '#fafafa', minHeight: '100vh' }}>
      <div>
        <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>店家總覽</h1>
        <p className="text-xs" style={{ color: '#a1a1aa' }}>所有數字即時從資料庫計算，取代原本各種散落的頁面</p>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
        {/* 店家 */}
        <select value={storeId} onChange={e => setStoreId(e.target.value)} style={inputStyle}>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Tab */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setTab('daily')} style={tabBtn(tab === 'daily')}>當日</button>
          <button onClick={() => setTab('monthly')} style={tabBtn(tab === 'monthly')}>當月</button>
        </div>

        {/* Date/Month selector */}
        {tab === 'daily' ? (
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={inputStyle}>
              {yearOptions.map(y => <option key={y} value={y}>{y} 年</option>)}
            </select>
            <select value={monthNum} onChange={e => setMonthNum(parseInt(e.target.value))} style={inputStyle}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m} 月</option>
              ))}
            </select>
          </div>
        )}

        {/* Excel 匯出（僅當月模式） */}
        {tab === 'monthly' && (
          <button onClick={handleExport} disabled={downloading || !storeId}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.6 : 1 }}>
            {downloading ? <><Loader2 className="h-4 w-4 animate-spin" />匯出中…</> : <><Download className="h-4 w-4" />下載食耗成本 Excel</>}
          </button>
        )}
      </div>

      {/* Body */}
      {loading && (
        <div className="bg-white rounded-2xl p-8 text-center" style={{ border: '1px solid #f4f4f5' }}>
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          <p className="text-sm" style={{ color: '#a1a1aa' }}>載入中…</p>
        </div>
      )}

      {!loading && tab === 'daily' && daily && <DailyPanel data={daily} storeName={storeName} />}
      {!loading && tab === 'daily' && !daily && (
        <div className="bg-white rounded-2xl p-8 text-center text-sm" style={{ border: '1px solid #f4f4f5', color: '#a1a1aa' }}>
          {date} 無資料
        </div>
      )}

      {!loading && tab === 'monthly' && monthly && <MonthlyPanel data={monthly} />}
    </div>
  )
}

/* ─────────── Daily panel ─────────── */
function DailyPanel({ data, storeName }: { data: DailyStats; storeName: string }) {
  const uberEntries = Object.entries(data.uber).filter(([, v]) => v > 0)
  const handwriteEntries = Object.entries(data.handwrite).filter(([, v]) => v > 0)
  return (
    <>
      <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-bold" style={{ color: '#18181b' }}>{storeName} · {data.date} {data.weekday}</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Stat label="(手動)POS" value={data.pos} color="#0369a1" />
          <Stat label="TWPAY" value={data.twpay} color="#be123c" />
          <Stat label="Panda" value={data.panda} color="#f43f5e" />
          <Stat label="Online" value={data.online} color="#8b5cf6" />
          <Stat label="Online 現金" value={data.online_cash} color="#a855f7" />
          {uberEntries.map(([acc, v]) => (
            <Stat key={acc} label={`Uber ${acc}`} value={v} color="#22c55e" />
          ))}
          {handwriteEntries.map(([acc, v]) => (
            <Stat key={acc} label={`手寫 ${acc}`} value={v} color="#f59e0b" />
          ))}
        </div>

        <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-3 gap-2" style={{ borderColor: '#f4f4f5' }}>
          <Stat label="現場" value={data.onsite} color="#f97316" />
          <Stat label="(手動)實際$" value={data.actual} color="#dc2626" />
          <Stat label="配送(月底結)" value={data.ck} color="#f97316" />
          <Stat label="結果" value={data.variance} color="#0369a1" />
          <Stat label="扣除後的$" value={data.after_deduct} color="#71717a" />
          <Stat label="營業額" value={data.revenue} color="#16a34a" />
        </div>

        {/* 對應原 Excel 上方：梁平退稅、總發票、總收據 */}
        <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-4 gap-2" style={{ borderColor: '#f4f4f5' }}>
          <Stat label="總發票" value={data.invoiceTotal} color="#dc2626" />
          <Stat label="總收據" value={data.receiptTotal} color="#0369a1" />
          <Stat label="估價單" value={data.estimateTotal} color="#8b5cf6" />
          <Stat label="梁平退稅" value={data.taxRefund} color="#f59e0b" />
        </div>

        {/* 原 Excel: 總 = 食 + 耗 + 雜 */}
        <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-4 gap-2" style={{ borderColor: '#f4f4f5' }}>
          <Stat label="總（食+耗+雜）" value={data.totalCost} color="#be123c" />
          <Stat label="食材" value={data.food} color="#047857" />
          <Stat label="耗材" value={data.pack} color="#92400E" />
          <Stat label="雜項" value={data.misc} color="#71717a" />
        </div>
      </div>

      {/* 廠商 breakdown */}
      {Object.keys(data.vendorGroupBreakdown).length > 0 && (
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#18181b' }}>廠商分類明細</h3>
          <table className="w-full text-xs">
            <thead style={{ background: '#fafafa' }}>
              <tr>
                <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>廠商</th>
                <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>單據</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>金額</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.vendorGroupBreakdown).flatMap(([vg, docMap]) =>
                Object.entries(docMap).map(([doc, amt]) => (
                  <tr key={`${vg}-${doc}`} style={{ borderTop: '1px solid #f4f4f5' }}>
                    <td className="px-2 py-1.5">{vg}</td>
                    <td className="px-2 py-1.5" style={{ color: '#52525b' }}>{doc || '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">${fmt(amt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 收據明細 */}
      {data.receipts.length > 0 && (
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#18181b' }}>收據明細（{data.receipts.length} 筆）</h3>
          <div className="space-y-2">
            {data.receipts.map((r, i) => (
              <div key={i} className="rounded-xl p-3 text-xs" style={{ background: '#fafafa' }}>
                <div className="flex justify-between items-baseline mb-1">
                  <p className="font-semibold" style={{ color: '#18181b' }}>{r.vendor_name || '(無廠商)'}</p>
                  <p className="tabular-nums font-bold" style={{ color: '#be123c' }}>${fmt(r.total_amount)}</p>
                </div>
                {r.tax_amount > 0 && (
                  <p className="text-[11px]" style={{ color: '#a1a1aa' }}>稅：${fmt(r.tax_amount)}</p>
                )}
                {r.items.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {r.items.map((it, j) => (
                      <li key={j} className="flex justify-between" style={{ color: '#52525b' }}>
                        <span>{it.item_name}</span>
                        <span className="tabular-nums">${fmt(it.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {r.notes && <p className="mt-1 text-[11px]" style={{ color: '#a1a1aa' }}>備註：{r.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/* ─────────── Monthly panel ─────────── */
function MonthlyPanel({ data }: { data: MonthlyStats }) {
  const t = data.totals
  return (
    <>
      <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
        <h2 className="text-base font-bold" style={{ color: '#18181b' }}>{data.storeName} · {data.year} 年 {data.monthNum} 月合計</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Stat label="營業額" value={t.revenue} color="#16a34a" />
          <Stat label="(手動)POS" value={t.pos} color="#0369a1" />
          <Stat label="現場" value={t.onsite} color="#f97316" />
          <Stat label="(手動)實際$" value={t.actual} color="#dc2626" />
          <Stat label="配送(月底結)" value={t.ck} color="#f97316" />
          <Stat label="結果" value={t.variance} color="#0369a1" />
        </div>

        {/* 對應原 Excel 上方：梁平退稅、總發票、總收據 */}
        <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-4 gap-2" style={{ borderColor: '#f4f4f5' }}>
          <Stat label="總發票" value={data.totalInvoice} color="#dc2626" />
          <Stat label="總收據" value={data.totalReceipt} color="#0369a1" />
          <Stat label="估價單" value={t.estimateTotal} color="#8b5cf6" />
          <Stat label="梁平退稅" value={data.liangpingRefund} color="#f59e0b" />
        </div>

        {/* 原 Excel: 總 = 食 + 耗 + 雜 */}
        <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-4 gap-2" style={{ borderColor: '#f4f4f5' }}>
          <Stat label="總（食+耗+雜）" value={t.totalCost} color="#be123c" />
          <Stat label="食材" value={t.food} color="#047857" />
          <Stat label="耗材" value={t.pack} color="#92400E" />
          <Stat label="雜項" value={t.misc} color="#71717a" />
        </div>
      </div>

      {/* 品項月合計 */}
      {data.itemMonthlyTotals.length > 0 && (
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#18181b' }}>品項月合計（依廠商群組排序）</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: '#fafafa' }}>
                <tr>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>廠商</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>單據</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>品項</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>分類</th>
                  <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {data.itemMonthlyTotals.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f4f4f5' }}>
                    <td className="px-2 py-1.5">{row.vendor_group}</td>
                    <td className="px-2 py-1.5" style={{ color: '#52525b' }}>{row.doc_type || '—'}</td>
                    <td className="px-2 py-1.5">{row.item_name}</td>
                    <td className="px-2 py-1.5" style={{ color: '#52525b' }}>{row.category}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">${fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 每日 breakdown */}
      <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
        <h3 className="text-sm font-bold mb-3" style={{ color: '#18181b' }}>每日 breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead style={{ background: '#fafafa' }}>
              <tr>
                <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>日期</th>
                <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>星期</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>POS</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>現場</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>實際</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>配送</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>結果</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>營業額</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>總</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>食</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>耗</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>雜</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>發票</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>收據</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((d, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f4f4f5' }}>
                  <td className="px-2 py-1.5">{d.date.slice(5)}</td>
                  <td className="px-2 py-1.5" style={{ color: '#52525b' }}>{d.weekday}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.pos > 0 ? fmt(d.pos) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.onsite ? fmt(d.onsite) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.actual ? fmt(d.actual) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.ck ? fmt(d.ck) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.variance ? fmt(d.variance) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.revenue ? fmt(d.revenue) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{d.totalCost ? fmt(d.totalCost) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.food ? fmt(d.food) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.pack ? fmt(d.pack) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.misc ? fmt(d.misc) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: '#dc2626' }}>{d.invoiceTotal ? fmt(d.invoiceTotal) : ''}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: '#0369a1' }}>{d.receiptTotal ? fmt(d.receiptTotal) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
      <p className="text-[11px]" style={{ color: '#71717a' }}>{label}</p>
      <p className="text-base font-bold tabular-nums mt-0.5" style={{ color }}>${fmt(value)}</p>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', border: '1.5px solid #e4e4e7',
  borderRadius: 10, fontSize: 14, outline: 'none', background: 'white', fontFamily: 'inherit',
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  height: 40, borderRadius: 10,
  border: active ? '1.5px solid #F59E0B' : '1.5px solid #e4e4e7',
  background: active ? '#FEF3C7' : 'white',
  color: active ? '#B45309' : '#52525b',
  fontWeight: active ? 700 : 500,
  fontSize: 14, cursor: 'pointer',
})
