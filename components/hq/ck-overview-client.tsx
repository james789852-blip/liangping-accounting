'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { fetchCKDailyStats, fetchCKMonthlyStats } from '@/app/actions/ck-overview'
import type { CKDailyStats, CKMonthlyStats } from '@/lib/ck-aggregator'

interface Store { id: string; name: string }

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

export default function CKOverviewClient({ stores, initialStoreId }: { stores: Store[]; initialStoreId?: string }) {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [storeId, setStoreId] = useState(initialStoreId || stores[0]?.id || '')
  const [tab, setTab] = useState<'daily' | 'monthly'>('monthly')
  const [date, setDate] = useState(todayStr)
  const [year, setYear] = useState(now.getFullYear())
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [daily, setDaily] = useState<CKDailyStats | null>(null)
  const [monthly, setMonthly] = useState<CKMonthlyStats | null>(null)

  useEffect(() => {
    if (!storeId) return
    setLoading(true)
    if (tab === 'daily') {
      setDaily(null)
      fetchCKDailyStats(storeId, date)
        .then(r => {
          if ('error' in r && r.error) { toast.error(r.error); return }
          if ('stats' in r && r.stats) setDaily(r.stats)
        })
        .catch(e => toast.error('載入失敗：' + (e instanceof Error ? e.message : String(e))))
        .finally(() => setLoading(false))
    } else {
      setMonthly(null)
      fetchCKMonthlyStats(storeId, year, monthNum)
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

  async function handleExport(mode: 'xlsx' | 'year' | 'csv') {
    if (!storeId) { toast.error('請選店家'); return }
    setDownloading(true)
    try {
      const url = mode === 'year'
        ? `/api/export/ck-native?storeId=${storeId}&type=year&year=${year}&t=${Date.now()}`
        : mode === 'csv'
        ? `/api/export/ck-csv?storeId=${storeId}&year=${year}&month=${monthNum}&t=${Date.now()}`
        : `/api/export/ck-native?storeId=${storeId}&year=${year}&month=${monthNum}&t=${Date.now()}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) { toast.error('匯出失敗：' + await res.text()); return }
      const blob = await res.blob()
      const disp = res.headers.get('content-disposition') ?? ''
      const m = /filename\*=UTF-8''([^;]+)/.exec(disp)
      const ext = mode === 'xlsx' ? 'xlsx' : 'csv'
      const filename = m ? decodeURIComponent(m[1]) : `${storeName}_${year}年${monthNum}月_央廚食耗.${ext}`
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

  if (stores.length === 0) {
    return (
      <div className="max-w-6xl mx-auto p-6 text-sm" style={{ color: '#a1a1aa' }}>尚無央廚店家</div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4" style={{ background: '#fafafa', minHeight: '100vh' }}>
      <div>
        <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>央廚總覽</h1>
        <p className="text-xs" style={{ color: '#a1a1aa' }}>各央廚每日訂單 / 支出 / 帳目狀態</p>
      </div>

      <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
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

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setTab('daily')} style={tabBtn(tab === 'daily')}>當日</button>
          <button onClick={() => setTab('monthly')} style={tabBtn(tab === 'monthly')}>當月</button>
        </div>

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

        {/* 匯出按鈕（僅當月） */}
        {tab === 'monthly' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handleExport('xlsx')} disabled={downloading || !storeId}
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
          </div>
        )}
      </div>

      {loading && (
        <div className="bg-white rounded-2xl p-8 text-center" style={{ border: '1px solid #f4f4f5' }}>
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          <p className="text-sm" style={{ color: '#a1a1aa' }}>載入中…</p>
        </div>
      )}

      {!loading && tab === 'daily' && daily && <CKDailyPanel data={daily} storeName={storeName} />}
      {!loading && tab === 'monthly' && monthly && <CKMonthlyPanel data={monthly} />}
    </div>
  )
}

function CKDailyPanel({ data, storeName }: { data: CKDailyStats; storeName: string }) {
  const statusLabel = data.status === 'submitted' ? '已送出' : data.status === 'draft' ? '草稿' : '未輸入'
  return (
    <>
      <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-base font-bold" style={{ color: '#18181b' }}>{storeName} · {data.date} {data.weekday}</h2>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: data.status === 'submitted' ? '#d1fae5' : data.status === 'draft' ? '#fef3c7' : '#f4f4f5',
                     color: data.status === 'submitted' ? '#047857' : data.status === 'draft' ? '#92400e' : '#a1a1aa' }}>
            {statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="總收入" value={data.revenue} color="#16a34a" />
          <Stat label="總支出" value={data.totalExpense} color="#be123c" />
          <Stat label="淨額" value={data.balance} color={data.balance >= 0 ? '#0369a1' : '#dc2626'} />
          <Stat label="總補款" value={data.hqPaid ? data.totalExpense : 0} color="#f59e0b" />
        </div>

        <div className="border-t pt-3 grid grid-cols-3 gap-2" style={{ borderColor: '#f4f4f5' }}>
          <Stat label="食材" value={data.food} color="#047857" />
          <Stat label="耗材" value={data.pack} color="#92400E" />
          <Stat label="雜項" value={data.misc} color="#71717a" />
        </div>
      </div>

      {/* 訂單明細 */}
      {(data.memberOrders.length > 0 || data.externalOrders.length > 0) && (
        <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
          <h3 className="text-sm font-bold" style={{ color: '#18181b' }}>訂單明細</h3>
          {data.memberOrders.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: '#71717a' }}>成員店家</p>
              <ul className="space-y-1">
                {data.memberOrders.map((o, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span>{o.store_name}</span>
                    <span className="tabular-nums font-semibold">${fmt(o.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.externalOrders.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: '#71717a' }}>外部店家</p>
              <ul className="space-y-1">
                {data.externalOrders.map((o, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span>{o.name}</span>
                    <span className="tabular-nums font-semibold">${fmt(o.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 支出明細 */}
      {data.expenses.length > 0 && (
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#18181b' }}>支出明細（{data.expenses.length} 筆）</h3>
          <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <table className="text-xs" style={{ minWidth: 'max-content' }}>
              <thead style={{ background: '#fafafa' }}>
                <tr>
                  <th className="px-2 py-1.5 text-left sticky left-0" style={{ color: '#71717a', background: '#fafafa', minWidth: 80, zIndex: 2 }}>品項</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>廠商</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>單據</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>類別</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>付款人</th>
                  <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {data.expenses.map((e, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f4f4f5' }}>
                    <td className="px-2 py-1.5 sticky left-0 font-medium" style={{ background: 'white', zIndex: 1 }}>{e.item_name}</td>
                    <td className="px-2 py-1.5" style={{ color: '#52525b' }}>{e.vendor_group || '—'}</td>
                    <td className="px-2 py-1.5" style={{ color: '#52525b' }}>{e.doc_type || '—'}</td>
                    <td className="px-2 py-1.5" style={{ color: '#52525b' }}>{e.category}</td>
                    <td className="px-2 py-1.5" style={{ color: '#52525b' }}>{e.payer_name || '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">${fmt(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function CKMonthlyPanel({ data }: { data: CKMonthlyStats }) {
  const t = data.totals
  return (
    <>
      <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
        <h2 className="text-base font-bold" style={{ color: '#18181b' }}>{data.ckStore.name} · {data.year} 年 {data.monthNum} 月合計</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="總收入" value={t.revenue} color="#16a34a" />
          <Stat label="總支出" value={t.totalExpense} color="#be123c" />
          <Stat label="淨額" value={t.balance} color={t.balance >= 0 ? '#0369a1' : '#dc2626'} />
          <Stat label="成員店家" value={t.memberRevenue} color="#8b5cf6" />
        </div>

        <div className="border-t pt-3 grid grid-cols-3 gap-2" style={{ borderColor: '#f4f4f5' }}>
          <Stat label="食材" value={t.food} color="#047857" />
          <Stat label="耗材" value={t.pack} color="#92400E" />
          <Stat label="雜項" value={t.misc} color="#71717a" />
        </div>

        {/* 對應原檔上方：總發票 / 總收據 / 估價單 / 梁平退稅 */}
        <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-4 gap-2" style={{ borderColor: '#f4f4f5' }}>
          <Stat label="總發票" value={t.invoiceTotal} color="#dc2626" />
          <Stat label="總收據" value={t.receiptTotal} color="#0369a1" />
          <Stat label="估價單" value={t.estimateTotal} color="#8b5cf6" />
          <Stat label="梁平退稅" value={t.taxRefund} color="#f59e0b" />
        </div>
      </div>

      {/* 成員店家訂單月合計 */}
      {data.memberByStore.length > 0 && (
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#18181b' }}>成員店家訂單月合計</h3>
          <ul className="space-y-1">
            {data.memberByStore.map((m, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span>{m.store_name}</span>
                <span className="tabular-nums font-semibold" style={{ color: '#16a34a' }}>${fmt(m.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 外部店家訂單月合計 */}
      {data.externalByName.length > 0 && (
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#18181b' }}>外部店家訂單月合計</h3>
          <ul className="space-y-1">
            {data.externalByName.map((e, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span>{e.name}</span>
                <span className="tabular-nums font-semibold" style={{ color: '#0369a1' }}>${fmt(e.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 支出品項月合計 — 依廠商群組 + 單據類型分層 */}
      {data.expenseByItem.length > 0 && (
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#18181b' }}>支出品項月合計（依廠商群組排序）</h3>
          <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <table className="text-xs" style={{ minWidth: 'max-content' }}>
              <thead style={{ background: '#fafafa' }}>
                <tr>
                  <th className="px-2 py-1.5 text-left sticky left-0" style={{ color: '#71717a', background: '#fafafa', minWidth: 80, zIndex: 2 }}>品項</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>廠商</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>單據</th>
                  <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>類別</th>
                  <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {data.expenseByItem.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f4f4f5' }}>
                    <td className="px-2 py-1.5 sticky left-0 font-medium" style={{ background: 'white', zIndex: 1 }}>{row.item_name}</td>
                    <td className="px-2 py-1.5" style={{ color: '#52525b' }}>{row.vendor_group || '—'}</td>
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
      <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
        <h3 className="text-sm font-bold mb-3" style={{ color: '#18181b' }}>每日 breakdown</h3>
        <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
          <table className="text-xs" style={{ minWidth: 'max-content' }}>
            <thead style={{ background: '#fafafa' }}>
              <tr>
                <th className="px-2 py-1.5 text-left sticky left-0" style={{ color: '#71717a', background: '#fafafa', minWidth: 56, zIndex: 2 }}>日期</th>
                <th className="px-2 py-1.5 text-left" style={{ color: '#71717a' }}>星期</th>
                <th className="px-2 py-1.5 text-center" style={{ color: '#71717a' }}>狀態</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>收入</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>支出</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>淨額</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>食</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>耗</th>
                <th className="px-2 py-1.5 text-right" style={{ color: '#71717a' }}>雜</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((d, i) => {
                const dt = new Date(d.date + 'T12:00:00+08:00')
                const dow = dt.getDay()
                const rowBg = dow === 0 || dow === 6 ? '#fff7ed' : undefined
                return (
                  <tr key={i} style={{ borderTop: '1px solid #f4f4f5', background: rowBg }}>
                    <td className="px-2 py-1.5 sticky left-0" style={{ background: rowBg ?? 'white', zIndex: 1 }}>{d.date.slice(5)}</td>
                    <td className="px-2 py-1.5" style={{ color: dow === 0 ? '#dc2626' : dow === 6 ? '#0369a1' : '#52525b', fontWeight: (dow === 0 || dow === 6) ? 600 : 400 }}>{d.weekday}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: d.status === 'submitted' ? '#d1fae5' : d.status === 'draft' ? '#fef3c7' : '#f4f4f5',
                                 color: d.status === 'submitted' ? '#047857' : d.status === 'draft' ? '#92400e' : '#a1a1aa' }}>
                        {d.status === 'submitted' ? '已送' : d.status === 'draft' ? '草稿' : '無'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: '#16a34a' }}>{d.revenue ? fmt(d.revenue) : ''}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: '#be123c' }}>{d.totalExpense ? fmt(d.totalExpense) : ''}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: d.balance >= 0 ? '#0369a1' : '#dc2626' }}>{d.balance ? fmt(d.balance) : ''}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{d.food ? fmt(d.food) : ''}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{d.pack ? fmt(d.pack) : ''}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{d.misc ? fmt(d.misc) : ''}</td>
                  </tr>
                )
              })}
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
