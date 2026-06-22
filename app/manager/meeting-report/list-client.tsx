'use client'

import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Plus, Calendar, FileText, ChevronRight, Loader2, Trash2, Search } from 'lucide-react'
import { createMeetingReport, deleteMeetingReport } from '@/app/actions/meeting-reports'
import { updateMeetingSchedule } from '@/app/actions/meeting-schedule'
import { Settings as SettingsIcon, Save, X as XIcon } from 'lucide-react'

interface ReportRow {
  id: string
  period_start: string
  period_end: string
  meeting_date: string | null
  status: 'draft' | 'submitted'
  updated_at: string
}

interface Props {
  storeId: string
  storeName: string
  meetingAnchorDate: string | null
  meetingFrequencyDays: number
  reports: ReportRow[]
}

export default function MeetingReportListClient({ storeId, storeName, meetingAnchorDate, meetingFrequencyDays, reports }: Props) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'submitted'>('all')

  // 會議排程設定
  const [showSchedule, setShowSchedule] = useState(false)
  const [anchorDate, setAnchorDate] = useState(meetingAnchorDate ?? '')
  const [freqDays, setFreqDays] = useState(meetingFrequencyDays)
  const [savingSchedule, setSavingSchedule] = useState(false)

  async function saveSchedule() {
    setSavingSchedule(true)
    try {
      const r = await updateMeetingSchedule(storeId, {
        meeting_anchor_date: anchorDate || null,
        meeting_frequency_days: freqDays,
      })
      if ('error' in r) { toast.error(r.error); return }
      toast.success('會議排程已儲存')
      setShowSchedule(false)
      router.refresh()
    } finally {
      setSavingSchedule(false)
    }
  }

  // 預估下次會議
  const nextMeetingInfo = useMemo(() => {
    if (!anchorDate) return null
    const todayMs = Date.now() + 8 * 3600000
    const todayDate = new Date(new Date(todayMs).toISOString().slice(0, 10) + 'T00:00:00+08:00')
    let next = new Date(anchorDate + 'T00:00:00+08:00')
    const freqMs = freqDays * 86400000
    while (next < todayDate) next = new Date(next.getTime() + freqMs)
    const diffDays = Math.round((next.getTime() - todayDate.getTime()) / 86400000)
    return {
      date: next.toISOString().slice(0, 10),
      dow: ['日', '一', '二', '三', '四', '五', '六'][next.getDay()],
      daysUntil: diffDays,
    }
  }, [anchorDate, freqDays])

  const years = useMemo(() => {
    const set = new Set<string>()
    for (const r of reports) set.add(r.period_end.slice(0, 4))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [reports])

  const filtered = useMemo(() => {
    return reports.filter(r => {
      if (yearFilter !== 'all' && !r.period_end.startsWith(yearFilter)) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      return true
    })
  }, [reports, yearFilter, statusFilter])

  async function handleCreate() {
    setCreating(true)
    try {
      const r = await createMeetingReport(storeId)
      if ('error' in r) { toast.error(r.error); return }
      router.push(`/manager/meeting-report/${r.id}`)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除這份會議報告？此動作無法復原。')) return
    setDeletingId(id)
    try {
      const r = await deleteMeetingReport(id)
      if ('error' in r) { toast.error(r.error); return }
      toast.success('已刪除')
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-full pb-24 lg:pb-8" style={{ background: '#fafafa' }}>

      {/* Header */}
      <div className="bg-white px-5 py-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
        <Link href="/manager/analytics" className="text-xs inline-flex items-center gap-1 mb-2" style={{ color: '#71717a' }}>
          ← 返回營運洞察
        </Link>
        <h1 className="text-2xl font-extrabold flex items-center gap-2" style={{ color: '#18181b', letterSpacing: '-0.02em' }}>
          📋 雙週會議報告
        </h1>
        <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>{storeName} · 系統幫你整理數字，你只需填寫文字與上傳照片</p>
      </div>

      <div className="px-4 py-5 max-w-3xl mx-auto space-y-4">

        {/* 留存說明 */}
        <div className="rounded-2xl px-4 py-3 text-xs flex items-start gap-2"
          style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', color: '#0369A1' }}>
          <span className="text-base shrink-0">💾</span>
          <p>
            <strong>所有會議報告永久保存於系統內。</strong>
            未來想找回過去任何一份報告 → 進此頁，用下方篩選條件搜尋。
          </p>
        </div>

        {/* 會議排程設定卡 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center"
                style={{ background: '#FEF3C7', color: '#B45309' }}>
                <Calendar className="h-[18px] w-[18px]" />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: '#18181b' }}>會議排程</p>
                {nextMeetingInfo ? (
                  <p className="text-xs mt-0.5" style={{ color: '#71717a' }}>
                    下次會議：{nextMeetingInfo.date.replace(/-/g, '/')}（{nextMeetingInfo.dow}）·
                    {nextMeetingInfo.daysUntil === 0 ? ' 今天' : nextMeetingInfo.daysUntil < 0 ? ` 已過 ${Math.abs(nextMeetingInfo.daysUntil)} 天` : ` ${nextMeetingInfo.daysUntil} 天後`}
                    · 每 {freqDays} 天
                  </p>
                ) : (
                  <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>尚未設定會議排程</p>
                )}
              </div>
            </div>
            <button onClick={() => setShowSchedule(v => !v)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1"
              style={{ background: showSchedule ? '#FEF3C7' : '#F4F4F5', color: showSchedule ? '#B45309' : '#52525b', border: 'none', cursor: 'pointer' }}>
              <SettingsIcon className="h-3 w-3" />
              {showSchedule ? '收合' : '設定'}
            </button>
          </div>
          {showSchedule && (
            <div className="mt-3 pt-3 grid grid-cols-1 md:grid-cols-3 gap-3" style={{ borderTop: '1px solid #f4f4f5' }}>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>基準會議日</label>
                <input type="date" value={anchorDate} onChange={e => setAnchorDate(e.target.value)}
                  className="w-full rounded-xl text-sm outline-none"
                  style={{ height: 40, padding: '0 12px', border: '1.5px solid #e4e4e7', background: 'white', fontFamily: 'inherit' }} />
                <p className="text-[10px] mt-1" style={{ color: '#a1a1aa' }}>任挑一次會議日，系統往後推算</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>會議頻率</label>
                <select value={freqDays} onChange={e => setFreqDays(parseInt(e.target.value))}
                  className="w-full rounded-xl text-sm outline-none"
                  style={{ height: 40, padding: '0 12px', border: '1.5px solid #e4e4e7', background: 'white', fontFamily: 'inherit' }}>
                  <option value={7}>每週</option>
                  <option value={14}>每兩週（雙週）</option>
                  <option value={21}>每三週</option>
                  <option value={30}>每月</option>
                </select>
                <p className="text-[10px] mt-1" style={{ color: '#a1a1aa' }}>每間店可不同</p>
              </div>
              <div className="flex items-end gap-2">
                <button onClick={saveSchedule} disabled={savingSchedule}
                  className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: savingSchedule ? 'not-allowed' : 'pointer', opacity: savingSchedule ? 0.6 : 1 }}>
                  {savingSchedule ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  儲存
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 新增按鈕 */}
        <button onClick={handleCreate} disabled={creating}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1, boxShadow: '0 4px 12px rgba(245,158,11,0.25)' }}>
          {creating ? <><Loader2 className="h-4 w-4 animate-spin" />建立中…</> : <><Plus className="h-4 w-4" />建立本次會議報告</>}
        </button>

        {/* 篩選列 */}
        {reports.length > 0 && (
          <div className="bg-white rounded-2xl p-3 flex gap-2 items-center flex-wrap" style={{ border: '1px solid #f4f4f5' }}>
            <span className="text-xs font-medium" style={{ color: '#71717a' }}>篩選</span>
            <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{ border: '1.5px solid #e4e4e7', background: 'white', fontFamily: 'inherit' }}>
              <option value="all">全部年份</option>
              {years.map(y => <option key={y} value={y}>{y} 年</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{ border: '1.5px solid #e4e4e7', background: 'white', fontFamily: 'inherit' }}>
              <option value="all">全部狀態</option>
              <option value="submitted">已提交</option>
              <option value="draft">草稿</option>
            </select>
            <span className="text-xs ml-auto" style={{ color: '#a1a1aa' }}>共 {filtered.length} 份</span>
          </div>
        )}

        {/* 列表 */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-16 rounded-2xl bg-white" style={{ border: '1px solid #f4f4f5' }}>
              <FileText className="h-10 w-10 mx-auto mb-3" style={{ color: '#d4d4d8' }} />
              <p className="text-sm font-bold" style={{ color: '#52525b' }}>
                {reports.length === 0 ? '還沒有任何會議報告' : '沒有符合條件的報告'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>
                {reports.length === 0 ? '點上方按鈕建立第一份' : '試試其他篩選條件'}
              </p>
            </div>
          ) : (
            filtered.map(r => {
              const isDraft = r.status === 'draft'
              return (
                <div key={r.id}
                  className="bg-white rounded-2xl overflow-hidden hover:shadow-md transition-shadow"
                  style={{ border: '1px solid #f4f4f5' }}>
                  <Link href={`/manager/meeting-report/${r.id}`} className="flex items-center gap-3 p-4">
                    <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: isDraft ? '#FEF3C7' : '#D1FAE5', color: isDraft ? '#B45309' : '#047857' }}>
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold" style={{ color: '#18181b' }}>
                          {r.period_start.replace(/-/g, '/')} ~ {r.period_end.replace(/-/g, '/')}
                        </p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: isDraft ? '#FEF3C7' : '#D1FAE5', color: isDraft ? '#B45309' : '#047857' }}>
                          {isDraft ? '草稿' : '已提交'}
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>
                        最後更新：{new Date(r.updated_at).toLocaleString('zh-TW')}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: '#d4d4d8' }} />
                  </Link>
                  <div className="px-4 pb-3 flex gap-2">
                    <button onClick={() => handleDelete(r.id)}
                      disabled={deletingId === r.id}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1"
                      style={{ background: '#FEF2F2', color: '#B91C1C', border: 'none', cursor: 'pointer' }}>
                      {deletingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      刪除
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
