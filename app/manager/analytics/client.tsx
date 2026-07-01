'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CalendarRange, TrendingUp, TrendingDown, Minus,
  Store, Bike, Smartphone, AlertTriangle, Award,
  Users, Download, FileText, FileSpreadsheet, Loader2,
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

// 計算下一次會議（用該店設定）
function getNextMeeting(today: string, anchorDate: string | null, frequencyDays: number) {
  if (!anchorDate) return null
  const REF = new Date(anchorDate + 'T00:00:00+08:00')
  const t = new Date(today + 'T00:00:00+08:00')
  let d = new Date(REF)
  const freqMs = frequencyDays * 86400000
  // 回溯：若 anchor 在未來，往後找最近一次未來的會議日
  if (d > t) {
    // 已經是未來，直接用
  } else {
    while (d <= t) d = new Date(d.getTime() + freqMs)
  }
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  const dateStr = d.toISOString().slice(0, 10)
  const dow = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return { dateStr, dow, daysUntil: diff }
}

// ── Types ───────────────────────────────────────────────────────────────────────

interface RevData { total: number; pos: number; uber: number; panda: number; twpay: number; online: number; handwrite: number }
interface DayRev { date: string; total: number }
interface VendorItem { name: string; curAvg: number; prevAvg: number; curCount: number; prevCount: number }
interface Vendor { name: string; cur: number; prev: number; items: VendorItem[] }
interface Alert { title: string; msg: string; meta?: string; level: 'danger' | 'warn' | 'good' }

const ZERO: RevData = { total: 0, pos: 0, uber: 0, panda: 0, twpay: 0, online: 0, handwrite: 0 }

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
  const sorted = [...data].sort((a, b) => a.total - b.total)
  const q75 = sorted[Math.floor(sorted.length * 0.75)]?.total ?? 0
  const avg = data.reduce((s, d) => s + d.total, 0) / data.length

  return (
    <div>
      <div className="flex items-end gap-0.5" style={{ height: '130px', paddingBottom: '22px' }}>
        {data.map((d, i) => {
          const hp = Math.max((d.total / maxVal) * 100, 3)
          const isHigh = d.total >= q75
          const isLow = d.total < avg * 0.65
          const grad = isHigh
            ? 'linear-gradient(to top,#10b981,#a7f3d0)'
            : isLow
            ? 'linear-gradient(to top,#f43f5e,#fda4af)'
            : 'linear-gradient(to top,#F59E0B,#FDE68A)'
          const label = d.date.slice(5).replace(/^0/, '').replace('-', '/')
          const showLabel = data.length <= 14 ? true : i % Math.ceil(data.length / 10) === 0
          return (
            <div key={d.date} title={`${label} $${fmt(d.total)}`}
              className="flex-1 relative flex flex-col justify-end cursor-pointer hover:opacity-80 transition-opacity"
              style={{ height: '100%' }}>
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
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────────

export default function AnalyticsClient({ storeId, storeName, meetingAnchorDate, meetingFrequencyDays }: {
  storeId: string
  storeName: string
  meetingAnchorDate: string | null
  meetingFrequencyDays: number
}) {
  const today = getTodayTW()
  const meeting = getNextMeeting(today, meetingAnchorDate, meetingFrequencyDays)

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
  const [alerts, setAlerts] = useState<Alert[]>([])

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
      if (exportType === 'year') {
        url = `/api/export/closing-native?storeId=${storeId}&type=year&year=${exportYear}&t=${Date.now()}`
      } else {
        const month = `${exportYear}-${String(exportMonth).padStart(2, '0')}`
        url = `/api/export/closing-native?storeId=${storeId}&month=${month}&t=${Date.now()}`
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

    const [curClose, prevClose, curRec, prevRec] = await Promise.all([
      supabase.from('daily_closings')
        .select('business_date, total_revenue, revenue_items(channel, gross_amount)')
        .eq('store_id', storeId).gte('business_date', start).lte('business_date', end)
        .in('status', ['submitted', 'verified']),
      supabase.from('daily_closings')
        .select('total_revenue, revenue_items(channel, gross_amount)')
        .eq('store_id', storeId).gte('business_date', prev.start).lte('business_date', prev.end)
        .in('status', ['submitted', 'verified']),
      supabase.from('receipts')
        .select('vendor_name, total_amount, receipt_items(item_name, amount)')
        .eq('store_id', storeId).gte('business_date', start).lte('business_date', end),
      supabase.from('receipts')
        .select('vendor_name, total_amount, receipt_items(item_name, amount)')
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
          else if (ch === 'handwrite') r.handwrite += item.gross_amount
        }
      }
      return r
    }
    const cr = calcRev(curClose.data ?? [])
    const pr = calcRev(prevClose.data ?? [])
    setCurRev(cr)
    setPrevRev(pr)

    const daily = (curClose.data ?? [])
      .map((c: any) => ({ date: c.business_date as string, total: (c.total_revenue ?? 0) as number }))
      .sort((a: DayRev, b: DayRev) => a.date.localeCompare(b.date))
    setDailyRevs(daily)

    function groupVendors(rows: any[]) {
      const map: Record<string, { total: number; items: Record<string, { sum: number; cnt: number }> }> = {}
      for (const r of rows) {
        const v = r.vendor_name?.trim() || '（未填廠商）'
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

    const newAlerts: Alert[] = []
    if (pr.total > 0) {
      const rc = pct(cr.total, pr.total)
      if (rc >= 10) newAlerts.push({ level: 'good', title: `✨ 好消息：總營業額成長 ${rc}%`, msg: `本期 $${fmt(cr.total)}，較前期 $${fmt(pr.total)} 成長 $${fmt(cr.total - pr.total)}。`, meta: '維持目前運作節奏，繼續加油！' })
      else if (rc <= -10) newAlerts.push({ level: 'danger', title: `⚠ 總營業額下滑 ${Math.abs(rc)}%`, msg: `本期 $${fmt(cr.total)}，較前期 $${fmt(pr.total)} 減少 $${fmt(pr.total - cr.total)}。`, meta: '請留意近期營運狀況' })
    }
    const delCur2 = cr.uber + cr.panda, delPrev2 = pr.uber + pr.panda
    if (delPrev2 > 0) {
      const dc = pct(delCur2, delPrev2)
      if (dc <= -15) newAlerts.push({ level: 'warn', title: `⚠ 外送平台持續下滑 ${Math.abs(dc)}%`, msg: `本期外送 $${fmt(delCur2)}，較前期少 $${fmt(delPrev2 - delCur2)}。`, meta: '建議檢視促銷方案或平台上架狀況' })
    }
    if (cr.online > 0 && pr.online > 0) {
      const oc = pct(cr.online, pr.online)
      if (oc <= -20) newAlerts.push({ level: 'warn', title: `⚠ 線上點餐下降 ${Math.abs(oc)}%`, msg: `本期線上 $${fmt(cr.online)}，較前期下滑。`, meta: '可能原因：客流習慣改變？建議調查' })
    }
    for (const v of vList) {
      if (v.prev > 500) {
        const vc = pct(v.cur, v.prev)
        if (vc >= 20) newAlerts.push({ level: 'warn', title: `⚠ 「${v.name}」採購成本增加 ${vc}%`, msg: `前期 $${fmt(v.prev)} → 本期 $${fmt(v.cur)}，多出 $${fmt(v.cur - v.prev)}。`, meta: '建議確認叫貨量是否合理' })
      }
      for (const item of v.items) {
        if (item.prevAvg > 0 && item.curAvg > 0 && item.curCount >= 2 && item.prevCount >= 2) {
          const ic = pct(item.curAvg, item.prevAvg)
          if (ic >= 20) newAlerts.push({ level: 'danger', title: `⚠ 「${v.name}」${item.name} 疑似漲價 ${ic}%`, msg: `每次費用從 $${fmt(item.prevAvg)} 提高到 $${fmt(item.curAvg)}，共記錄 ${item.curCount} 次。`, meta: `估計多支出約 $${fmt((item.curAvg - item.prevAvg) * item.curCount)}` })
        }
      }
    }
    setAlerts(newAlerts)
    setLoading(false)
  }, [storeId, start, end])

  useEffect(() => { fetchData() }, [fetchData])

  function applyPreset(p: PresetKey) {
    setPreset(p)
    if (p !== 'custom') {
      const r = getPresetRange(p, today)
      setStart(r.start); setEnd(r.end)
      setCustomStart(r.start); setCustomEnd(r.end)
    }
  }

  const storeCur = curRev.pos + curRev.handwrite
  const storePrev = prevRev.pos + prevRev.handwrite
  const delCur = curRev.uber + curRev.panda
  const delPrev = prevRev.uber + prevRev.panda
  const totalCost = vendors.reduce((s, v) => s + v.cur, 0)
  const prevCost = vendors.reduce((s, v) => s + v.prev, 0)
  const maxVendor = vendors[0]?.cur || 1
  const avgDaily = dailyRevs.length > 0 ? dailyRevs.reduce((s, d) => s + d.total, 0) / dailyRevs.length : 0
  const bestDay = dailyRevs.reduce((b, d) => d.total > b.total ? d : b, { date: '', total: 0 })
  const foodCostRatio = curRev.total > 0 ? Math.round(totalCost / curRev.total * 1000) / 10 : 0
  const prevFoodCostRatio = prevRev.total > 0 && prevCost > 0 ? Math.round(prevCost / prevRev.total * 1000) / 10 : 0
  const deliveryRatio = curRev.total > 0 ? Math.round(delCur / curRev.total * 1000) / 10 : 0
  const prevDeliveryRatio = prevRev.total > 0 && delPrev > 0 ? Math.round(delPrev / prevRev.total * 1000) / 10 : 0

  const priceChanges = vendors.flatMap(v =>
    v.items
      .filter(i => i.prevAvg > 0 && i.curAvg > 0 && i.curCount >= 1 && i.prevCount >= 1)
      .map(i => ({ vendor: v.name, item: i.name, prevAvg: i.prevAvg, curAvg: i.curAvg, chg: pct(i.curAvg, i.prevAvg) }))
  ).sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 8)

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
        <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>{storeName} · 系統幫你整理好雙週會議要報告的數字，並自動偵測異常</p>
      </div>

      <div className="px-4 py-5 max-w-5xl mx-auto space-y-4">

        {/* Meeting Banner - show when meeting is within 7 days */}
        {meeting && meeting.daysUntil <= 7 && (
          <div className="rounded-2xl p-4 flex gap-3 items-center flex-wrap" style={{ background: 'linear-gradient(135deg,#fef3c7,#fce7f3)' }}>
            <div className="h-11 w-11 bg-white rounded-xl flex items-center justify-center shrink-0" style={{ color: '#f97316' }}>
              <Users className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: '#92400e' }}>
                下次雙週會議 · {meeting.dateStr.replace(/-/g, '/')}（{meeting.dow}）下午 3:00
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#b45309' }}>
                {meeting.daysUntil === 0 ? '今天！' : meeting.daysUntil === 1 ? '明天' : `${meeting.daysUntil} 天後`}
                　·　預設區間「近 14 天」已自動載入
              </p>
            </div>
            <button className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-white px-3 py-2.5 rounded-xl" style={{ background: '#18181b' }}>
              <Download className="h-3.5 w-3.5" />
              準備報告
            </button>
          </div>
        )}

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
                <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>總營業額</p>
                <p className="text-2xl font-extrabold tabular-nums" style={{ letterSpacing: '-0.02em' }}>${fmt(curRev.total)}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <DeltaChip cur={curRev.total} prev={prevRev.total} white />
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>前 ${fmt(prevRev.total)}</span>
                </div>
              </div>

              {/* Onsite */}
              <div className="bg-white rounded-[18px] p-5 overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                <div className="h-9 w-9 rounded-[10px] flex items-center justify-center mb-3" style={{ background: '#d1fae5', color: '#047857' }}>
                  <Store className="h-[18px] w-[18px]" />
                </div>
                <p className="text-xs mb-1" style={{ color: '#a1a1aa' }}>現場營業額</p>
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
                <p className="text-2xl font-extrabold tabular-nums" style={{ color: '#92400E', letterSpacing: '-0.02em' }}>${fmt(curRev.twpay + curRev.online)}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <DeltaChip cur={curRev.twpay + curRev.online} prev={prevRev.twpay + prevRev.online} />
                  <span className="text-[11px]" style={{ color: '#a1a1aa' }}>前 ${fmt(prevRev.twpay + prevRev.online)}</span>
                </div>
              </div>
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
              <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#fef3c7,#fce7f3)' }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span className="h-8 w-8 bg-white rounded-[9px] flex items-center justify-center text-base">🔔</span>
                    系統自動偵測 · 需要你關注
                  </h3>
                  <span className="text-xs font-bold" style={{ color: '#92400e' }}>{alerts.length} 項警示</span>
                </div>
                <div className="space-y-2.5">
                  {alerts.map((a, i) => {
                    const s = {
                      danger: { bg: '#ffe4e6', lc: '#f43f5e', ic: '#be123c' },
                      warn:   { bg: '#fef3c7', lc: '#f59e0b', ic: '#b45309' },
                      good:   { bg: '#d1fae5', lc: '#10b981', ic: '#047857' },
                    }[a.level]
                    return (
                      <div key={i} className="flex gap-3 p-3.5 rounded-2xl"
                        style={{ background: s.bg, borderLeft: `4px solid ${s.lc}` }}>
                        <div className="h-8 w-8 bg-white rounded-[10px] flex items-center justify-center shrink-0 mt-0.5" style={{ color: s.ic }}>
                          {a.level === 'good' ? <Award className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold" style={{ color: s.ic }}>{a.title}</p>
                          <p className="text-xs mt-0.5" style={{ color: '#52525b' }}>{a.msg}</p>
                          {a.meta && <p className="text-[11px] mt-1" style={{ color: '#71717a' }}>{a.meta}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Main grid: vendor list + trend + comparison */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">

              {/* Vendor Cost Analysis */}
              <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5' }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span className="h-8 w-8 rounded-[9px] flex items-center justify-center text-base" style={{ background: '#ffedd5' }}>🏪</span>
                    各廠商成本分析
                  </h3>
                  <span className="text-xs" style={{ color: '#a1a1aa' }}>
                    {start.slice(5).replace('-', '/')} — {end.slice(5).replace('-', '/')} · {vendors.filter(v => v.cur > 0).length} 家廠商
                  </span>
                </div>

                {vendors.filter(v => v.cur > 0).length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: '#a1a1aa' }}>本期無收據記錄</p>
                ) : (
                  <div className="space-y-2">
                    {vendors.filter(v => v.cur > 0).map((v, idx) => {
                      const vc = pct(v.cur, v.prev)
                      const barW = Math.round((v.cur / maxVendor) * 100)
                      return (
                        <div key={v.name} className="grid items-center gap-2 p-3 rounded-xl"
                          style={{ gridTemplateColumns: '36px 1fr 80px 90px 64px', background: '#f8fafc' }}>
                          <div className="h-9 w-9 rounded-[10px] flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                            style={{ background: AVATAR_GRADS[idx % AVATAR_GRADS.length] }}>
                            {v.name.slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{v.name}</p>
                            {v.items.length > 0 && (
                              <p className="text-[11px] truncate" style={{ color: '#a1a1aa' }}>
                                {v.items.slice(0, 3).map(i => i.name).join('、')}{v.items.length > 3 ? '…' : ''}
                              </p>
                            )}
                          </div>
                          <p className="text-sm font-bold tabular-nums text-right">${fmt(v.cur)}</p>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#e4e4e7' }}>
                            <div className="h-full rounded-full" style={{ width: `${barW}%`, background: AVATAR_GRADS[idx % AVATAR_GRADS.length] }} />
                          </div>
                          <span className="text-[11px] font-bold text-center px-2 py-1 rounded-full"
                            style={{
                              background: v.prev === 0 ? '#f4f4f5' : vc > 5 ? '#ffe4e6' : vc < -5 ? '#d1fae5' : '#f4f4f5',
                              color: v.prev === 0 ? '#71717a' : vc > 5 ? '#be123c' : vc < -5 ? '#047857' : '#71717a',
                            }}>
                            {v.prev === 0 ? '新' : vc > 0 ? `+${vc}%` : vc < 0 ? `${vc}%` : '持平'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
                {totalCost > 0 && (
                  <div className="mt-4 flex justify-between px-3 py-3 rounded-xl text-sm" style={{ background: '#f8fafc' }}>
                    <span style={{ color: '#52525b' }}>共支出</span>
                    <span className="font-bold tabular-nums">${fmt(totalCost)}</span>
                  </div>
                )}
              </div>

              {/* Right column */}
              <div className="space-y-4">

                {/* Daily trend */}
                {dailyRevs.length > 1 && (
                  <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5' }}>
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                      <span className="h-8 w-8 rounded-[9px] flex items-center justify-center text-base" style={{ background: '#d1fae5' }}>📈</span>
                      每日營業額趨勢
                    </h3>
                    <DailyTrendChart data={dailyRevs} />
                  </div>
                )}

                {/* Key comparison */}
                <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5' }}>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                    <span className="h-8 w-8 rounded-[9px] flex items-center justify-center text-base" style={{ background: '#FEF3C7' }}>⚖️</span>
                    重點比較
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        label: '食耗成本佔比',
                        value: `${foodCostRatio}%`,
                        sub: prevFoodCostRatio > 0
                          ? `${foodCostRatio < prevFoodCostRatio ? '↓' : '↑'} 較上期 ${prevFoodCostRatio}%`
                          : '本期首次統計',
                        bg: prevFoodCostRatio > 0 && foodCostRatio < prevFoodCostRatio
                          ? 'linear-gradient(135deg,#d1fae5,#ecfdf5)'
                          : prevFoodCostRatio > 0
                          ? 'linear-gradient(135deg,#ffe4e6,#fff1f2)'
                          : '#f8fafc',
                        vc: foodCostRatio > 30 ? '#be123c' : '#047857',
                      },
                      {
                        label: '外送佔比',
                        value: `${deliveryRatio}%`,
                        sub: prevDeliveryRatio > 0
                          ? `${deliveryRatio > prevDeliveryRatio ? '↑' : '↓'} 較上期 ${prevDeliveryRatio}%`
                          : '本期首次統計',
                        bg: prevDeliveryRatio > 0 && deliveryRatio > prevDeliveryRatio
                          ? 'linear-gradient(135deg,#ffe4e6,#fff1f2)'
                          : '#f8fafc',
                        vc: deliveryRatio > 50 ? '#be123c' : '#92400E',
                      },
                      {
                        label: '平均單日營業額',
                        value: avgDaily > 0 ? `$${fmt(avgDaily)}` : '—',
                        sub: `${dailyRevs.length} 天平均`,
                        bg: '#f8fafc', vc: '#18181b',
                      },
                      {
                        label: '表現最好日',
                        value: bestDay.total > 0 ? `$${fmt(bestDay.total)}` : '—',
                        sub: bestDay.date
                          ? `${bestDay.date.slice(5).replace('-', '/')}（較平均 +${Math.round((bestDay.total / (avgDaily || 1) - 1) * 100)}%）`
                          : '無資料',
                        bg: '#f8fafc', vc: '#18181b',
                      },
                    ].map((card, i) => (
                      <div key={i} className="rounded-[14px] p-4" style={{ background: card.bg }}>
                        <p className="text-xs mb-1" style={{ color: '#a1a1aa' }}>{card.label}</p>
                        <p className="text-xl font-bold tabular-nums mb-1" style={{ color: card.vc }}>{card.value}</p>
                        <p className="text-xs" style={{ color: '#52525b' }}>{card.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Price Changes */}
            {priceChanges.length > 0 && (
              <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5' }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span className="h-8 w-8 rounded-[9px] flex items-center justify-center text-base" style={{ background: '#ffe4e6' }}>📉</span>
                    單價變動偵測
                  </h3>
                  <span className="text-xs" style={{ color: '#a1a1aa' }}>與前一期相比</span>
                </div>
                <div className="grid text-[11px] font-semibold uppercase tracking-wide px-3 pb-2.5"
                  style={{ gridTemplateColumns: '1fr 90px 90px 72px', color: '#a1a1aa', borderBottom: '1px solid #f4f4f5' }}>
                  <span>品項 / 廠商</span>
                  <span className="text-right">前期均價</span>
                  <span className="text-right">本期均價</span>
                  <span className="text-right">變動</span>
                </div>
                <div>
                  {priceChanges.map((p, i) => (
                    <div key={i} className="grid items-center px-3 py-2.5"
                      style={{ gridTemplateColumns: '1fr 90px 90px 72px', borderBottom: i !== priceChanges.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                      <div>
                        <p className="text-sm font-semibold">{p.item}</p>
                        <p className="text-[11px]" style={{ color: '#a1a1aa' }}>{p.vendor}</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-right">${fmt(p.prevAvg)}</p>
                      <p className="text-sm font-semibold tabular-nums text-right"
                        style={{ color: p.chg > 5 ? '#be123c' : p.chg < -5 ? '#047857' : '#52525b' }}>
                        ${fmt(p.curAvg)}
                      </p>
                      <div className="flex justify-end">
                        <span className="text-[11px] font-bold px-2 py-1 rounded-lg"
                          style={{
                            background: p.chg > 5 ? '#ffe4e6' : p.chg < -5 ? '#d1fae5' : '#f4f4f5',
                            color: p.chg > 5 ? '#be123c' : p.chg < -5 ? '#047857' : '#71717a',
                          }}>
                          {p.chg > 0 ? `+${p.chg}%↑` : p.chg < 0 ? `${p.chg}%↓` : '未變動'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
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
                  <p className="text-sm font-bold" style={{ color: '#18181b' }}>下載我的店面報表</p>
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
                  ? <>📄 將產出 <strong>2 個分頁</strong>：月度總覽 + {exportMonth} 月食耗成本</>
                  : <>📄 將產出 <strong>13 個分頁</strong>：年度總覽 + 1~12 月食耗成本</>}
              </div>

              <button onClick={handleExcelExport} disabled={exportLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: exportLoading ? 'not-allowed' : 'pointer', opacity: exportLoading ? 0.6 : 1 }}>
                {exportLoading ? <><Loader2 className="h-4 w-4 animate-spin" />匯出中…</> : <><Download className="h-4 w-4" />下載 Excel</>}
              </button>
            </div>

            {/* Export Bar */}
            <div className="rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap"
              style={{ background: 'linear-gradient(135deg,#18181b,#92400E)', color: 'white' }}>
              <div>
                <p className="text-sm font-bold mb-1">📑 雙週會議報告</p>
                <p className="text-xs" style={{ opacity: 0.85 }}>系統整理所有數字與警示，方便你會議時報告使用。</p>
              </div>
              <button className="flex items-center gap-2 bg-white text-sm font-semibold px-4 py-2.5 rounded-xl shrink-0"
                style={{ color: '#18181b', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                <FileText className="h-4 w-4" />
                產出會議 PDF
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
