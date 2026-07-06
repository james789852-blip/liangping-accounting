'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, ChevronLeft, ChevronRight, Store as StoreIcon, ChefHat, Download, Calendar, CalendarDays } from 'lucide-react'
import { fetchDailyStats, fetchDailyClosingWithReceipts } from '@/app/actions/store-overview'
import { fetchCKDailyStats, fetchCKDailyDetail } from '@/app/actions/ck-overview'
import { setManagerStore } from '@/app/actions/store-select'
import type { DailyStats } from '@/lib/store-aggregator'
import type { CKDailyStats } from '@/lib/ck-aggregator'
import ReviewCard from './review-card'
import CKOverview from './ck-overview'
import HolidaysEditor from './holidays-editor'

interface Store { id: string; name: string }
interface ClosingRow { store_id: string; status: string; variance: number; dispute_note?: string | null }
interface CKRow { ck_store_id: string; status: string; hq_paid: boolean }

interface Props {
  stores: Store[]
  ckStores: Store[]
  date: string
  initialStoreId: string
  initialCkStoreId: string
  initialTab: 'store' | 'ck'
  closings: ClosingRow[]
  ckRecords: CKRow[]
  holidayStoreIds: string[]
}

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

function prevDay(date: string) {
  const d = new Date(date + 'T12:00:00+08:00'); d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
function nextDay(date: string) {
  const d = new Date(date + 'T12:00:00+08:00'); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// 店家狀態 → 標籤 + 顏色
function storeStatusMeta(status: string, variance: number, isHoliday: boolean) {
  if (isHoliday) return { label: '公休', bg: '#f3e8ff', color: '#6b21a8' }
  if (status === 'verified') return { label: '已核准', bg: '#d1fae5', color: '#047857' }
  if (status === 'disputed') return { label: '已退回', bg: '#ffe4e6', color: '#be123c' }
  if (status === 'submitted') {
    if (Math.abs(variance ?? 0) > 200) return { label: '待審(異常)', bg: '#fff7ed', color: '#c2410c' }
    return { label: '待審核', bg: '#FFFBEB', color: '#92400E' }
  }
  if (status === 'draft') return { label: '草稿', bg: '#fef3c7', color: '#92400e' }
  return { label: '未輸入', bg: '#f4f4f5', color: '#a1a1aa' }
}
function ckStatusMeta(status: string, hqPaid: boolean) {
  if (status === 'submitted') {
    return hqPaid
      ? { label: '已補款', bg: '#d1fae5', color: '#047857' }
      : { label: '待補款', bg: '#FFFBEB', color: '#92400E' }
  }
  if (status === 'draft') return { label: '草稿', bg: '#fef3c7', color: '#92400e' }
  return { label: '未輸入', bg: '#f4f4f5', color: '#a1a1aa' }
}

export default function AccountingClient({
  stores, ckStores, date,
  initialStoreId, initialCkStoreId, initialTab,
  closings, ckRecords, holidayStoreIds,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'store' | 'ck'>(initialTab)
  const [selectedStoreId, setSelectedStoreId] = useState<string>(initialStoreId)
  const [selectedCkStoreId, setSelectedCkStoreId] = useState<string>(initialCkStoreId)

  useEffect(() => { setSelectedStoreId(initialStoreId) }, [initialStoreId])
  useEffect(() => { setSelectedCkStoreId(initialCkStoreId) }, [initialCkStoreId])

  const closingByStore = useMemo(
    () => Object.fromEntries(closings.map(c => [c.store_id, c])),
    [closings],
  )
  const ckByStore = useMemo(
    () => Object.fromEntries(ckRecords.map(r => [r.ck_store_id, r])),
    [ckRecords],
  )
  const holidaySet = useMemo(() => new Set(holidayStoreIds), [holidayStoreIds])

  // 待審核總數（給 badge 用）
  const pendingCount = closings.filter(c => c.status === 'submitted' || c.status === 'disputed').length
  const ckPendingCount = ckRecords.filter(r => r.status === 'submitted' && !r.hq_paid).length

  function goDate(d: string) {
    const params = new URLSearchParams()
    params.set('date', d)
    params.set('tab', tab)
    if (selectedStoreId) params.set('storeId', selectedStoreId)
    if (selectedCkStoreId) params.set('ckStoreId', selectedCkStoreId)
    router.push(`/hq/accounting?${params.toString()}`)
  }

  function replaceSelectionUrl(next: { tab?: 'store' | 'ck'; storeId?: string; ckStoreId?: string }) {
    const nextTab = next.tab ?? tab
    const params = new URLSearchParams()
    params.set('date', date)
    params.set('tab', nextTab)
    const storeId = next.storeId ?? selectedStoreId
    const ckStoreId = next.ckStoreId ?? selectedCkStoreId
    if (storeId) params.set('storeId', storeId)
    if (ckStoreId) params.set('ckStoreId', ckStoreId)
    window.history.replaceState(null, '', `/hq/accounting?${params.toString()}`)
  }

  function selectTab(nextTab: 'store' | 'ck') {
    setTab(nextTab)
    replaceSelectionUrl({ tab: nextTab })
  }

  function selectStoreCard(storeId: string) {
    const nextStoreId = selectedStoreId === storeId ? '' : storeId
    setSelectedStoreId(nextStoreId)
    if (nextStoreId) setManagerStore(nextStoreId).catch(() => {})
    replaceSelectionUrl({ tab: 'store', storeId: nextStoreId })
  }

  function selectCkStoreCard(storeId: string) {
    const nextStoreId = selectedCkStoreId === storeId ? '' : storeId
    setSelectedCkStoreId(nextStoreId)
    if (nextStoreId) setManagerStore(nextStoreId).catch(() => {})
    replaceSelectionUrl({ tab: 'ck', ckStoreId: nextStoreId })
  }

  const isToday = date === new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      {/* Header */}
      <div className="bg-white px-4 sm:px-6 py-4" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase" style={{ color: '#a1a1aa' }}>總公司</p>
            <h1 className="text-lg sm:text-xl font-bold" style={{ color: '#18181b' }}>帳目中心</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => goDate(prevDay(date))} className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ border: '1px solid #e4e4e7', background: 'white' }} title="前一天">
              <ChevronLeft className="h-4 w-4" style={{ color: '#52525b' }} />
            </button>
            <label className="relative flex items-center gap-2 h-10 px-3 rounded-lg cursor-pointer transition-colors hover:bg-slate-50"
              style={{ border: '1.5px solid #F59E0B', background: '#FFFBEB', color: '#92400E', minWidth: 180 }}
              title="點擊選日期">
              <Calendar className="h-4 w-4" />
              <span className="text-sm font-bold tabular-nums flex-1">{date}</span>
              <span className="text-[10px] opacity-70">點此選日期</span>
              <input type="date" value={date} onChange={e => e.target.value && goDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                style={{ fontFamily: 'inherit' }} />
            </label>
            <button onClick={() => goDate(nextDay(date))} disabled={isToday}
              className="h-10 w-10 rounded-lg flex items-center justify-center"
              style={{ border: '1px solid #e4e4e7', background: 'white', opacity: isToday ? 0.4 : 1, cursor: isToday ? 'default' : 'pointer' }} title="後一天">
              <ChevronRight className="h-4 w-4" style={{ color: '#52525b' }} />
            </button>
            {!isToday && (
              <button onClick={() => goDate(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10))}
                className="text-xs font-semibold px-2.5 h-10 rounded-lg"
                style={{ background: 'white', color: '#92400E', border: '1px solid #FDE68A' }}>今日</button>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-4xl mx-auto mt-3 flex gap-2">
          <button onClick={() => selectTab('store')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={tab === 'store'
              ? { background: '#F59E0B', color: 'white' }
              : { background: '#fafafa', color: '#52525b', border: '1px solid #e4e4e7' }}>
            <StoreIcon className="h-3.5 w-3.5" />店家
            {pendingCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: tab === 'store' ? 'white' : '#dc2626', color: tab === 'store' ? '#dc2626' : 'white' }}>
                {pendingCount}
              </span>
            )}
          </button>
          <button onClick={() => selectTab('ck')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={tab === 'ck'
              ? { background: '#F59E0B', color: 'white' }
              : { background: '#fafafa', color: '#52525b', border: '1px solid #e4e4e7' }}>
            <ChefHat className="h-3.5 w-3.5" />央廚
            {ckPendingCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: tab === 'ck' ? 'white' : '#dc2626', color: tab === 'ck' ? '#dc2626' : 'white' }}>
                {ckPendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 pb-28 space-y-4">
        {/* 狀態卡片 grid：所有店家或央廚 */}
        <div>
          <p className="text-xs font-semibold mb-2 px-1" style={{ color: '#71717a' }}>
            {tab === 'store' ? `店家（${stores.length} 家）` : `央廚（${ckStores.length} 間）`}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {tab === 'store' ? stores.map(s => {
              const c = closingByStore[s.id]
              const isHoliday = holidaySet.has(s.id)
              const meta = storeStatusMeta(c?.status ?? 'none', c?.variance ?? 0, isHoliday)
              const isActive = selectedStoreId === s.id
              return (
                <button key={s.id} onClick={() => selectStoreCard(s.id)}
                  className="text-left p-3 rounded-xl transition-all"
                  style={isActive
                    ? { background: 'white', border: '2px solid #F59E0B', boxShadow: '0 4px 12px rgba(245,158,11,0.15)' }
                    : { background: 'white', border: '1px solid #f4f4f5' }}>
                  <p className="text-sm font-bold truncate" style={{ color: '#18181b' }}>{s.name}</p>
                  <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                </button>
              )
            }) : ckStores.map(s => {
              const r = ckByStore[s.id]
              const meta = ckStatusMeta(r?.status ?? 'none', r?.hq_paid ?? false)
              const isActive = selectedCkStoreId === s.id
              return (
                <button key={s.id} onClick={() => selectCkStoreCard(s.id)}
                  className="text-left p-3 rounded-xl transition-all"
                  style={isActive
                    ? { background: 'white', border: '2px solid #F59E0B', boxShadow: '0 4px 12px rgba(245,158,11,0.15)' }
                    : { background: 'white', border: '1px solid #f4f4f5' }}>
                  <p className="text-sm font-bold truncate" style={{ color: '#18181b' }}>{s.name}</p>
                  <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 選中詳情 */}
        {tab === 'store' && selectedStoreId && (
          <StoreDetail storeId={selectedStoreId} storeName={stores.find(s => s.id === selectedStoreId)?.name ?? ''} date={date} />
        )}
        {tab === 'ck' && selectedCkStoreId && (
          <CKDetail ckStoreId={selectedCkStoreId} storeName={ckStores.find(s => s.id === selectedCkStoreId)?.name ?? ''} date={date} />
        )}
        {tab === 'store' && !selectedStoreId && (
          <div className="text-center py-8 text-sm" style={{ color: '#a1a1aa' }}>選一家店查看數據與審核</div>
        )}
        {tab === 'ck' && !selectedCkStoreId && (
          <div className="text-center py-8 text-sm" style={{ color: '#a1a1aa' }}>選一間央廚查看數據與審核</div>
        )}
      </div>
    </div>
  )
}

/* ─────────── 匯出按鈕（含年月自由選擇） ─────────── */
function ExportButtons({ kind, storeId, storeName, date }: { kind: 'store' | 'ck'; storeId: string; storeName: string; date: string }) {
  const [downloading, setDownloading] = useState<'month' | 'year' | null>(null)
  const [dy, dm] = date.split('-')
  const nowY = new Date().getFullYear()
  const [year, setYear] = useState<number>(parseInt(dy))
  const [monthNum, setMonthNum] = useState<number>(parseInt(dm))
  // 當外部 date 改變時同步（除非 user 已手動選）
  useEffect(() => { setYear(parseInt(dy)); setMonthNum(parseInt(dm)) }, [dy, dm])
  const yearOptions = Array.from({ length: 5 }, (_, i) => nowY - i)

  async function handleExport(mode: 'month' | 'year') {
    if (!storeId) return
    setDownloading(mode)
    try {
      const base = kind === 'store' ? '/api/export/food-cost-native' : '/api/export/ck-native'
      const url = mode === 'year'
        ? `${base}?storeId=${storeId}&type=year&year=${year}&t=${Date.now()}`
        : `${base}?storeId=${storeId}&year=${year}&month=${monthNum}&t=${Date.now()}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) { toast.error('匯出失敗：' + await res.text()); return }
      const blob = await res.blob()
      const disp = res.headers.get('content-disposition') ?? ''
      const mth = /filename\*=UTF-8''([^;]+)/.exec(disp)
      const suffix = kind === 'store' ? '食耗成本' : '央廚食耗'
      const filename = mth
        ? decodeURIComponent(mth[1])
        : mode === 'year'
          ? `${storeName}_${year}年_${suffix}.xlsx`
          : `${storeName}_${year}年${monthNum}月_${suffix}.xlsx`
      const dl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = dl; a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(dl)
      toast.success('匯出完成')
    } catch (e) {
      toast.error('匯出失敗：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDownloading(null)
    }
  }

  const selectStyle: React.CSSProperties = { height: 34, padding: '0 8px', border: '1px solid #e4e4e7', borderRadius: 8, background: 'white', fontFamily: 'inherit', fontSize: 12, color: '#18181b', outline: 'none' }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={selectStyle}>
        {yearOptions.map(y => <option key={y} value={y}>{y} 年</option>)}
      </select>
      <select value={monthNum} onChange={e => setMonthNum(parseInt(e.target.value))} style={selectStyle}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m} 月</option>)}
      </select>
      <button onClick={() => handleExport('month')} disabled={downloading !== null}
        className="flex items-center gap-1.5 px-3 h-[34px] rounded-lg text-xs font-semibold"
        style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: 'white', boxShadow: '0 2px 6px rgba(245,158,11,0.25)', cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.6 : 1 }}>
        {downloading === 'month' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        當月 Excel
      </button>
      <button onClick={() => handleExport('year')} disabled={downloading !== null}
        className="flex items-center gap-1.5 px-3 h-[34px] rounded-lg text-xs font-semibold"
        style={{ background: 'white', border: '1.5px solid #F59E0B', color: '#B45309', cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.6 : 1 }}>
        {downloading === 'year' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        年度 Excel（13 分頁）
      </button>
    </div>
  )
}

/* ─────────── 店家詳情 ─────────── */
function StoreDetail({ storeId, storeName, date }: { storeId: string; storeName: string; date: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [detail, setDetail] = useState<{ closing: any; receipts: any[] } | null>(null)
  const [showHolidays, setShowHolidays] = useState(false)
  const [y, m] = date.split('-').map(Number)

  const loadDetail = useCallback(() => {
    setLoading(true); setStats(null); setDetail(null)
    Promise.all([
      fetchDailyStats(storeId, date),
      fetchDailyClosingWithReceipts(storeId, date),
    ])
      .then(([sR, dR]) => {
        if ('stats' in sR) setStats(sR.stats ?? null)
        if ('success' in dR) setDetail({ closing: dR.closing, receipts: dR.receipts ?? [] })
      })
      .catch(e => toast.error('載入失敗：' + (e instanceof Error ? e.message : String(e))))
      .finally(() => setLoading(false))
  }, [storeId, date])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" style={{ color: '#a1a1aa' }} /></div>

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold" style={{ color: '#18181b' }}>{storeName} · {date}</h2>
            <button onClick={() => setShowHolidays(true)}
              className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg"
              style={{ background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe', cursor: 'pointer' }}
              title="管理該店公休日">
              <CalendarDays className="h-3 w-3" /> 公休
            </button>
          </div>
          <ExportButtons kind="store" storeId={storeId} storeName={storeName} date={date} />
        </div>
        {showHolidays && (
          <HolidaysEditor storeId={storeId} storeName={storeName} year={y} monthNum={m} onClose={() => setShowHolidays(false)} />
        )}
        {stats ? (
          <StoreStatsGrid data={stats} />
        ) : (
          <p className="text-sm" style={{ color: '#a1a1aa' }}>當日尚無資料</p>
        )}
      </div>
      {detail?.closing && (
        <div>
          <h3 className="text-sm font-bold mb-2 px-1" style={{ color: '#18181b' }}>📋 帳目審核</h3>
          <ReviewCard
            closing={{ ...detail.closing, stores: { name: storeName } } as any}
            receipts={detail.receipts as any}
            canReview={true}
            canDispute={true}
            onProcessed={() => {
              router.refresh()
              loadDetail()
            }}
          />
        </div>
      )}
      {!detail?.closing && stats && (
        <div className="bg-white rounded-2xl p-4 text-center text-sm" style={{ color: '#a1a1aa', border: '1px solid #f4f4f5' }}>
          當日尚無帳目提交
        </div>
      )}
    </div>
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

function StoreStatsGrid({ data }: { data: DailyStats }) {
  const uberEntries = Object.entries(data.uber).filter(([, v]) => v > 0)
  const handwriteEntries = Object.entries(data.handwrite).filter(([, v]) => v > 0)
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>通路收入</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Stat label="(手動)POS" value={data.pos} color="#0369a1" />
          {data.channels?.twpay && <Stat label="TWPAY" value={data.twpay} color="#be123c" />}
          {data.channels?.panda && <Stat label="Panda" value={data.panda} color="#f43f5e" />}
          {data.channels?.online && <Stat label="線上點餐" value={data.online} color="#8b5cf6" />}
          {data.channels?.online_cash && <Stat label="線上點餐（現金）" value={data.online_cash} color="#a855f7" />}
          {uberEntries.map(([acc, v]) => <Stat key={acc} label={`Uber ${acc}`} value={v} color="#22c55e" />)}
          {handwriteEntries.map(([acc, v]) => <Stat key={acc} label={`手寫 ${acc}`} value={v} color="#f59e0b" />)}
        </div>
      </div>
      <div className="border-t pt-3" style={{ borderColor: '#f4f4f5' }}>
        <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>結算</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Stat label="現場" value={data.onsite} color="#f97316" />
          <Stat label="(手動)實際$" value={data.actual} color="#dc2626" />
          <Stat label="配送(月底結)" value={data.ck} color="#f97316" />
          <Stat label="結果" value={data.variance} color="#0369a1" />
          <Stat label="扣除後的$" value={data.after_deduct} color="#71717a" />
          <Stat label="營業額" value={data.revenue} color="#16a34a" />
        </div>
      </div>
      <div className="border-t pt-3" style={{ borderColor: '#f4f4f5' }}>
        <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>單據</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="總發票" value={data.invoiceTotal} color="#dc2626" />
          <Stat label="總收據" value={data.receiptTotal} color="#0369a1" />
          <Stat label="估價單" value={data.estimateTotal} color="#8b5cf6" />
          <Stat label="梁平退稅" value={data.taxRefund} color="#f59e0b" />
        </div>
      </div>
      <div className="border-t pt-3" style={{ borderColor: '#f4f4f5' }}>
        <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>成本</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="總（食+耗+雜）" value={data.totalCost} color="#be123c" />
          <Stat label="食材" value={data.food} color="#047857" />
          <Stat label="耗材" value={data.pack} color="#92400E" />
          <Stat label="雜項" value={data.misc} color="#71717a" />
        </div>
      </div>
    </div>
  )
}

/* ─────────── 央廚詳情 ─────────── */
function CKDetail({ ckStoreId, storeName, date }: { ckStoreId: string; storeName: string; date: string }) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<CKDailyStats | null>(null)
  const [detail, setDetail] = useState<any | null>(null)
  useEffect(() => {
    setLoading(true); setStats(null); setDetail(null)
    Promise.all([
      fetchCKDailyStats(ckStoreId, date),
      fetchCKDailyDetail(ckStoreId, date),
    ])
      .then(([sR, dR]) => {
        if ('stats' in sR) setStats(sR.stats ?? null)
        if ('success' in dR) setDetail(dR.detail)
      })
      .catch(e => toast.error('載入失敗：' + (e instanceof Error ? e.message : String(e))))
      .finally(() => setLoading(false))
  }, [ckStoreId, date])

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" style={{ color: '#a1a1aa' }} /></div>

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-base font-bold" style={{ color: '#18181b' }}>{storeName} · {date}</h2>
          <ExportButtons kind="ck" storeId={ckStoreId} storeName={storeName} date={date} />
        </div>
        {stats ? (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>結算</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="總收入" value={stats.revenue} color="#16a34a" />
                <Stat label="總支出" value={stats.totalExpense} color="#be123c" />
                <Stat label="淨額" value={stats.balance} color={stats.balance >= 0 ? '#0369a1' : '#dc2626'} />
                <Stat label="總補款" value={stats.hqPaid ? stats.totalExpense : 0} color="#f59e0b" />
              </div>
            </div>
            <div className="border-t pt-3" style={{ borderColor: '#f4f4f5' }}>
              <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>成本</p>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="食材" value={stats.food} color="#047857" />
                <Stat label="耗材" value={stats.pack} color="#92400E" />
                <Stat label="雜項" value={stats.misc} color="#71717a" />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: '#a1a1aa' }}>當日尚無資料</p>
        )}
      </div>
      {detail && (
        <div>
          <h3 className="text-sm font-bold mb-2 px-1" style={{ color: '#18181b' }}>📋 當日詳細 / 審核 / 補款</h3>
          <CKOverview data={[detail]} date={date} />
        </div>
      )}
      {!detail && (
        <div className="bg-white rounded-2xl p-4 text-center text-sm" style={{ color: '#a1a1aa', border: '1px solid #f4f4f5' }}>
          當日尚無央廚日報
        </div>
      )}
    </div>
  )
}
