'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, ChevronLeft, ChevronRight, Store as StoreIcon, ChefHat, Download, Calendar, CalendarDays, FileArchive, Check, Square, X } from 'lucide-react'
import { fetchDailyClosingWithReceipts } from '@/app/actions/store-overview'
import { fetchCKDailyDetail } from '@/app/actions/ck-overview'
import { setManagerStore } from '@/app/actions/store-select'
import type { DailyStats } from '@/lib/store-aggregator'
import ReviewCard from './review-card'
import CKOverview from './ck-overview'
import HolidaysEditor from './holidays-editor'
import BatchHolidaysDialog from './batch-holidays-dialog'

interface Store { id: string; name: string }
interface ClosingRow {
  id?: string
  store_id: string
  business_date?: string
  status: string
  note?: string | null
  variance: number
  dispute_note?: string | null
  total_revenue?: number
  total_cost?: number
  total_expenses?: number
  expected_remit?: number
  actual_remit?: number
  should_include_delivery?: number
}
interface CKRow {
  ck_store_id: string
  status: string
  hq_paid: boolean
  ck_reimbursement_confirmed?: boolean
}
type StoreDetailState = {
  stats: DailyStats | null
  detail: { closing: any; receipts: any[] } | null
}
type StoreDetailCache = Record<string, StoreDetailState>

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
type StatusBadge = { label: string; bg: string; color: string }

function ckStatusBadges(status: string, hqPaid: boolean, handoffConfirmed: boolean): StatusBadge[] {
  if (status === 'verified') {
    const badges: StatusBadge[] = [{ label: '已審核', bg: '#d1fae5', color: '#047857' }]
    if (handoffConfirmed) {
      badges.push({ label: '已點交', bg: '#dbeafe', color: '#1d4ed8' })
    } else if (hqPaid) {
      badges.push({ label: '待點交', bg: '#FFFBEB', color: '#92400E' })
    }
    return badges
  }
  if (status === 'disputed') return [{ label: '已退回', bg: '#ffe4e6', color: '#be123c' }]
  if (status === 'submitted') {
    const badges: StatusBadge[] = [{ label: '待審核', bg: '#FFFBEB', color: '#92400E' }]
    if (handoffConfirmed) {
      badges.push({ label: '已點交', bg: '#dbeafe', color: '#1d4ed8' })
    } else if (hqPaid) {
      badges.push({ label: '待點交', bg: '#fef3c7', color: '#92400E' })
    }
    return badges
  }
  if (status === 'draft') return [{ label: '草稿', bg: '#fef3c7', color: '#92400e' }]
  return [{ label: '未輸入', bg: '#f4f4f5', color: '#a1a1aa' }]
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
  const [storeDetailCache, setStoreDetailCache] = useState<StoreDetailCache>({})
  const [showBatchHolidays, setShowBatchHolidays] = useState(false)
  const [showBatchExcel, setShowBatchExcel] = useState(false)
  const ckDetailCacheRef = useRef<Map<string, CKDetailState>>(new Map())

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
  const ckPendingCount = ckRecords.filter(r => (
    r.status === 'submitted'
    || (r.hq_paid && !r.ck_reimbursement_confirmed)
  )).length

  useEffect(() => {
    setStoreDetailCache({})
  }, [date])

  const rememberStoreDetail = useCallback((storeId: string, detail: StoreDetailState) => {
    setStoreDetailCache(prev => ({ ...prev, [storeId]: detail }))
  }, [])

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
            <button onClick={() => setShowBatchExcel(true)}
              className="hidden sm:flex items-center gap-1.5 h-10 px-3 rounded-lg text-xs font-bold"
              style={{ background: '#ecfeff', color: '#0e7490', border: '1px solid #a5f3fc' }}
              title="一次下載全部或部分店家、央廚 Excel">
              <FileArchive className="h-3.5 w-3.5" /> 批次 Excel
            </button>
            <button onClick={() => setShowBatchHolidays(true)}
              className="hidden sm:flex items-center gap-1.5 h-10 px-3 rounded-lg text-xs font-bold"
              style={{ background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe' }}
              title="一次設定多間店家或央廚公休">
              <CalendarDays className="h-3.5 w-3.5" /> 批次公休
            </button>
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
          <button onClick={() => setShowBatchHolidays(true)}
            className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe' }}>
            <CalendarDays className="h-3.5 w-3.5" />批次公休
          </button>
          <button onClick={() => setShowBatchExcel(true)}
            className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: '#ecfeff', color: '#0e7490', border: '1px solid #a5f3fc' }}>
            <FileArchive className="h-3.5 w-3.5" />批次 Excel
          </button>
        </div>
      </div>
      {showBatchHolidays && (
        <BatchHolidaysDialog
          stores={stores}
          ckStores={ckStores}
          date={date}
          onClose={() => setShowBatchHolidays(false)}
        />
      )}
      {showBatchExcel && (
        <BatchExcelDialog
          stores={stores}
          ckStores={ckStores}
          date={date}
          onClose={() => setShowBatchExcel(false)}
        />
      )}

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
              const isHoliday = holidaySet.has(s.id)
              const badges = isHoliday
                ? [{ label: '公休', bg: '#f3e8ff', color: '#6b21a8' }]
                : ckStatusBadges(
                    r?.status ?? 'none',
                    r?.hq_paid ?? false,
                    r?.ck_reimbursement_confirmed ?? false,
                  )
              const isActive = selectedCkStoreId === s.id
              return (
                <button key={s.id} onClick={() => selectCkStoreCard(s.id)}
                  className="text-left p-3 rounded-xl transition-all"
                  style={isActive
                    ? { background: 'white', border: '2px solid #F59E0B', boxShadow: '0 4px 12px rgba(245,158,11,0.15)' }
                    : { background: 'white', border: '1px solid #f4f4f5' }}>
                  <p className="text-sm font-bold truncate" style={{ color: '#18181b' }}>{s.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {badges.map(badge => (
                      <span key={badge.label} className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 選中詳情 */}
        {tab === 'store' && selectedStoreId && (
          <StoreDetail
            key={`${selectedStoreId}-${date}`}
            storeId={selectedStoreId}
            storeName={stores.find(s => s.id === selectedStoreId)?.name ?? ''}
            date={date}
            quickClosing={closingByStore[selectedStoreId] ?? null}
            cachedDetail={storeDetailCache[selectedStoreId] ?? null}
            onDetailLoaded={rememberStoreDetail}
          />
        )}
        {tab === 'ck' && selectedCkStoreId && (
          <CKDetail
            ckStoreId={selectedCkStoreId}
            storeName={ckStores.find(s => s.id === selectedCkStoreId)?.name ?? ''}
            date={date}
            cacheRef={ckDetailCacheRef}
          />
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

function batchTargetKey(kind: 'store' | 'ck', id: string) {
  return `${kind}:${id}`
}

function parseBatchTargetKey(key: string) {
  const [kind, storeId] = key.split(':')
  return { kind: kind as 'store' | 'ck', storeId }
}

function BatchExcelDialog({
  stores,
  ckStores,
  date,
  onClose,
}: {
  stores: Store[]
  ckStores: Store[]
  date: string
  onClose: () => void
}) {
  const [dateYear, dateMonth] = date.split('-').map(Number)
  const nowYear = new Date().getFullYear()
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [year, setYear] = useState(dateYear)
  const [month, setMonth] = useState(dateMonth)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set([
      ...stores.map(s => batchTargetKey('store', s.id)),
      ...ckStores.map(s => batchTargetKey('ck', s.id)),
    ]),
  )
  const [downloading, setDownloading] = useState(false)

  const storeKeys = stores.map(s => batchTargetKey('store', s.id))
  const ckKeys = ckStores.map(s => batchTargetKey('ck', s.id))
  const allKeys = useMemo(() => [...storeKeys, ...ckKeys], [storeKeys, ckKeys])
  const selectedStoreCount = stores.filter(s => selectedKeys.has(batchTargetKey('store', s.id))).length
  const selectedCkCount = ckStores.filter(s => selectedKeys.has(batchTargetKey('ck', s.id))).length
  const selectedTargets = useMemo(() => [...selectedKeys].map(parseBatchTargetKey), [selectedKeys])

  function toggleKey(key: string) {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function setGroup(keys: string[], checked: boolean) {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      for (const key of keys) {
        if (checked) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

  async function downloadBatch() {
    if (selectedTargets.length === 0) {
      toast.error('請至少選擇一間店家或央廚')
      return
    }
    setDownloading(true)
    try {
      const res = await fetch('/api/export/batch-native', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          type: mode,
          year,
          month,
          targets: selectedTargets,
        }),
      })
      if (!res.ok) {
        toast.error(await res.text())
        return
      }
      const blob = await res.blob()
      const disp = res.headers.get('content-disposition') ?? ''
      const match = /filename\*=UTF-8''([^;]+)/.exec(disp)
      const label = mode === 'year' ? `${year}年度` : `${year}年${month}月`
      const filename = match ? decodeURIComponent(match[1]) : `批次Excel_${label}.zip`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('批次 Excel 已開始下載')
    } catch (e) {
      toast.error('批次匯出失敗：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDownloading(false)
    }
  }

  const selectStyle: React.CSSProperties = {
    height: 40,
    padding: '0 12px',
    border: '1px solid #e4e4e7',
    borderRadius: 12,
    background: 'white',
    fontFamily: 'inherit',
    fontSize: 14,
    color: '#18181b',
    outline: 'none',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(15,23,42,0.35)' }}>
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl max-h-[88vh] overflow-hidden flex flex-col" style={{ boxShadow: '0 24px 60px rgba(15,23,42,0.22)' }}>
        <div className="px-5 py-4 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
          <div>
            <p className="text-xs font-semibold" style={{ color: '#0e7490' }}>批次匯出</p>
            <h2 className="text-lg font-bold" style={{ color: '#18181b' }}>批次下載店面與央廚 Excel</h2>
            <p className="text-xs mt-1" style={{ color: '#71717a' }}>會下載 ZIP 壓縮檔，每間店或央廚各自保留原本 Excel 格式。</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: '#f4f4f5', color: '#71717a' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div className="rounded-2xl p-4 space-y-3" style={{ background: '#f8fafc', border: '1px solid #f4f4f5' }}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setMode('month')} className="h-10 px-4 rounded-xl text-sm font-bold"
                style={mode === 'month' ? { background: '#0891b2', color: 'white' } : { background: 'white', color: '#52525b', border: '1px solid #e4e4e7' }}>
                當月 Excel
              </button>
              <button type="button" onClick={() => setMode('year')} className="h-10 px-4 rounded-xl text-sm font-bold"
                style={mode === 'year' ? { background: '#0891b2', color: 'white' } : { background: 'white', color: '#52525b', border: '1px solid #e4e4e7' }}>
                年度 Excel
              </button>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={selectStyle}>
                {Array.from({ length: 6 }, (_, i) => nowYear - i).map(y => <option key={y} value={y}>{y} 年</option>)}
              </select>
              {mode === 'month' && (
                <select value={month} onChange={e => setMonth(parseInt(e.target.value))} style={selectStyle}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m} 月</option>)}
                </select>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold" style={{ color: '#18181b' }}>
                已選 {selectedTargets.length} 份
                <span className="ml-2 text-xs font-medium" style={{ color: '#71717a' }}>
                  店面 {selectedStoreCount} · 央廚 {selectedCkCount}
                </span>
              </p>
              <button type="button" onClick={() => setGroup(allKeys, selectedKeys.size !== allKeys.length)}
                className="h-9 px-3 rounded-lg text-xs font-bold"
                style={{ background: 'white', color: '#0e7490', border: '1px solid #a5f3fc' }}>
                {selectedKeys.size === allKeys.length ? '清除全部' : '全選全部'}
              </button>
            </div>
          </div>

          <BatchExcelGroup
            title="店面"
            count={`${selectedStoreCount}/${stores.length}`}
            stores={stores}
            kind="store"
            selectedKeys={selectedKeys}
            keys={storeKeys}
            onToggle={toggleKey}
            onSetGroup={setGroup}
          />
          <BatchExcelGroup
            title="央廚"
            count={`${selectedCkCount}/${ckStores.length}`}
            stores={ckStores}
            kind="ck"
            selectedKeys={selectedKeys}
            keys={ckKeys}
            onToggle={toggleKey}
            onSetGroup={setGroup}
          />
        </div>

        <div className="p-4 flex gap-2" style={{ borderTop: '1px solid #f4f4f5' }}>
          <button type="button" onClick={onClose} className="h-12 px-5 rounded-xl text-sm font-bold" style={{ background: '#f4f4f5', color: '#52525b' }}>
            取消
          </button>
          <button type="button" onClick={downloadBatch} disabled={downloading || selectedTargets.length === 0}
            className="flex-1 h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            style={{
              background: downloading || selectedTargets.length === 0 ? '#d4d4d8' : 'linear-gradient(135deg,#0891b2,#06b6d4)',
              color: 'white',
              cursor: downloading || selectedTargets.length === 0 ? 'not-allowed' : 'pointer',
            }}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
            批次下載 ZIP
          </button>
        </div>
      </div>
    </div>
  )
}

function BatchExcelGroup({
  title,
  count,
  stores,
  kind,
  selectedKeys,
  keys,
  onToggle,
  onSetGroup,
}: {
  title: string
  count: string
  stores: Store[]
  kind: 'store' | 'ck'
  selectedKeys: Set<string>
  keys: string[]
  onToggle: (key: string) => void
  onSetGroup: (keys: string[], checked: boolean) => void
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'white', borderBottom: '1px solid #f4f4f5' }}>
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold" style={{ color: '#18181b' }}>{title}</p>
          <span className="text-xs" style={{ color: '#a1a1aa' }}>{count}</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onSetGroup(keys, true)} className="text-xs font-bold" style={{ color: '#0e7490' }}>全選</button>
          <button type="button" onClick={() => onSetGroup(keys, false)} className="text-xs font-bold" style={{ color: '#a1a1aa' }}>清除</button>
        </div>
      </div>
      {stores.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: '#a1a1aa', background: 'white' }}>沒有可匯出的資料</p>
      ) : stores.map(store => {
        const key = batchTargetKey(kind, store.id)
        const selected = selectedKeys.has(key)
        return (
          <button key={key} type="button" onClick={() => onToggle(key)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
            style={{ background: selected ? '#ecfeff' : 'white', borderTop: '1px solid #f4f4f5' }}>
            <span className="h-5 w-5 rounded-md flex items-center justify-center shrink-0"
              style={{ border: selected ? '1.5px solid #0891b2' : '1.5px solid #d4d4d8', background: selected ? '#0891b2' : 'white', color: selected ? 'white' : '#a1a1aa' }}>
              {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Square className="h-3 w-3" />}
            </span>
            <span className="text-sm font-semibold truncate" style={{ color: '#18181b' }}>{store.name}</span>
          </button>
        )
      })}
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

function StoreDetail({
  storeId,
  storeName,
  date,
  quickClosing,
  cachedDetail,
  onDetailLoaded,
}: {
  storeId: string
  storeName: string
  date: string
  quickClosing: ClosingRow | null
  cachedDetail: StoreDetailState | null
  onDetailLoaded: (storeId: string, detail: StoreDetailState) => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [detail, setDetail] = useState<{ closing: any; receipts: any[] } | null>(null)
  const [showHolidays, setShowHolidays] = useState(false)
  const hasLoadedRef = useRef(false)
  const requestIdRef = useRef(0)
  const [y, m] = date.split('-').map(Number)
  const visibleStats = cachedDetail?.stats ?? stats
  const visibleDetail = cachedDetail?.detail ?? detail
  const summaryClosing = quickClosing ?? visibleDetail?.closing ?? null

  const loadDetail = useCallback((force = false) => {
    const requestId = ++requestIdRef.current
    if (cachedDetail && !force) {
      setLoading(false)
      hasLoadedRef.current = true
      return
    } else if (hasLoadedRef.current) {
      setStats(null)
      setDetail(null)
      setLoading(false)
    } else {
      setLoading(true)
    }
    fetchDailyClosingWithReceipts(storeId, date, false)
      .then(result => {
        if (requestId !== requestIdRef.current) return
        if ('error' in result) {
          toast.error(result.error)
          return
        }
        if (!('success' in result)) return
        const next = {
          stats: null,
          detail: { closing: result.closing, receipts: result.receipts ?? [] },
        }
        setStats(next.stats)
        setDetail(next.detail)
        onDetailLoaded(storeId, next)
        hasLoadedRef.current = true
      })
      .catch(e => {
        if (requestId === requestIdRef.current) toast.error('載入失敗：' + (e instanceof Error ? e.message : String(e)))
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return
        setLoading(false)
      })
  }, [cachedDetail, storeId, date, onDetailLoaded])

  useEffect(() => {
    if (cachedDetail) {
      setLoading(false)
      return
    }
    loadDetail()
  }, [cachedDetail, loadDetail])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 relative" style={{ border: '1px solid #f4f4f5' }}>
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
        {visibleStats ? (
          <StoreStatsGrid data={visibleStats} closing={visibleDetail?.closing ?? quickClosing} />
        ) : summaryClosing ? (
          <QuickClosingSummary closing={summaryClosing} />
        ) : loading ? (
          <SummarySkeleton />
        ) : (
          <div className="rounded-xl p-4 text-sm" style={{ color: '#a1a1aa', background: '#fafafa', border: '1px solid #f4f4f5' }}>
            當日尚無資料
          </div>
        )}
      </div>
      {visibleDetail?.closing && (
        <div>
          <h3 className="text-sm font-bold mb-2 px-1" style={{ color: '#18181b' }}>📋 帳目審核</h3>
          <ReviewCard
            closing={{ ...visibleDetail.closing, stores: { name: storeName } } as any}
            receipts={visibleDetail.receipts as any}
            canReview={true}
            canDispute={true}
            defaultExpanded={false}
            onProcessed={() => {
              router.refresh()
              loadDetail(true)
            }}
          />
        </div>
      )}
      {!visibleDetail?.closing && !loading && !summaryClosing && (
        <div className="bg-white rounded-2xl p-4 text-center text-sm" style={{ color: '#a1a1aa', border: '1px solid #f4f4f5' }}>
          當日尚無帳目提交
        </div>
      )}
    </div>
  )
}

function QuickClosingSummary({ closing }: { closing: ClosingRow }) {
  const revenue = Number(closing.total_revenue ?? 0)
  const expenses = Number(closing.total_expenses ?? 0)
  const ck = Number(closing.total_cost ?? 0)
  const actual = Number(closing.actual_remit ?? 0)
  const variance = Number(closing.variance ?? 0)
  const expected = Number(closing.should_include_delivery ?? closing.expected_remit ?? 0)

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>快速摘要</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Stat label="總收入" value={revenue} color="#16a34a" />
          <Stat label="現金支出" value={expenses} color="#be123c" />
          <Stat label="央廚配送" value={ck} color="#f97316" />
          <Stat label="應包金額" value={expected} color="#0369a1" />
          <Stat label="實際包入" value={actual} color="#dc2626" />
          <Stat label="誤差" value={variance} color={Math.abs(variance) > 200 ? '#be123c' : '#0369a1'} />
        </div>
      </div>
      {closing.note && (
        <p className="text-xs rounded-xl px-3 py-2" style={{ background: '#f8fafc', color: '#52525b' }}>
          備註：{closing.note}
        </p>
      )}
      {closing.status === 'disputed' && closing.dispute_note && (
        <p className="text-xs rounded-xl px-3 py-2" style={{ background: '#fff7ed', color: '#c2410c' }}>
          退回原因：{closing.dispute_note}
        </p>
      )}
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>快速摘要</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[62px] rounded-xl animate-pulse" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }} />
          ))}
        </div>
      </div>
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

function StoreStatsGrid({ data, closing }: { data: DailyStats; closing?: ClosingRow | null }) {
  const storedActual = closing?.actual_remit
  const storedCk = closing?.total_cost
  const storedVariance = closing?.variance
  const displayActual = storedActual != null ? Number(storedActual) : data.actual
  const displayCk = storedCk != null ? Number(storedCk) : data.ck
  const displayVariance = storedVariance != null ? Number(storedVariance) : data.variance
  const displayAfterDeduct = displayActual - displayCk - displayVariance
  const displayRevenue = data.onsite > 0 ? data.onsite + displayVariance : data.revenue
  const uberEntries = Object.entries(data.uber).filter(([, v]) => v > 0)
  const handwriteEntries = Object.entries(data.handwrite).filter(([, v]) => v > 0)
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>通路收入</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Stat label="(手動)POS" value={data.totalRevenue || data.revenue || data.pos} color="#0369a1" />
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
          <Stat label="(手動)實際$" value={displayActual} color="#dc2626" />
          <Stat label="配送(月底結)" value={displayCk} color="#f97316" />
          <Stat label="結果" value={displayVariance} color="#0369a1" />
          <Stat label="扣除後的$" value={displayAfterDeduct} color="#71717a" />
          <Stat label="營業額" value={displayRevenue} color="#16a34a" />
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
type CKDetailState = {
  detail: any | null
}

function CKDetail({
  ckStoreId,
  storeName,
  date,
  cacheRef,
}: {
  ckStoreId: string
  storeName: string
  date: string
  cacheRef: React.RefObject<Map<string, CKDetailState>>
}) {
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any | null>(null)
  const hasLoadedRef = useRef(false)
  const requestIdRef = useRef(0)
  const stats = detail ? {
    revenue: Number(detail.revenueTotal ?? 0),
    totalExpense: Number(detail.expenseTotal ?? 0),
    hqPaid: !!detail.hqPaid,
    food: (detail.expenses ?? []).filter((e: any) => e.category === '食材').reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0),
    pack: (detail.expenses ?? []).filter((e: any) => e.category === '耗材').reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0),
    misc: (detail.expenses ?? []).filter((e: any) => e.category !== '食材' && e.category !== '耗材').reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0),
  } : null

  useEffect(() => {
    const key = `${ckStoreId}:${date}`
    const requestId = ++requestIdRef.current
    const cached = cacheRef.current.get(key)
    if (cached) {
      setDetail(cached.detail)
      setLoading(false)
    } else if (hasLoadedRef.current) {
      setDetail(null)
      setLoading(false)
    } else {
      setLoading(true)
    }
    fetchCKDailyDetail(ckStoreId, date)
      .then(dR => {
        if (requestId !== requestIdRef.current) return
        const next = {
          detail: 'success' in dR ? dR.detail : null,
        }
        cacheRef.current.set(key, next)
        setDetail(next.detail)
        hasLoadedRef.current = true
      })
      .catch(e => {
        if (requestId === requestIdRef.current) toast.error('載入失敗：' + (e instanceof Error ? e.message : String(e)))
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return
        setLoading(false)
      })
  }, [cacheRef, ckStoreId, date])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 relative" style={{ border: '1px solid #f4f4f5' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-base font-bold" style={{ color: '#18181b' }}>{storeName} · {date}</h2>
          <ExportButtons kind="ck" storeId={ckStoreId} storeName={storeName} date={date} />
        </div>
        {stats ? (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>結算</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="營業額" value={stats.revenue} color="#16a34a" />
                <Stat label="總支出" value={stats.totalExpense} color="#be123c" />
                <Stat label="待補款" value={stats.hqPaid ? 0 : stats.totalExpense} color="#dc2626" />
                <Stat label="補款完成" value={stats.hqPaid ? stats.totalExpense : 0} color="#f59e0b" />
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
        ) : loading ? (
          <SummarySkeleton />
        ) : (
          <div className="rounded-xl p-4 text-sm" style={{ color: '#a1a1aa', background: '#fafafa', border: '1px solid #f4f4f5' }}>
            當日尚無資料
          </div>
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
