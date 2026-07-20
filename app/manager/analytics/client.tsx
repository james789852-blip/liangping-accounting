'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CalendarRange, TrendingUp, TrendingDown, Minus,
  Store, Bike, Smartphone,
  Download, FileSpreadsheet, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }
function pct(cur: number, prev: number) {
  if (prev === 0) return cur > 0 ? 999 : 0
  return Math.round(((cur - prev) / prev) * 100)
}
function getTodayTW() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}
function addDays(date: string, n: number) {
  const d = new Date(date + 'T12:00:00+08:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function getDatesBetween(start: string, end: string) {
  const dates: string[] = []
  const d = new Date(start + 'T12:00:00+08:00')
  const last = new Date(end + 'T12:00:00+08:00')
  while (d <= last) {
    dates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

type PresetKey = 'week' | '14d' | 'month' | 'lastMonth' | '30d' | 'quarter' | 'custom'

function getPresetRange(preset: PresetKey, today: string): { start: string; end: string } {
  const d = new Date(today + 'T12:00:00+08:00')
  const y = d.getFullYear(), m = d.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (preset === 'week') {
    const dow = d.getDay()
    const monday = new Date(d); monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    return { start: monday.toISOString().slice(0, 10), end: today }
  }
  if (preset === '14d') return { start: addDays(today, -13), end: today }
  if (preset === 'month') return { start: `${y}-${pad(m + 1)}-01`, end: today }
  if (preset === 'lastMonth') {
    const lmEnd = new Date(y, m, 0)
    const lmStart = new Date(y, m - 1, 1)
    return {
      start: `${lmStart.getFullYear()}-${pad(lmStart.getMonth() + 1)}-01`,
      end: lmEnd.toISOString().slice(0, 10),
    }
  }
  if (preset === '30d') return { start: addDays(today, -29), end: today }
  if (preset === 'quarter') {
    const qStart = new Date(y, Math.floor(m / 3) * 3, 1)
    return { start: qStart.toISOString().slice(0, 10), end: today }
  }
  return { start: today, end: today }
}

function prevPeriod(start: string, end: string) {
  const s = new Date(start + 'T12:00:00'), e = new Date(end + 'T12:00:00')
  const days = Math.round((e.getTime() - s.getTime()) / 86400000)
  const pe = new Date(s); pe.setDate(pe.getDate() - 1)
  const ps = new Date(pe); ps.setDate(ps.getDate() - days)
  return { start: ps.toISOString().slice(0, 10), end: pe.toISOString().slice(0, 10) }
}

// ── Types ───────────────────────────────────────────────────────────────────────

interface RevData { total: number; pos: number; uber: number; panda: number; twpay: number; online: number; onlineCash: number; handwrite: number }
interface DayRev { date: string; total: number }
interface VendorItem { name: string; curAvg: number; prevAvg: number; curCount: number; prevCount: number }
interface Vendor { name: string; cur: number; prev: number; items: VendorItem[] }
interface ActualVendor { name: string; cur: number; prev: number; count: number }
interface VendorGroupAnalysis { name: string; cur: number; prev: number; count: number; vendors: ActualVendor[] }
interface BookkeepingDay { date: string; status: string; revenue: number; cost: number }
interface DeliveryStoreStat { name: string; cur: number; prev: number; count: number }

const ZERO: RevData = { total: 0, pos: 0, uber: 0, panda: 0, twpay: 0, online: 0, onlineCash: 0, handwrite: 0 }

function statusText(status: string) {
  if (status === 'verified') return '已審核'
  if (status === 'submitted') return '待審核'
  if (status === 'draft') return '草稿'
  if (status === 'disputed') return '退回修改'
  if (status === 'none') return '未做帳'
  return status || '未做帳'
}

function statusStyle(status: string) {
  if (status === 'verified') return { bg: '#d1fae5', color: '#047857', border: '#a7f3d0' }
  if (status === 'submitted') return { bg: '#fef3c7', color: '#92400e', border: '#fde68a' }
  if (status === 'draft') return { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' }
  if (status === 'disputed') return { bg: '#ffe4e6', color: '#be123c', border: '#fecdd3' }
  return { bg: '#f4f4f5', color: '#71717a', border: '#e4e4e7' }
}

const AVATAR_GRADS = [
  'linear-gradient(135deg,#f97316,#f59e0b)',
  'linear-gradient(135deg,#10b981,#06b6d4)',
  'linear-gradient(135deg,#F59E0B,#F97316)',
  'linear-gradient(135deg,#FBBF24,#f43f5e)',
  'linear-gradient(135deg,#06b6d4,#F59E0B)',
  'linear-gradient(135deg,#F97316,#FBBF24)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
]

// ── Sub-components ──────────────────────────────────────────────────────────────

function DeltaChip({ cur, prev, white = false }: { cur: number; prev: number; white?: boolean }) {
  if (prev === 0) return null
  const p = pct(cur, prev)
  if (white) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(255,255,255,0.25)', color: 'white' }}>
        {p > 0 ? <TrendingUp className="h-3 w-3" /> : p < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
        {p === 0 ? '持平' : `${p > 0 ? '+' : ''}${p}%`}
      </span>
    )
  }
  const positive = p > 0
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{
        background: p === 0 ? '#f4f4f5' : positive ? '#d1fae5' : '#ffe4e6',
        color: p === 0 ? '#71717a' : positive ? '#047857' : '#be123c',
      }}>
      {p > 0 ? <TrendingUp className="h-3 w-3" /> : p < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {p === 0 ? '持平' : `${p > 0 ? '+' : ''}${p}%`}
    </span>
  )
}

function DailyTrendChart({ data }: { data: DayRev[] }) {
  if (data.length === 0) return null
  const maxVal = Math.max(...data.map(d => d.total), 1)
  const filledData = data.filter(d => d.total > 0)
  const sorted = [...filledData].sort((a, b) => a.total - b.total)
  const q75 = sorted[Math.floor(sorted.length * 0.75)]?.total ?? 0
  const avg = filledData.length > 0 ? filledData.reduce((s, d) => s + d.total, 0) / filledData.length : 0
  const showValues = data.length <= 10

  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: showValues ? '190px' : '150px', paddingTop: showValues ? '28px' : '8px', paddingBottom: '32px' }}>
        {data.map((d, i) => {
          const isMissing = d.total <= 0
          const hp = isMissing ? 4 : Math.max((d.total / maxVal) * 100, 8)
          const isHigh = d.total >= q75
          const isLow = !isMissing && d.total < avg * 0.65
          const grad = isMissing
            ? 'linear-gradient(to top,#d4d4d8,#e4e4e7)'
            : isHigh
            ? 'linear-gradient(to top,#10b981,#a7f3d0)'
            : isLow
            ? 'linear-gradient(to top,#f43f5e,#fda4af)'
            : 'linear-gradient(to top,#F59E0B,#FDE68A)'
          const label = d.date.slice(5).replace(/^0/, '').replace('-', '/')
          const showLabel = data.length <= 14 ? true : i % Math.ceil(data.length / 10) === 0
          return (
            <div key={d.date} title={`${label}：${isMissing ? '尚未填寫營業額' : `$${fmt(d.total)}`}`}
              className="flex-1 min-w-0 relative flex flex-col justify-end cursor-pointer hover:opacity-80 transition-opacity"
              style={{ height: '100%' }}>
              {showValues && (
                <span className="absolute w-full text-center font-bold tabular-nums truncate px-0.5"
                  style={{ bottom: `calc(${hp}% + 5px)`, fontSize: '10px', color: isMissing ? '#a1a1aa' : '#52525b' }}>
                  {isMissing ? '未填' : `$${fmt(d.total)}`}
                </span>
              )}
              <div style={{ height: `${hp}%`, background: grad, borderRadius: '3px 3px 0 0' }} />
              {showLabel && (
                <span className="absolute text-center w-full" style={{ bottom: '-20px', fontSize: '9px', color: '#a1a1aa', lineHeight: 1 }}>
                  {label}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-5" style={{ fontSize: '11px', color: '#71717a' }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'linear-gradient(135deg,#F59E0B,#FDE68A)' }} />一般
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'linear-gradient(135deg,#10b981,#a7f3d0)' }} />表現好（前 25%）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'linear-gradient(135deg,#f43f5e,#fda4af)' }} />異常低
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#d4d4d8' }} />尚未填寫
        </span>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────────

export default function AnalyticsClient({ storeId, storeName, storeType, ichefUberLinked = false, memberStoreNames = {} }: {
  storeId: string
  storeName: string
  storeType?: string | null
  ichefUberLinked?: boolean
  memberStoreNames?: Record<string, string>
}) {
  const today = getTodayTW()

  const [preset, setPreset] = useState<PresetKey>('14d')
  const initRange = getPresetRange('14d', today)
  const [start, setStart] = useState(initRange.start)
  const [end, setEnd] = useState(initRange.end)
  const [customStart, setCustomStart] = useState(initRange.start)
  const [customEnd, setCustomEnd] = useState(initRange.end)
  const [loading, setLoading] = useState(true)
  const [curRev, setCurRev] = useState<RevData>(ZERO)
  const [prevRev, setPrevRev] = useState<RevData>(ZERO)
  const [dailyRevs, setDailyRevs] = useState<DayRev[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorGroups, setVendorGroups] = useState<VendorGroupAnalysis[]>([])
  const [deliveryStores, setDeliveryStores] = useState<DeliveryStoreStat[]>([])
  const [bookkeepingDays, setBookkeepingDays] = useState<BookkeepingDay[]>([])

  // Excel 匯出狀態
  const todayDate = new Date()
  const [exportType, setExportType] = useState<'month' | 'year'>('month')
  const [exportYear, setExportYear] = useState(todayDate.getFullYear())
  const [exportMonth, setExportMonth] = useState(todayDate.getMonth() + 1)
  const [exportLoading, setExportLoading] = useState(false)

  async function handleExcelExport() {
    setExportLoading(true)
    try {
      let url: string
      const base = storeType === '央廚' ? '/api/export/ck-native' : '/api/export/food-cost-native'
      if (exportType === 'year') {
        url = `${base}?storeId=${storeId}&type=year&year=${exportYear}&t=${Date.now()}`
      } else {
        url = `${base}?storeId=${storeId}&year=${exportYear}&month=${exportMonth}&t=${Date.now()}`
      }
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) { toast.error('匯出失敗：' + await res.text()); return }
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') ?? ''
      const filenameMatch = /filename\*=UTF-8''([^;]+)/.exec(disposition)
      const filename = filenameMatch
        ? decodeURIComponent(filenameMatch[1])
        : `export-${exportYear}-${exportType}.xlsx`
      const dl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = dl; a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(dl)
      toast.success('匯出完成')
    } catch (e) {
      toast.error('匯出失敗：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setExportLoading(false)
    }
  }

  const prev = prevPeriod(start, end)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    if (storeType === '央廚') {
      async function loadCKRange(rangeStart: string, rangeEnd: string) {
        const { data: records } = await supabase.from('ck_daily_records')
          .select('id, business_date, status')
          .eq('ck_store_id', storeId)
          .gte('business_date', rangeStart)
          .lte('business_date', rangeEnd)
        const ids = (records ?? []).map((record: any) => record.id)
        if (ids.length === 0) return { records: [], orders: [], expenses: [] }
        const [ordersRes, expensesRes] = await Promise.all([
          supabase.from('ck_store_orders')
            .select('ck_daily_record_id, store_id, external_store_name, amount, ck_confirmed_amount')
            .in('ck_daily_record_id', ids),
          supabase.from('ck_expense_items')
            .select('ck_daily_record_id, item_name, amount, payer_name, vendor_group')
            .in('ck_daily_record_id', ids),
        ])
        return { records: records ?? [], orders: ordersRes.data ?? [], expenses: expensesRes.data ?? [] }
      }

      const [cur, prevData] = await Promise.all([
        loadCKRange(start, end),
        loadCKRange(prev.start, prev.end),
      ])
      function sumCK(data: Awaited<ReturnType<typeof loadCKRange>>) {
        const revByDate = new Map<string, number>()
        for (const record of data.records as any[]) revByDate.set(record.business_date, 0)
        for (const order of data.orders as any[]) {
          const record = (data.records as any[]).find(r => r.id === order.ck_daily_record_id)
          if (!record) continue
          const amount = order.store_id ? Number(order.ck_confirmed_amount ?? 0) : Number(order.amount ?? 0)
          revByDate.set(record.business_date, (revByDate.get(record.business_date) ?? 0) + amount)
        }
        const total = Array.from(revByDate.values()).reduce((sum, amount) => sum + amount, 0)
        return { total, pos: total, uber: 0, panda: 0, twpay: 0, online: 0, onlineCash: 0, handwrite: 0 }
      }
      setCurRev(sumCK(cur))
      setPrevRev(sumCK(prevData))
      const daily = (cur.records as any[])
        .map(record => {
          const total = (cur.orders as any[])
            .filter(order => order.ck_daily_record_id === record.id)
            .reduce((sum, order) => sum + (order.store_id ? Number(order.ck_confirmed_amount ?? 0) : Number(order.amount ?? 0)), 0)
          return { date: record.business_date as string, total }
        })
        .sort((a, b) => a.date.localeCompare(b.date))
      setDailyRevs(daily)
      const ckRevenueByDate = new Map(daily.map(day => [day.date, day.total]))
      const ckCostByDate = new Map<string, number>()
      for (const expense of cur.expenses as any[]) {
        const record = (cur.records as any[]).find(r => r.id === expense.ck_daily_record_id)
        if (!record) continue
        ckCostByDate.set(record.business_date, (ckCostByDate.get(record.business_date) ?? 0) + Number(expense.amount ?? 0))
      }
      const ckStatusByDate = new Map<string, string>()
      for (const record of cur.records as any[]) ckStatusByDate.set(record.business_date, record.status ?? 'none')
      setBookkeepingDays(getDatesBetween(start, end).map(date => ({
        date,
        status: ckStatusByDate.get(date) ?? 'none',
        revenue: ckRevenueByDate.get(date) ?? 0,
        cost: ckCostByDate.get(date) ?? 0,
      })))

      function deliveryStoreTotals(data: Awaited<ReturnType<typeof loadCKRange>>) {
        const byStore = new Map<string, { total: number; count: number }>()
        for (const order of data.orders as any[]) {
          const name = order.store_id
            ? (memberStoreNames[order.store_id] ?? '未命名店家')
            : String(order.external_store_name ?? '').trim() || '未命名店家'
          const amount = order.store_id
            ? Number(order.ck_confirmed_amount ?? order.amount ?? 0)
            : Number(order.amount ?? 0)
          if (!byStore.has(name)) byStore.set(name, { total: 0, count: 0 })
          const row = byStore.get(name)!
          row.total += amount
          if (amount !== 0) row.count += 1
        }
        return byStore
      }
      const currentDeliveryStores = deliveryStoreTotals(cur)
      const previousDeliveryStores = deliveryStoreTotals(prevData)
      const deliveryStoreNames = new Set([...currentDeliveryStores.keys(), ...previousDeliveryStores.keys()])
      setDeliveryStores(Array.from(deliveryStoreNames).map(name => ({
        name,
        cur: currentDeliveryStores.get(name)?.total ?? 0,
        prev: previousDeliveryStores.get(name)?.total ?? 0,
        count: currentDeliveryStores.get(name)?.count ?? 0,
      })).filter(row => row.cur !== 0 || row.prev !== 0).sort((a, b) => b.cur - a.cur))

      function groupCK(data: Awaited<ReturnType<typeof loadCKRange>>) {
        const map: Record<string, { total: number; items: Record<string, { sum: number; cnt: number }> }> = {}
        for (const expense of data.expenses as any[]) {
          const group = expense.vendor_group?.trim() || '未分類'
          const actual = expense.payer_name?.trim() || '未指定'
          const key = `${group} · ${actual}`
          if (!map[key]) map[key] = { total: 0, items: {} }
          map[key].total += Number(expense.amount ?? 0)
          const itemName = expense.item_name || '未命名品項'
          if (!map[key].items[itemName]) map[key].items[itemName] = { sum: 0, cnt: 0 }
          map[key].items[itemName].sum += Number(expense.amount ?? 0)
          map[key].items[itemName].cnt += 1
        }
        return map
      }
      function ckVendorGroups(data: Awaited<ReturnType<typeof loadCKRange>>, prevRows: Awaited<ReturnType<typeof loadCKRange>>) {
        const current = new Map<string, Map<string, { total: number; count: number }>>()
        const previous = new Map<string, Map<string, number>>()
        for (const expense of data.expenses as any[]) {
          const group = expense.vendor_group?.trim() || '未分類'
          // 央廚帳目的 payer_name 是「誰付款」，不是廠商或採購內容。
          // 營運統計應由廠商分類往下顯示實際買了什麼。
          const actual = expense.item_name?.trim() || '未指定品項'
          if (!current.has(group)) current.set(group, new Map())
          const row = current.get(group)!.get(actual) ?? { total: 0, count: 0 }
          row.total += Number(expense.amount ?? 0)
          row.count += 1
          current.get(group)!.set(actual, row)
        }
        for (const expense of prevRows.expenses as any[]) {
          const group = expense.vendor_group?.trim() || '未分類'
          const actual = expense.item_name?.trim() || '未指定品項'
          if (!previous.has(group)) previous.set(group, new Map())
          previous.get(group)!.set(actual, (previous.get(group)!.get(actual) ?? 0) + Number(expense.amount ?? 0))
        }
        const names = new Set([...current.keys(), ...previous.keys()])
        return Array.from(names).map(name => {
          const curMap = current.get(name) ?? new Map()
          const prevMap = previous.get(name) ?? new Map()
          const actualNames = new Set([...curMap.keys(), ...prevMap.keys()])
          const vendors = Array.from(actualNames).map(actual => ({
            name: actual,
            cur: curMap.get(actual)?.total ?? 0,
            prev: prevMap.get(actual) ?? 0,
            count: curMap.get(actual)?.count ?? 0,
          })).sort((a, b) => b.cur - a.cur)
          return {
            name,
            cur: vendors.reduce((sum, vendor) => sum + vendor.cur, 0),
            prev: vendors.reduce((sum, vendor) => sum + vendor.prev, 0),
            count: vendors.reduce((sum, vendor) => sum + vendor.count, 0),
            vendors,
          }
        }).sort((a, b) => b.cur - a.cur)
      }
      const cm = groupCK(cur)
      const pm = groupCK(prevData)
      const allNames = new Set([...Object.keys(cm), ...Object.keys(pm)])
      setVendors(Array.from(allNames).map(name => {
        const cv = cm[name] ?? { total: 0, items: {} }
        const pv = pm[name] ?? { total: 0, items: {} }
        const allItems = new Set([...Object.keys(cv.items), ...Object.keys(pv.items)])
        return {
          name,
          cur: cv.total,
          prev: pv.total,
          items: Array.from(allItems).map(iname => ({
            name: iname,
            curAvg: cv.items[iname] ? cv.items[iname].sum / cv.items[iname].cnt : 0,
            prevAvg: pv.items[iname] ? pv.items[iname].sum / pv.items[iname].cnt : 0,
            curCount: cv.items[iname]?.cnt ?? 0,
            prevCount: pv.items[iname]?.cnt ?? 0,
          })),
        }
      }).sort((a, b) => b.cur - a.cur))
      setVendorGroups(ckVendorGroups(cur, prevData))
      setLoading(false)
      return
    }

    const [curClose, prevClose, curRec, prevRec] = await Promise.all([
      supabase.from('daily_closings')
        .select('business_date, status, total_revenue, revenue_items(channel, gross_amount)')
        .eq('store_id', storeId).gte('business_date', start).lte('business_date', end)
        .order('business_date', { ascending: true }),
      supabase.from('daily_closings')
        .select('business_date, status, total_revenue, revenue_items(channel, gross_amount)')
        .eq('store_id', storeId).gte('business_date', prev.start).lte('business_date', prev.end)
        .order('business_date', { ascending: true }),
      supabase.from('receipts')
        .select('business_date, vendor_name, actual_vendor_name, total_amount, receipt_items(item_name, amount)')
        .eq('store_id', storeId).gte('business_date', start).lte('business_date', end),
      supabase.from('receipts')
        .select('business_date, vendor_name, actual_vendor_name, total_amount, receipt_items(item_name, amount)')
        .eq('store_id', storeId).gte('business_date', prev.start).lte('business_date', prev.end),
    ])

    function calcRev(rows: any[]): RevData {
      const r = { ...ZERO }
      for (const c of rows) {
        r.total += c.total_revenue ?? 0
        for (const item of c.revenue_items ?? []) {
          const ch: string = item.channel
          if (ch === 'pos') r.pos += item.gross_amount
          else if (ch === 'uber') r.uber += item.gross_amount
          else if (ch === 'panda') r.panda += item.gross_amount
          else if (ch === 'twpay') r.twpay += item.gross_amount
          else if (ch === 'online') r.online += item.gross_amount
          else if (ch === 'online_cash') r.onlineCash += item.gross_amount
          else if (ch === 'handwrite') r.handwrite += item.gross_amount
        }
      }
      return r
    }

    function displayRevenue(row: any) {
      const revenueItems = row.revenue_items ?? []
      const channels = revenueItems.reduce((acc: RevData, item: any) => {
        const amount = Number(item.gross_amount ?? 0)
        const ch = item.channel as string
        if (ch === 'pos') acc.pos += amount
        else if (ch === 'uber') acc.uber += amount
        else if (ch === 'panda') acc.panda += amount
        else if (ch === 'twpay') acc.twpay += amount
        else if (ch === 'online') acc.online += amount
        else if (ch === 'online_cash') acc.onlineCash += amount
        else if (ch === 'handwrite') acc.handwrite += amount
        return acc
      }, { ...ZERO })
      const platform = channels.uber + channels.panda + channels.twpay + channels.online
      if (ichefUberLinked) return Number(row.total_revenue ?? 0) || channels.pos + channels.handwrite
      const enteredTotal = Number(row.total_revenue ?? 0)
      const recomputedTotal = channels.pos + channels.handwrite + platform
      return Math.max(enteredTotal, recomputedTotal)
    }
    const cr = calcRev(curClose.data ?? [])
    const pr = calcRev(prevClose.data ?? [])
    setCurRev(cr)
    setPrevRev(pr)

    const daily = (curClose.data ?? [])
      .map((c: any) => ({ date: c.business_date as string, total: displayRevenue(c) }))
      .sort((a: DayRev, b: DayRev) => a.date.localeCompare(b.date))
    setDailyRevs(daily)
    const revenueByDate = new Map(daily.map(day => [day.date, day.total]))
    const statusByDate = new Map<string, string>()
    for (const closing of (curClose.data ?? []) as any[]) statusByDate.set(closing.business_date, closing.status ?? 'none')
    const costByDate = new Map<string, number>()
    for (const receipt of (curRec.data ?? []) as any[]) {
      costByDate.set(receipt.business_date, (costByDate.get(receipt.business_date) ?? 0) + Number(receipt.total_amount ?? 0))
    }
    setBookkeepingDays(getDatesBetween(start, end).map(date => ({
      date,
      status: statusByDate.get(date) ?? 'none',
      revenue: revenueByDate.get(date) ?? 0,
      cost: costByDate.get(date) ?? 0,
    })))

    function groupVendors(rows: any[]) {
      const map: Record<string, { total: number; items: Record<string, { sum: number; cnt: number }> }> = {}
      for (const r of rows) {
        const group = r.vendor_name?.trim() || '未分類'
        const actual = r.actual_vendor_name?.trim() || '未指定'
        const v = `${group} · ${actual}`
        if (!map[v]) map[v] = { total: 0, items: {} }
        map[v].total += r.total_amount ?? 0
        for (const it of r.receipt_items ?? []) {
          const n = it.item_name
          if (!map[v].items[n]) map[v].items[n] = { sum: 0, cnt: 0 }
          map[v].items[n].sum += it.amount ?? 0
          map[v].items[n].cnt += 1
        }
      }
      return map
    }
    function receiptVendorGroups(rows: any[], prevRows: any[]): VendorGroupAnalysis[] {
      const current = new Map<string, Map<string, { total: number; count: number }>>()
      const previous = new Map<string, Map<string, number>>()
      for (const receipt of rows) {
        const group = receipt.vendor_name?.trim() || '未分類'
        const actual = receipt.actual_vendor_name?.trim() || '未指定'
        if (!current.has(group)) current.set(group, new Map())
        const row = current.get(group)!.get(actual) ?? { total: 0, count: 0 }
        row.total += Number(receipt.total_amount ?? 0)
        row.count += 1
        current.get(group)!.set(actual, row)
      }
      for (const receipt of prevRows) {
        const group = receipt.vendor_name?.trim() || '未分類'
        const actual = receipt.actual_vendor_name?.trim() || '未指定'
        if (!previous.has(group)) previous.set(group, new Map())
        previous.get(group)!.set(actual, (previous.get(group)!.get(actual) ?? 0) + Number(receipt.total_amount ?? 0))
      }
      const names = new Set([...current.keys(), ...previous.keys()])
      return Array.from(names).map(name => {
        const curMap = current.get(name) ?? new Map()
        const prevMap = previous.get(name) ?? new Map()
        const actualNames = new Set([...curMap.keys(), ...prevMap.keys()])
        const vendors = Array.from(actualNames).map(actual => ({
          name: actual,
          cur: curMap.get(actual)?.total ?? 0,
          prev: prevMap.get(actual) ?? 0,
          count: curMap.get(actual)?.count ?? 0,
        })).sort((a, b) => b.cur - a.cur)
        return {
          name,
          cur: vendors.reduce((sum, vendor) => sum + vendor.cur, 0),
          prev: vendors.reduce((sum, vendor) => sum + vendor.prev, 0),
          count: vendors.reduce((sum, vendor) => sum + vendor.count, 0),
          vendors,
        }
      }).sort((a, b) => b.cur - a.cur)
    }
    const cm = groupVendors(curRec.data ?? [])
    const pm = groupVendors(prevRec.data ?? [])
    const allNames = new Set([...Object.keys(cm), ...Object.keys(pm)])
    const vList: Vendor[] = Array.from(allNames).map(name => {
      const cv = cm[name] ?? { total: 0, items: {} }
      const pv = pm[name] ?? { total: 0, items: {} }
      const allItems = new Set([...Object.keys(cv.items), ...Object.keys(pv.items)])
      return {
        name,
        cur: cv.total,
        prev: pv.total,
        items: Array.from(allItems).map(iname => ({
          name: iname,
          curAvg: cv.items[iname] ? cv.items[iname].sum / cv.items[iname].cnt : 0,
          prevAvg: pv.items[iname] ? pv.items[iname].sum / pv.items[iname].cnt : 0,
          curCount: cv.items[iname]?.cnt ?? 0,
          prevCount: pv.items[iname]?.cnt ?? 0,
        })),
      }
    }).sort((a, b) => b.cur - a.cur)
    setVendors(vList)
    setVendorGroups(receiptVendorGroups(curRec.data ?? [], prevRec.data ?? []))
    setDeliveryStores([])
    setLoading(false)
  }, [storeId, storeType, start, end, ichefUberLinked, memberStoreNames])

  useEffect(() => { fetchData() }, [fetchData])
  function applyPreset(p: PresetKey) {
    setPreset(p)
    if (p !== 'custom') {
      const r = getPresetRange(p, today)
      setStart(r.start); setEnd(r.end)
      setCustomStart(r.start); setCustomEnd(r.end)
    }
  }

  const delCur = curRev.uber + curRev.panda
  const delPrev = prevRev.uber + prevRev.panda
  const digitalCur = curRev.twpay + curRev.online
  const digitalPrev = prevRev.twpay + prevRev.online
  const platformCur = delCur + digitalCur
  const platformPrev = delPrev + digitalPrev
  const totalRevenueCur = ichefUberLinked ? curRev.total : Math.max(curRev.total, curRev.pos + curRev.handwrite + platformCur)
  const totalRevenuePrev = ichefUberLinked ? prevRev.total : Math.max(prevRev.total, prevRev.pos + prevRev.handwrite + platformPrev)
  const storeCur = ichefUberLinked ? Math.max(totalRevenueCur - platformCur, 0) : curRev.pos + curRev.handwrite
  const storePrev = ichefUberLinked ? Math.max(totalRevenuePrev - platformPrev, 0) : prevRev.pos + prevRev.handwrite
  const totalCost = vendors.reduce((s, v) => s + v.cur, 0)
  const visibleVendorGroups = vendorGroups.filter(group => group.cur > 0)
  const vendorReceiptCount = visibleVendorGroups.reduce((sum, group) => sum + group.count, 0)
  const deliveryTotal = deliveryStores.reduce((sum, row) => sum + row.cur, 0)
  const statusCounts = bookkeepingDays.reduce((acc, day) => {
    acc[day.status] = (acc[day.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const completedDays = (statusCounts.verified ?? 0) + (statusCounts.submitted ?? 0)
  const completionRate = bookkeepingDays.length > 0 ? Math.round(completedDays / bookkeepingDays.length * 100) : 0

  const PRESETS: { key: PresetKey; label: string }[] = [
    { key: 'week', label: '本週' },
    { key: '14d', label: '近 14 天' },
    { key: 'month', label: '本月' },
    { key: 'lastMonth', label: '上月' },
    { key: '30d', label: '近 30 天' },
    { key: 'quarter', label: '本季' },
    { key: 'custom', label: '自訂' },
  ]

  return (
    <div className="min-h-full pb-24 lg:pb-8" style={{ background: '#fafafa' }}>

      {/* Header */}
      <div className="bg-white px-5 py-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
        <h1 className="text-2xl font-extrabold" style={{ letterSpacing: '-0.02em', background: 'linear-gradient(135deg,#F59E0B,#F97316,#FBBF24)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          營運洞察
        </h1>
        <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>{storeName} · 營業額、做帳狀況、廠商叫貨金額</p>
      </div>

      <div className="px-4 py-5 max-w-5xl mx-auto space-y-4">

        {/* Time Range Picker */}
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold shrink-0" style={{ color: '#52525b' }}>
              <CalendarRange className="h-4 w-4" />
              時間區間
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(({ key, label }) => (
                <button key={key} onClick={() => applyPreset(key)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={preset === key
                    ? { background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: 'white', border: '1.5px solid transparent', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }
                    : { background: 'white', color: '#52525b', border: '1.5px solid #e4e4e7' }}>
                  {label}
                </button>
              ))}
            </div>
            {preset === 'custom' ? (
              <div className="flex items-center gap-2 ml-auto">
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                  className="text-xs px-2 py-1.5 rounded-lg outline-none" style={{ border: '1.5px solid #e4e4e7', fontFamily: 'inherit' }} />
                <span style={{ color: '#a1a1aa', fontSize: '12px' }}>→</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                  className="text-xs px-2 py-1.5 rounded-lg outline-none" style={{ border: '1.5px solid #e4e4e7', fontFamily: 'inherit' }} />
                <button onClick={() => { setStart(customStart); setEnd(customEnd) }}
                  className="px-3 py-1.5 text-xs font-bold text-white rounded-lg"
                  style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)' }}>
                  查詢
                </button>
              </div>
            ) : (
              <span className="text-xs ml-auto shrink-0 hidden sm:block" style={{ color: '#a1a1aa' }}>
                {start} → {end}　·　vs {prev.start} → {prev.end}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="h-9 w-9 border-[3px] rounded-full animate-spin mx-auto mb-3" style={{ borderColor: '#FEF3C7', borderTopColor: '#F59E0B' }} />
            <p className="text-sm" style={{ color: '#a1a1aa' }}>分析資料中…</p>
          </div>
        ) : (
          <>
            {/* Revenue Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

              {/* Total Revenue */}
              <div className="rounded-[18px] p-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316,#FBBF24)', color: 'white' }}>
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle,rgba(255,255,255,0.15),transparent)', transform: 'translate(30%,-30%)' }} />
                <div className="h-9 w-9 rounded-[10px] flex items-center justify-center mb-3" style={{ background: 'rgba(255,255,255,0.2)' }}>
                  <TrendingUp className="h-[18px] w-[18px]" />
                </div>
                <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>總營業額（含外送/線上）</p>
                <p className="text-2xl font-extrabold tabular-nums" style={{ letterSpacing: '-0.02em' }}>${fmt(totalRevenueCur)}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <DeltaChip cur={totalRevenueCur} prev={totalRevenuePrev} white />
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>前 ${fmt(totalRevenuePrev)}</span>
                </div>
              </div>

              {/* Onsite */}
              <div className="bg-white rounded-[18px] p-5 overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                <div className="h-9 w-9 rounded-[10px] flex items-center justify-center mb-3" style={{ background: '#d1fae5', color: '#047857' }}>
                  <Store className="h-[18px] w-[18px]" />
                </div>
                <p className="text-xs mb-1" style={{ color: '#a1a1aa' }}>現場/POS（不含平台）</p>
                <p className="text-2xl font-extrabold tabular-nums" style={{ color: '#047857', letterSpacing: '-0.02em' }}>${fmt(storeCur)}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <DeltaChip cur={storeCur} prev={storePrev} />
                  <span className="text-[11px]" style={{ color: '#a1a1aa' }}>前 ${fmt(storePrev)}</span>
                </div>
              </div>

              {/* Delivery */}
              <div className="bg-white rounded-[18px] p-5 overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                <div className="h-9 w-9 rounded-[10px] flex items-center justify-center mb-3" style={{ background: '#ffedd5', color: '#c2410c' }}>
                  <Bike className="h-[18px] w-[18px]" />
                </div>
                <p className="text-xs mb-1" style={{ color: '#a1a1aa' }}>外送平台</p>
                <p className="text-2xl font-extrabold tabular-nums" style={{ color: '#f97316', letterSpacing: '-0.02em' }}>${fmt(delCur)}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <DeltaChip cur={delCur} prev={delPrev} />
                  <span className="text-[11px]" style={{ color: '#a1a1aa' }}>前 ${fmt(delPrev)}</span>
                </div>
              </div>

              {/* Mobile / Online */}
              <div className="bg-white rounded-[18px] p-5 overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                <div className="h-9 w-9 rounded-[10px] flex items-center justify-center mb-3" style={{ background: '#FEF3C7', color: '#92400E' }}>
                  <Smartphone className="h-[18px] w-[18px]" />
                </div>
                <p className="text-xs mb-1" style={{ color: '#a1a1aa' }}>行動支付 / 線上</p>
                <p className="text-2xl font-extrabold tabular-nums" style={{ color: '#92400E', letterSpacing: '-0.02em' }}>${fmt(digitalCur)}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <DeltaChip cur={digitalCur} prev={digitalPrev} />
                  <span className="text-[11px]" style={{ color: '#a1a1aa' }}>前 ${fmt(digitalPrev)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 items-start lg:grid-cols-[1.2fr_0.8fr]">
              <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5' }}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span className="h-8 w-8 rounded-[9px] flex items-center justify-center text-base" style={{ background: '#d1fae5' }}>📈</span>
                    每日營業額
                  </h3>
                  <span className="text-xs" style={{ color: '#a1a1aa' }}>{dailyRevs.length} 天有營業額資料</span>
                </div>
                {dailyRevs.length > 1 ? <DailyTrendChart data={dailyRevs} /> : (
                  <p className="text-sm text-center py-10" style={{ color: '#a1a1aa' }}>這個區間還沒有足夠的營業額資料</p>
                )}
              </div>

              <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5' }}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span className="h-8 w-8 rounded-[9px] flex items-center justify-center text-base" style={{ background: '#FEF3C7' }}>✅</span>
                    做帳狀況
                  </h3>
                  <span className="text-xs font-bold" style={{ color: completionRate >= 90 ? '#047857' : '#c2410c' }}>{completionRate}% 完成</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: '已審核', value: statusCounts.verified ?? 0, color: '#047857', bg: '#d1fae5' },
                    { label: '待審核', value: statusCounts.submitted ?? 0, color: '#92400e', bg: '#fef3c7' },
                    { label: '未完成', value: (statusCounts.none ?? 0) + (statusCounts.draft ?? 0) + (statusCounts.disputed ?? 0), color: '#be123c', bg: '#ffe4e6' },
                  ].map(card => (
                    <div key={card.label} className="rounded-[12px] p-3" style={{ background: card.bg }}>
                      <p className="text-[11px]" style={{ color: '#71717a' }}>{card.label}</p>
                      <p className="text-lg font-bold tabular-nums" style={{ color: card.color }}>{card.value}</p>
                    </div>
                  ))}
                </div>
                <div className="max-h-[280px] overflow-auto rounded-xl" style={{ border: '1px solid #f4f4f5' }}>
                  <div className="sticky top-0 z-10 grid items-center gap-2 px-3 py-2 text-[11px] font-bold"
                    style={{ gridTemplateColumns: '78px 74px 1fr 80px', background: '#fafafa', color: '#71717a', borderBottom: '1px solid #e4e4e7' }}>
                    <span>日期</span>
                    <span className="text-center">狀態</span>
                    <span className="text-right">總營業額</span>
                    <span className="text-right">支出單據</span>
                  </div>
                  {bookkeepingDays.map(day => {
                    const s = statusStyle(day.status)
                    return (
                      <div key={day.date} className="grid items-center gap-2 px-3 py-2.5 text-sm"
                        style={{ gridTemplateColumns: '78px 74px 1fr 80px', borderBottom: '1px solid #f4f4f5' }}>
                        <span className="font-semibold">{day.date.slice(5).replace('-', '/')}</span>
                        <span className="text-[11px] font-bold text-center rounded-full px-2 py-1"
                          style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                          {statusText(day.status)}
                        </span>
                        <span className="text-right tabular-nums" style={{ color: '#18181b' }}>${fmt(day.revenue)}</span>
                        <span className="text-right tabular-nums" style={{ color: '#71717a' }}>${fmt(day.cost)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5' }}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span className="h-8 w-8 rounded-[9px] flex items-center justify-center text-base" style={{ background: '#ffedd5' }}>🏪</span>
                    {storeType === '央廚' ? '採購明細' : '廠商叫貨明細'}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>
                    {storeType === '央廚'
                      ? '依廠商分類整理，直接顯示採購品項、單據筆數與本期金額'
                      : '依廠商分類整理，直接顯示實際廠商、單據筆數與本期金額'}
                  </p>
                </div>
                <span className="text-xs" style={{ color: '#a1a1aa' }}>{storeType === '央廚' ? '總採購' : '總支出'} ${fmt(totalCost)}</span>
              </div>

              {visibleVendorGroups.length === 0 ? (
                <p className="text-sm text-center py-10" style={{ color: '#a1a1aa' }}>這個區間沒有收據或叫貨資料</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-4 sm:grid-cols-3">
                    <div className="rounded-xl p-3" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                      <p className="text-[11px]" style={{ color: '#9a3412' }}>{storeType === '央廚' ? '採購分類' : '廠商分類'}</p>
                      <p className="text-lg font-extrabold tabular-nums" style={{ color: '#c2410c' }}>{visibleVendorGroups.length}</p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: '#f8fafc', border: '1px solid #e4e4e7' }}>
                      <p className="text-[11px]" style={{ color: '#71717a' }}>單據筆數</p>
                      <p className="text-lg font-extrabold tabular-nums">{vendorReceiptCount}</p>
                    </div>
                    <div className="rounded-xl p-3 col-span-2 sm:col-span-1" style={{ background: '#f8fafc', border: '1px solid #e4e4e7' }}>
                      <p className="text-[11px]" style={{ color: '#71717a' }}>{storeType === '央廚' ? '本期採購金額' : '本期叫貨金額'}</p>
                      <p className="text-lg font-extrabold tabular-nums">${fmt(totalCost)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {visibleVendorGroups.map((group, groupIndex) => {
                      const groupVendors = group.vendors.filter(vendor => vendor.cur > 0)
                      const maxVendor = Math.max(...groupVendors.map(vendor => vendor.cur), 1)
                      return (
                        <section key={group.name} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e4e4e7' }}>
                          <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
                            <div>
                              <p className="text-sm font-extrabold" style={{ color: '#9a3412' }}>{group.name}</p>
                              <p className="text-[11px]" style={{ color: '#c2410c' }}>
                                {groupVendors.length} {storeType === '央廚' ? '項採購品項' : '家實際廠商'} · {group.count} 筆單據
                              </p>
                            </div>
                            <p className="text-lg font-extrabold tabular-nums" style={{ color: '#c2410c' }}>${fmt(group.cur)}</p>
                          </div>
                          <div className="divide-y" style={{ borderColor: '#f4f4f5' }}>
                            {groupVendors.map((vendor, vendorIndex) => {
                              const share = group.cur > 0 ? Math.round(vendor.cur / group.cur * 1000) / 10 : 0
                              const change = vendor.prev > 0 ? pct(vendor.cur, vendor.prev) : null
                              const barW = Math.max(Math.round(vendor.cur / maxVendor * 100), 4)
                              return (
                                <div key={vendor.name} className="px-4 py-3">
                                  <div className="flex items-center justify-between gap-3 mb-1.5">
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold truncate">{vendor.name}</p>
                                      <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
                                        {vendor.count} 筆 · 佔分類 {share}%{change === null ? ' · 本期新增' : ` · 較前期 ${change > 0 ? '+' : ''}${change}%`}
                                      </p>
                                    </div>
                                    <p className="text-base font-extrabold tabular-nums shrink-0">${fmt(vendor.cur)}</p>
                                  </div>
                                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f4f4f5' }}>
                                    <div className="h-full rounded-full" style={{ width: `${barW}%`, background: AVATAR_GRADS[(groupIndex + vendorIndex) % AVATAR_GRADS.length] }} />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {storeType === '央廚' && (
              <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5' }}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <span className="h-8 w-8 rounded-[9px] flex items-center justify-center text-base" style={{ background: '#ffedd5' }}>📦</span>
                      配送店家金額統計
                    </h3>
                    <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>依央廚每日輸入／確認的配送金額，彙整各店本期叫貨紀錄</p>
                  </div>
                  <span className="text-xs font-bold tabular-nums" style={{ color: '#c2410c' }}>配送合計 ${fmt(deliveryTotal)}</span>
                </div>

                {deliveryStores.length === 0 ? (
                  <p className="text-sm text-center py-10" style={{ color: '#a1a1aa' }}>這個區間尚無店家配送金額</p>
                ) : (
                  <div className="overflow-hidden rounded-xl" style={{ border: '1px solid #e4e4e7' }}>
                    <div className="grid grid-cols-[1fr_74px_100px] gap-2 px-4 py-2 text-[11px] font-bold" style={{ background: '#fafafa', color: '#71717a', borderBottom: '1px solid #e4e4e7' }}>
                      <span>配送店家</span><span className="text-right">筆數</span><span className="text-right">本期金額</span>
                    </div>
                    {deliveryStores.map(store => {
                      const change = store.prev > 0 ? pct(store.cur, store.prev) : null
                      return (
                        <div key={store.name} className="grid grid-cols-[1fr_74px_100px] gap-2 px-4 py-3 items-center" style={{ borderBottom: '1px solid #f4f4f5' }}>
                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate">{store.name}</p>
                            <p className="text-[11px]" style={{ color: '#a1a1aa' }}>{change === null ? '本期新增' : `較前期 ${change > 0 ? '+' : ''}${change}%`}</p>
                          </div>
                          <span className="text-sm text-right tabular-nums" style={{ color: '#71717a' }}>{store.count}</span>
                          <span className="text-base text-right font-extrabold tabular-nums" style={{ color: '#c2410c' }}>${fmt(store.cur)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Excel 匯出 */}
            <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: '1px solid #f4f4f5' }}>
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-[10px] flex items-center justify-center"
                  style={{ background: '#FEF3C7', color: '#B45309' }}>
                  <FileSpreadsheet className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#18181b' }}>下載我的營運報表</p>
                  <p className="text-xs" style={{ color: '#a1a1aa' }}>{storeName} · 自動依資料庫即時生成最新版</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>報表類型</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setExportType('month')}
                    className="rounded-xl text-sm transition-all"
                    style={{
                      height: 40,
                      border: exportType === 'month' ? '1.5px solid #F59E0B' : '1.5px solid #e4e4e7',
                      background: exportType === 'month' ? '#FEF3C7' : 'white',
                      color: exportType === 'month' ? '#B45309' : '#52525b',
                      fontWeight: exportType === 'month' ? 700 : 500,
                    }}>
                    單月報表
                  </button>
                  <button type="button" onClick={() => setExportType('year')}
                    className="rounded-xl text-sm transition-all"
                    style={{
                      height: 40,
                      border: exportType === 'year' ? '1.5px solid #F59E0B' : '1.5px solid #e4e4e7',
                      background: exportType === 'year' ? '#FEF3C7' : 'white',
                      color: exportType === 'year' ? '#B45309' : '#52525b',
                      fontWeight: exportType === 'year' ? 700 : 500,
                    }}>
                    年度報表
                  </button>
                </div>
              </div>

              <div className={`grid gap-3 ${exportType === 'year' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>年份</label>
                  <select value={exportYear} onChange={e => setExportYear(parseInt(e.target.value))}
                    className="w-full rounded-xl text-sm outline-none"
                    style={{ height: 40, padding: '0 12px', border: '1.5px solid #e4e4e7', background: 'white', fontFamily: 'inherit' }}>
                    {Array.from({ length: 5 }, (_, i) => todayDate.getFullYear() - i).map(y => (
                      <option key={y} value={y}>{y} 年</option>
                    ))}
                  </select>
                </div>
                {exportType === 'month' && (
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>月份</label>
                    <select value={exportMonth} onChange={e => setExportMonth(parseInt(e.target.value))}
                      className="w-full rounded-xl text-sm outline-none"
                      style={{ height: 40, padding: '0 12px', border: '1.5px solid #e4e4e7', background: 'white', fontFamily: 'inherit' }}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m}>{m} 月</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="text-xs px-3 py-2 rounded-xl" style={{ background: '#F4F4F5', color: '#52525b' }}>
                {exportType === 'month'
                  ? <>將產出 <strong>2 個分頁</strong>：{exportMonth} 月食耗成本 + 廠商分析</>
                  : <>將產出 <strong>14 個分頁</strong>：年度總覽 + 1~12 月食耗成本 + 年度廠商分析</>}
              </div>

              <button onClick={handleExcelExport} disabled={exportLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: exportLoading ? 'not-allowed' : 'pointer', opacity: exportLoading ? 0.6 : 1 }}>
                {exportLoading ? <><Loader2 className="h-4 w-4 animate-spin" />匯出中…</> : <><Download className="h-4 w-4" />下載 Excel</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
