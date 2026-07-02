'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchDailyStats, fetchMonthlyStats } from '@/app/actions/store-overview'
import type { DailyStats, MonthlyStats } from '@/lib/store-aggregator'
import HolidaysEditor from './holidays-editor'

interface Store { id: string; name: string }

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

export default function StoreOverviewClient({ stores, initialStoreId }: { stores: Store[]; initialStoreId?: string }) {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [storeId, setStoreId] = useState(initialStoreId || stores[0]?.id || '')
  const [tab, setTab] = useState<'daily' | 'monthly'>('daily')
  const [date, setDate] = useState(todayStr)
  const [year, setYear] = useState(now.getFullYear())
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [daily, setDaily] = useState<DailyStats | null>(null)
  const [prevDaily, setPrevDaily] = useState<DailyStats | null>(null)
  const [monthly, setMonthly] = useState<MonthlyStats | null>(null)
  const [prevMonthly, setPrevMonthly] = useState<MonthlyStats | null>(null)

  useEffect(() => {
    if (!storeId) return
    setLoading(true)
    if (tab === 'daily') {
      setDaily(null); setPrevDaily(null)
      fetchDailyStats(storeId, date)
        .then(r => {
          if ('error' in r && r.error) { toast.error(r.error); return }
          if ('stats' in r && r.stats) setDaily(r.stats)
          if ('prev' in r) setPrevDaily(r.prev)
        })
        .catch(e => toast.error('載入失敗：' + (e instanceof Error ? e.message : String(e))))
        .finally(() => setLoading(false))
    } else {
      setMonthly(null); setPrevMonthly(null)
      fetchMonthlyStats(storeId, year, monthNum)
        .then(r => {
          if ('error' in r && r.error) { toast.error(r.error); return }
          if ('stats' in r) setMonthly(r.stats)
          if ('prev' in r) setPrevMonthly(r.prev)
        })
        .catch(e => toast.error('載入失敗：' + (e instanceof Error ? e.message : String(e))))
        .finally(() => setLoading(false))
    }
  }, [storeId, tab, date, year, monthNum])

  const storeName = stores.find(s => s.id === storeId)?.name ?? ''
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const [downloading, setDownloading] = useState(false)
  const [showHolidays, setShowHolidays] = useState(false)

  async function handleExport(mode: 'month' | 'year' | 'csv' = 'month') {
    if (!storeId) { toast.error('請選店家'); return }
    setDownloading(true)
    try {
      const url = mode === 'year'
        ? `/api/export/food-cost-native?storeId=${storeId}&type=year&year=${year}&t=${Date.now()}`
        : mode === 'csv'
        ? `/api/export/food-cost-csv?storeId=${storeId}&year=${year}&month=${monthNum}&t=${Date.now()}`
        : `/api/export/food-cost-native?storeId=${storeId}&year=${year}&month=${monthNum}&t=${Date.now()}`
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
        {/* 店家 + 左右切換 */}
        <div className="flex items-center gap-2">
          <button onClick={() => {
            const i = stores.findIndex(s => s.id === storeId)
            if (i > 0) setStoreId(stores[i - 1].id)
          }} disabled={stores.findIndex(s => s.id === storeId) <= 0}
            className="shrink-0 h-10 w-10 flex items-center justify-center rounded-lg"
            style={{ background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b', cursor: 'pointer' }}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={() => {
            const i = stores.findIndex(s => s.id === storeId)
            if (i >= 0 && i < stores.length - 1) setStoreId(stores[i + 1].id)
          }} disabled={stores.findIndex(s => s.id === storeId) >= stores.length - 1}
            className="shrink-0 h-10 w-10 flex items-center justify-center rounded-lg"
            style={{ background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b', cursor: 'pointer' }}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Tab */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setTab('daily')} style={tabBtn(tab === 'daily')}>當日</button>
          <button onClick={() => setTab('monthly')} style={tabBtn(tab === 'monthly')}>當月</button>
        </div>

        {/* Date/Month selector */}
        {tab === 'daily' ? (
          <div className="flex items-center gap-2">
            <button onClick={() => {
              const dt = new Date(date + 'T12:00:00+08:00')
              dt.setDate(dt.getDate() - 1)
              setDate(dt.toISOString().slice(0, 10))
            }} className="shrink-0 h-10 w-10 flex items-center justify-center rounded-lg"
              style={{ background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b', cursor: 'pointer' }}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => {
              const dt = new Date(date + 'T12:00:00+08:00')
              dt.setDate(dt.getDate() + 1)
              setDate(dt.toISOString().slice(0, 10))
            }} className="shrink-0 h-10 w-10 flex items-center justify-center rounded-lg"
              style={{ background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b', cursor: 'pointer' }}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
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
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handleExport('month')} disabled={downloading || !storeId}
                className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.6 : 1 }}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                當月 Excel
              </button>
              <button onClick={() => handleExport('year')} disabled={downloading || !storeId}
                className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
                style={{ background: 'white', border: '1.5px solid #F59E0B', color: '#B45309', cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.6 : 1 }}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                年度 Excel（13 分頁）
              </button>
            </div>
            <button onClick={() => handleExport('csv')} disabled={downloading || !storeId}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold"
              style={{ background: '#fafafa', border: '1.5px solid #e4e4e7', color: '#52525b', cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.6 : 1 }}>
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              當月 CSV（Google Sheets / 會計軟體）
            </button>
            <Link href={`/hq/item-mappings?storeId=${storeId}`}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold"
              style={{ background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b' }}>
              🔧 品項對應管理（Excel 欄位順序 / 廠商 / 分類）
            </Link>
            <button onClick={() => setShowHolidays(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold"
              style={{ background: 'white', border: '1.5px solid #e4e4e7', color: '#6b21a8', cursor: 'pointer' }}>
              📅 管理公休日（本月）
            </button>
          </div>
        )}
      </div>

      {showHolidays && storeId && (
        <HolidaysEditor
          storeId={storeId}
          storeName={storeName}
          year={year}
          monthNum={monthNum}
          onClose={() => setShowHolidays(false)}
        />
      )}

      {/* Body */}
      {loading && (
        <div className="bg-white rounded-2xl p-8 text-center" style={{ border: '1px solid #f4f4f5' }}>
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          <p className="text-sm" style={{ color: '#a1a1aa' }}>載入中…</p>
        </div>
      )}

      {!loading && tab === 'daily' && daily && <DailyPanel data={daily} storeName={storeName} prev={prevDaily} />}
      {!loading && tab === 'daily' && !daily && (
        <div className="bg-white rounded-2xl p-8 text-center text-sm" style={{ border: '1px solid #f4f4f5', color: '#a1a1aa' }}>
          {date} 無資料
        </div>
      )}

      {!loading && tab === 'monthly' && monthly && (
        <MonthlyPanel data={monthly} prev={prevMonthly}
          onOpenDay={(d) => { setDate(d); setTab('daily') }} />
      )}
    </div>
  )
}

/* ─────────── Daily panel ─────────── */
function DailyPanel({ data, storeName, prev }: { data: DailyStats; storeName: string; prev: DailyStats | null }) {
  const uberEntries = Object.entries(data.uber).filter(([, v]) => v > 0)
  const handwriteEntries = Object.entries(data.handwrite).filter(([, v]) => v > 0)
  return (
    <>
      <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-base font-bold" style={{ color: '#18181b' }}>{storeName} · {data.date} {data.weekday}</h2>
          <StatusPill status={data.closingStatus} />
          {prev && <span className="text-[11px]" style={{ color: '#a1a1aa' }}>對比 {prev.date}</span>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Stat label="(手動)POS" value={data.pos} color="#0369a1" prev={prev?.pos} />
          <Stat label="TWPAY" value={data.twpay} color="#be123c" prev={prev?.twpay} />
          <Stat label="Panda" value={data.panda} color="#f43f5e" prev={prev?.panda} />
          <Stat label="Online" value={data.online} color="#8b5cf6" prev={prev?.online} />
          <Stat label="Online 現金" value={data.online_cash} color="#a855f7" prev={prev?.online_cash} />
          {uberEntries.map(([acc, v]) => (
            <Stat key={acc} label={`Uber ${acc}`} value={v} color="#22c55e" prev={prev?.uber[acc]} />
          ))}
          {handwriteEntries.map(([acc, v]) => (
            <Stat key={acc} label={`手寫 ${acc}`} value={v} color="#f59e0b" prev={prev?.handwrite[acc]} />
          ))}
        </div>

        <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-3 gap-2" style={{ borderColor: '#f4f4f5' }}>
          <Stat label="現場" value={data.onsite} color="#f97316" prev={prev?.onsite} />
          <Stat label="(手動)實際$" value={data.actual} color="#dc2626" prev={prev?.actual} />
          <Stat label="配送(月底結)" value={data.ck} color="#f97316" prev={prev?.ck} />
          <Stat label="結果" value={data.variance} color="#0369a1" prev={prev?.variance} />
          <Stat label="扣除後的$" value={data.after_deduct} color="#71717a" prev={prev?.after_deduct} />
          <Stat label="營業額" value={data.revenue} color="#16a34a" prev={prev?.revenue} />
        </div>

        {/* 對應原 Excel 上方：梁平退稅、總發票、總收據 */}
        <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-4 gap-2" style={{ borderColor: '#f4f4f5' }}>
          <Stat label="總發票" value={data.invoiceTotal} color="#dc2626" prev={prev?.invoiceTotal} />
          <Stat label="總收據" value={data.receiptTotal} color="#0369a1" prev={prev?.receiptTotal} />
          <Stat label="估價單" value={data.estimateTotal} color="#8b5cf6" prev={prev?.estimateTotal} />
          <Stat label="梁平退稅" value={data.taxRefund} color="#f59e0b" prev={prev?.taxRefund} />
        </div>

        {/* 原 Excel: 總 = 食 + 耗 + 雜 */}
        <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-4 gap-2" style={{ borderColor: '#f4f4f5' }}>
          <Stat label="總（食+耗+雜）" value={data.totalCost} color="#be123c" prev={prev?.totalCost} />
          <Stat label="食材" value={data.food} color="#047857" prev={prev?.food} />
          <Stat label="耗材" value={data.pack} color="#92400E" prev={prev?.pack} />
          <Stat label="雜項" value={data.misc} color="#71717a" prev={prev?.misc} />
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
function MonthlyPanel({ data, prev, onOpenDay }: { data: MonthlyStats; prev: MonthlyStats | null; onOpenDay?: (date: string) => void }) {
  const t = data.totals
  const p = prev?.totals
  return (
    <>
      <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
        <h2 className="text-base font-bold" style={{ color: '#18181b' }}>{data.storeName} · {data.year} 年 {data.monthNum} 月合計</h2>
        {prev && (
          <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
            對比 {prev.year} 年 {prev.monthNum} 月
          </p>
        )}

        <div>
          <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>營收</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Stat label="營業額" value={t.revenue} color="#16a34a" prev={p?.revenue} />
            <Stat label="(手動)POS" value={t.pos} color="#0369a1" prev={p?.pos} />
            <Stat label="現場" value={t.onsite} color="#f97316" prev={p?.onsite} />
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>結算</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Stat label="(手動)實際$" value={t.actual} color="#dc2626" prev={p?.actual} />
            <Stat label="配送(月底結)" value={t.ck} color="#f97316" prev={p?.ck} />
            <Stat label="結果" value={t.variance} color="#0369a1" prev={p?.variance} />
          </div>
        </div>

        <div className="border-t pt-3" style={{ borderColor: '#f4f4f5' }}>
          <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>單據</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="總發票" value={data.totalInvoice} color="#dc2626" prev={prev?.totalInvoice} />
            <Stat label="總收據" value={data.totalReceipt} color="#0369a1" prev={prev?.totalReceipt} />
            <Stat label="估價單" value={t.estimateTotal} color="#8b5cf6" prev={p?.estimateTotal} />
            <Stat label="梁平退稅" value={data.liangpingRefund} color="#f59e0b" prev={prev?.liangpingRefund} />
          </div>
        </div>

        <div className="border-t pt-3" style={{ borderColor: '#f4f4f5' }}>
          <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>成本</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="總（食+耗+雜）" value={t.totalCost} color="#be123c" prev={p?.totalCost} />
            <Stat label="食材" value={t.food} color="#047857" prev={p?.food} />
            <Stat label="耗材" value={t.pack} color="#92400E" prev={p?.pack} />
            <Stat label="雜項" value={t.misc} color="#71717a" prev={p?.misc} />
          </div>
        </div>
      </div>

      {/* Top 10 品項成本 */}
      {data.itemMonthlyTotals.length > 0 && (
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#18181b' }}>成本 Top 10 品項</h3>
          <div className="space-y-1">
            {[...data.itemMonthlyTotals].sort((a, b) => b.total - a.total).slice(0, 10).map((r, i) => {
              const pct = data.totals.totalCost > 0 ? Math.round(r.total / data.totals.totalCost * 100) : 0
              return (
                <div key={i} className="flex items-center gap-2">
                  <div className="text-[11px] tabular-nums" style={{ color: '#a1a1aa', width: 18 }}>#{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-semibold truncate">{r.item_name}</span>
                      <span className="text-xs tabular-nums font-bold" style={{ color: '#be123c' }}>${fmt(r.total)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1.5 rounded-full" style={{ background: '#f4f4f5' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.category === '食材' ? '#047857' : r.category === '耗材' ? '#92400E' : '#71717a' }} />
                      </div>
                      <span className="text-[10px] tabular-nums" style={{ color: '#a1a1aa', minWidth: 30 }}>{pct}%</span>
                    </div>
                    <p className="text-[10px]" style={{ color: '#a1a1aa' }}>{r.vendor_group} · {r.doc_type || '—'} · {r.category}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 品項月合計 */}
      {data.itemMonthlyTotals.length > 0 && (
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#18181b' }}>品項月合計（依廠商群組排序）</h3>
          <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <table className="text-xs" style={{ minWidth: 'max-content' }}>
              <thead style={{ background: '#fafafa' }}>
                <tr>
                  <th className="px-2 py-1.5 text-left sticky left-0" style={{ color: '#71717a', background: '#fafafa', minWidth: 80, zIndex: 2 }}>品項</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>廠商</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>單據</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>分類</th>
                  <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {data.itemMonthlyTotals.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f4f4f5' }}>
                    <td className="px-2 py-1.5 sticky left-0 font-medium" style={{ background: 'white', zIndex: 1 }}>{row.item_name}</td>
                    <td className="px-2 py-1.5">{row.vendor_group}</td>
                    <td className="px-2 py-1.5" style={{ color: '#52525b' }}>{row.doc_type || '—'}</td>
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
      <DailyBreakdown data={data} onOpenDay={onOpenDay} />
    </>
  )
}

/** 每日 breakdown 表格 — 預設隱藏未來（沒資料）日期，讓當月只顯示已錄的部分 */
function DailyBreakdown({ data, onOpenDay }: { data: MonthlyStats; onOpenDay?: (date: string) => void }) {
  const [showAll, setShowAll] = useState(false)
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  // 有資料 = 已 submit / 有錄款 / 是公休 / 已過去或今天
  const hasData = (d: MonthlyStats['daily'][number]) =>
    d.closingStatus !== 'none' || d.isHoliday || d.revenue > 0 || d.totalCost > 0 || d.actual !== 0 || d.pos > 0
  // 潛在會被隱藏的天數（不依當前展開狀態，這樣 button 展開後也能收回）
  const potentialHiddenCount = data.daily.filter(d => !hasData(d) && d.date > today).length
  const filtered = showAll ? data.daily : data.daily.filter(d => hasData(d) || d.date <= today)
  return (
    <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold" style={{ color: '#18181b' }}>每日 breakdown</h3>
          {potentialHiddenCount > 0 && (
            <button onClick={() => setShowAll(v => !v)}
              className="text-[11px] px-2.5 py-1 rounded-lg"
              style={{ background: '#fafafa', border: '1px solid #e4e4e7', color: '#52525b', cursor: 'pointer' }}>
              {showAll ? '收起未來日期' : `顯示未來 ${potentialHiddenCount} 天`}
            </button>
          )}
        </div>
        <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
          <table className="text-xs" style={{ minWidth: 'max-content' }}>
            <thead style={{ background: '#fafafa' }}>
              <tr>
                <th className="px-2 py-1.5 text-left sticky left-0" style={{ color: '#71717a', background: '#fafafa', minWidth: 56, zIndex: 2 }}>日期</th>
                <th className="px-2 py-1.5 text-left" style={{ color: '#71717a', minWidth: 44 }}>星期</th>
                <th className="px-2 py-1.5 text-center" style={{ color: '#71717a' }}>狀態</th>
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
              {filtered.map((d, i) => {
                const dt = new Date(d.date + 'T12:00:00+08:00')
                const dow = dt.getDay()
                const rowBg = d.isHoliday ? '#f3e8ff' : (dow === 0 || dow === 6 ? '#fff7ed' : undefined)
                return (
                <tr key={i} style={{ borderTop: '1px solid #f4f4f5', background: rowBg }}>
                  <td className="px-2 py-1.5 sticky left-0" style={{ background: rowBg ?? 'white', zIndex: 1 }}>
                    {onOpenDay ? (
                      <button onClick={() => onOpenDay(d.date)} className="hover:underline" style={{ color: '#B45309', fontWeight: 500, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                        {d.date.slice(5)}
                      </button>
                    ) : d.date.slice(5)}
                  </td>
                  <td className="px-2 py-1.5" style={{ color: dow === 0 ? '#dc2626' : dow === 6 ? '#0369a1' : '#52525b', fontWeight: (dow === 0 || dow === 6) ? 600 : 400 }}>{d.weekday}</td>
                  <td className="px-2 py-1.5 text-center">
                    {d.isHoliday
                      ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: '#e9d5ff', color: '#6b21a8' }} title={d.holidayNote ?? ''}>公休</span>
                      : <StatusPill status={d.closingStatus} />}
                  </td>
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
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
  )
}

function StatusPill({ status }: { status: DailyStats['closingStatus'] }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    verified:  { label: '已核對', bg: '#d1fae5', color: '#047857' },
    submitted: { label: '已送出', bg: '#dbeafe', color: '#1e40af' },
    disputed:  { label: '退回', bg: '#fee2e2', color: '#b91c1c' },
    draft:     { label: '草稿',   bg: '#fef3c7', color: '#92400e' },
    none:      { label: '無',     bg: '#f4f4f5', color: '#a1a1aa' },
  }
  const s = map[status] ?? map.none
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function Stat({ label, value, color, prev }: { label: string; value: number; color: string; prev?: number }) {
  const delta = prev !== undefined ? value - prev : null
  const pct = prev !== undefined && prev !== 0 ? Math.round((value - prev) / Math.abs(prev) * 100) : null
  const deltaColor = delta === null ? '#a1a1aa' : delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : '#a1a1aa'
  const arrow = delta === null ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '='
  // 減少視覺雜訊：當月 value=0（月初還沒錄資料）→ 隱藏對比行；當月和上月都=0 也隱藏
  const hideDelta = value === 0 || (delta !== null && Math.abs(delta) === 0)
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
      <p className="text-[11px]" style={{ color: '#71717a' }}>{label}</p>
      <p className="text-base font-bold tabular-nums mt-0.5" style={{ color }}>${fmt(value)}</p>
      {delta !== null && !hideDelta && (
        <p className="text-[10px] tabular-nums mt-0.5" style={{ color: deltaColor }}>
          {arrow} {delta >= 0 ? '+' : ''}{fmt(delta)}{pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct}%)` : ''}
        </p>
      )}
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
