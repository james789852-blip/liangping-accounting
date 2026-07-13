'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, Check, Loader2, Trash2 } from 'lucide-react'
import {
  addStoreHolidaysRange,
  deleteStoreHoliday,
  fetchStoreHolidays,
  type Holiday,
} from '@/app/actions/store-holidays'

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  height: 44,
  padding: '0 12px',
  border: '1.5px solid #e4e4e7',
  borderRadius: 12,
  fontSize: 14,
  background: 'white',
  outline: 'none',
  color: '#18181b',
}

function todayInTaipei() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

function addDays(date: string, amount: number) {
  const d = new Date(`${date}T12:00:00+08:00`)
  d.setDate(d.getDate() + amount)
  return d.toISOString().slice(0, 10)
}

function datesBetween(from: string, to: string) {
  if (!from || !to || from > to) return []
  const dates: string[] = []
  let cursor = from
  while (cursor <= to && dates.length < 366) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return dates
}

export default function ManagerHolidaysEditor({
  storeId,
  storeName,
  storeType,
  initialFrom,
  initialTo,
  initialHolidays,
}: {
  storeId: string
  storeName: string
  storeType: string
  initialFrom: string
  initialTo: string
  initialHolidays: Holiday[]
}) {
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [note, setNote] = useState('')
  const [holidays, setHolidays] = useState(initialHolidays)
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loadedRange, setLoadedRange] = useState({ from: initialFrom, to: initialTo })

  const dates = useMemo(() => datesBetween(from, to), [from, to])
  const previewText = dates.length > 0 ? `將設定 ${dates.length} 天公休` : '請先選擇正確的日期區間'

  async function refreshList(nextFrom = loadedRange.from, nextTo = loadedRange.to) {
    const result = await fetchStoreHolidays(storeId, nextFrom, nextTo)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    setHolidays(result.holidays)
    setLoadedRange({ from: nextFrom, to: nextTo })
  }

  async function handleSave() {
    if (dates.length === 0) {
      toast.error('請選擇正確的公休日期')
      return
    }
    setLoading(true)
    const result = await addStoreHolidaysRange(storeId, dates, note)
    if ('error' in result) {
      setLoading(false)
      toast.error(result.error)
      return
    }
    const nextFrom = from < loadedRange.from ? from : loadedRange.from
    const nextTo = to > loadedRange.to ? to : loadedRange.to
    await refreshList(nextFrom, nextTo)
    setLoading(false)
    setNote('')
    toast.success(`已設定 ${dates.length} 天公休`)
  }

  async function handleDelete(holiday: Holiday) {
    if (!window.confirm(`確定取消 ${holiday.holiday_date} 的公休設定嗎？`)) return
    setDeletingId(holiday.id)
    const result = await deleteStoreHoliday(holiday.id)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      setHolidays(prev => prev.filter(item => item.id !== holiday.id))
      toast.success('已取消公休')
    }
    setDeletingId(null)
  }

  async function handleLoadRange() {
    if (!from || !to || from > to) {
      toast.error('請選擇正確的查詢日期區間')
      return
    }
    setLoading(true)
    await refreshList(from, to)
    setLoading(false)
  }

  const today = todayInTaipei()

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-5 sm:px-8 py-5" style={{ borderBottom: '1px solid #f4f4f5' }}>
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>店長端 / 公休設定</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black" style={{ color: '#18181b' }}>{storeName} · 公休設定</h1>
              <p className="text-sm mt-1" style={{ color: '#71717a' }}>設定後，總公司提醒與帳目中心會自動排除公休日。</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
              style={{ color: '#6b21a8', background: '#f3e8ff', border: '1px solid #d8b4fe' }}>
              <CalendarDays className="h-3.5 w-3.5" /> {storeType}
            </span>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-5 pb-28 space-y-4">
        <section className="rounded-3xl bg-white p-5 sm:p-6" style={{ border: '1px solid #f4f4f5' }}>
          <div className="flex items-start gap-3 mb-5">
            <span className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#f3e8ff', color: '#7e22ce' }}>
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold" style={{ color: '#18181b' }}>批次設定公休</h2>
              <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>例如颱風、停水或連續休假，可一次設定多天。</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs font-semibold" style={{ color: '#52525b' }}>
              開始日期
              <input type="date" value={from} max="2999-12-31" onChange={e => {
                setFrom(e.target.value)
                if (to && e.target.value > to) setTo(e.target.value)
              }} style={INPUT_STYLE} className="mt-1.5" />
            </label>
            <label className="text-xs font-semibold" style={{ color: '#52525b' }}>
              結束日期
              <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} style={INPUT_STYLE} className="mt-1.5" />
            </label>
            <label className="text-xs font-semibold" style={{ color: '#52525b' }}>
              公休原因（選填）
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="例：颱風、停水" style={INPUT_STYLE} className="mt-1.5" />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
            <p className="text-sm font-semibold" style={{ color: dates.length > 0 ? '#6b21a8' : '#a1a1aa' }}>{previewText}</p>
            <button type="button" onClick={handleSave} disabled={loading || dates.length === 0}
              className="h-11 px-5 rounded-xl text-sm font-bold text-white inline-flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', opacity: loading || dates.length === 0 ? 0.55 : 1 }}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              儲存公休
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 sm:p-6" style={{ border: '1px solid #f4f4f5' }}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-bold" style={{ color: '#18181b' }}>已設定的公休日</h2>
              <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>可查詢日期並取消尚未到來的設定。</p>
            </div>
            <button type="button" onClick={handleLoadRange} disabled={loading}
              className="h-10 px-3 rounded-xl text-xs font-bold" style={{ background: '#fff', border: '1px solid #e4e4e7', color: '#52525b', opacity: loading ? 0.55 : 1 }}>
              查詢區間
            </button>
          </div>
          <div className="space-y-2">
            {holidays.length === 0 && <p className="text-sm text-center py-8" style={{ color: '#a1a1aa' }}>這個區間尚未設定公休</p>}
            {holidays.map(holiday => (
              <div key={holiday.id} className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
                <div className="min-w-0">
                  <p className="text-sm font-bold tabular-nums" style={{ color: '#18181b' }}>{holiday.holiday_date}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#71717a' }}>{holiday.note || '未填寫原因'}</p>
                </div>
                <button type="button" onClick={() => handleDelete(holiday)} disabled={deletingId === holiday.id}
                  className="h-9 px-3 rounded-xl inline-flex items-center gap-1 text-xs font-bold shrink-0"
                  style={{ color: '#be123c', background: '#fff1f2', border: '1px solid #fecdd3', opacity: deletingId === holiday.id ? 0.55 : 1 }}>
                  {deletingId === holiday.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  取消
                </button>
              </div>
            ))}
          </div>
          {today > loadedRange.to && <p className="text-[11px] mt-3" style={{ color: '#a1a1aa' }}>目前顯示的查詢區間已經過期，請重新選擇日期查詢。</p>}
        </section>
      </main>
    </div>
  )
}
