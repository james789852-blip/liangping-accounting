'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Filter, ChevronDown, ChevronUp, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import Link from 'next/link'

interface AuditLog {
  id: string
  eventType: string
  severity: 'info' | 'warn' | 'error'
  storeId: string | null
  storeName: string
  userId: string | null
  userName: string
  closingId: string | null
  description: string
  metadata: Record<string, unknown>
  createdAt: string
}

interface Props {
  logs: AuditLog[]
  stores: { id: string; name: string; type?: string }[]
  eventTypes: string[]
  currentStore: string
  currentEvent: string
  currentSeverity: string
  currentFrom: string
  currentTo: string
}

const EVENT_LABELS: Record<string, string> = {
  closing_submit: '帳目送出',
  closing_verify: '帳目審核',
  closing_dispute: '帳目退回',
  closing_edit: '帳目編輯',
  closing_delete: '帳目刪除',
  receipt_create: '新增收據',
  receipt_update: '修改收據',
  receipt_delete: '刪除收據',
  ck_record_update: '央廚記錄修改',
  ck_hq_paid: '央廚補款',
  sheets_sync_failed: '試算表同步失敗',
  variance_alert: '誤差警報',
  ck_price_update: '央廚單價變更',
  store_update: '店家資料修改',
}

const EVENT_COLORS: Record<string, string> = {
  closing_submit: '#0ea5e9',
  closing_verify: '#10b981',
  closing_dispute: '#f59e0b',
  closing_edit: '#8b5cf6',
  closing_delete: '#ef4444',
  receipt_create: '#0ea5e9',
  receipt_update: '#8b5cf6',
  receipt_delete: '#ef4444',
  ck_record_update: '#8b5cf6',
  ck_hq_paid: '#10b981',
  sheets_sync_failed: '#f59e0b',
  variance_alert: '#ef4444',
  ck_price_update: '#8b5cf6',
  store_update: '#8b5cf6',
}

function formatTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' })
  const time = d.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return { date, time }
}

export default function AuditClient({
  logs, stores, eventTypes, currentStore, currentEvent, currentSeverity, currentFrom, currentTo,
}: Props) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  function applyFilter(updates: Partial<{ store: string; event: string; severity: string; from: string; to: string }>) {
    const params = new URLSearchParams()
    const next = {
      store: updates.store ?? currentStore,
      event: updates.event ?? currentEvent,
      severity: updates.severity ?? currentSeverity,
      from: updates.from ?? currentFrom,
      to: updates.to ?? currentTo,
    }
    if (next.store) params.set('store', next.store)
    if (next.event) params.set('event', next.event)
    if (next.severity) params.set('severity', next.severity)
    if (next.from) params.set('from', next.from)
    if (next.to) params.set('to', next.to)
    const qs = params.toString()
    router.push(qs ? `/hq/audit?${qs}` : '/hq/audit')
  }

  function clearFilters() {
    router.push('/hq/audit')
  }

  const hasActiveFilters = currentStore || currentEvent || currentSeverity || currentFrom || currentTo

  return (
    <div className="max-w-5xl mx-auto px-4 py-5 pb-28 space-y-4">
      {/* 篩選工具列 */}
      <div className="bg-white rounded-2xl px-4 py-3" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <button onClick={() => setFilterOpen(v => !v)}
          className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" style={{ color: hasActiveFilters ? '#F59E0B' : '#a1a1aa' }} />
            <span className="text-sm font-semibold" style={{ color: '#18181b' }}>篩選</span>
            {hasActiveFilters && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#FFFBEB', color: '#92400E' }}>
                已套用
              </span>
            )}
          </div>
          {filterOpen ? <ChevronUp className="h-4 w-4" style={{ color: '#a1a1aa' }} /> : <ChevronDown className="h-4 w-4" style={{ color: '#a1a1aa' }} />}
        </button>
        {filterOpen && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
            <select value={currentStore} onChange={e => applyFilter({ store: e.target.value })}
              className="text-sm px-3 py-2 rounded-xl outline-none border" style={{ border: '1.5px solid #e4e4e7', background: 'white', color: '#18181b', fontFamily: 'inherit' }}>
              <option value="">所有店家</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}{s.type === '央廚' ? '（央廚）' : ''}</option>)}
            </select>
            <select value={currentEvent} onChange={e => applyFilter({ event: e.target.value })}
              className="text-sm px-3 py-2 rounded-xl outline-none border" style={{ border: '1.5px solid #e4e4e7', background: 'white', color: '#18181b', fontFamily: 'inherit' }}>
              <option value="">所有事件</option>
              {eventTypes.map(t => <option key={t} value={t}>{EVENT_LABELS[t] ?? t}</option>)}
            </select>
            <select value={currentSeverity} onChange={e => applyFilter({ severity: e.target.value })}
              className="text-sm px-3 py-2 rounded-xl outline-none border" style={{ border: '1.5px solid #e4e4e7', background: 'white', color: '#18181b', fontFamily: 'inherit' }}>
              <option value="">所有等級</option>
              <option value="info">一般 info</option>
              <option value="warn">警告 warn</option>
              <option value="error">錯誤 error</option>
            </select>
            <label className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl border" style={{ border: '1.5px solid #e4e4e7', background: 'white', fontFamily: 'inherit' }}>
              <span style={{ color: currentFrom ? '#18181b' : '#a1a1aa', flexShrink: 0, minWidth: 56 }}>{currentFrom ? '從' : '從 (起)'}</span>
              <input type="date" value={currentFrom} onChange={e => applyFilter({ from: e.target.value })}
                style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, color: '#18181b', fontFamily: 'inherit', fontSize: 14, minWidth: 0 }} />
              {currentFrom && (
                <button type="button" onClick={() => applyFilter({ from: '' })}
                  style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1 }}>✕</button>
              )}
            </label>
            <label className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl border" style={{ border: '1.5px solid #e4e4e7', background: 'white', fontFamily: 'inherit' }}>
              <span style={{ color: currentTo ? '#18181b' : '#a1a1aa', flexShrink: 0, minWidth: 56 }}>{currentTo ? '到' : '到 (迄)'}</span>
              <input type="date" value={currentTo} onChange={e => applyFilter({ to: e.target.value })}
                style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, color: '#18181b', fontFamily: 'inherit', fontSize: 14, minWidth: 0 }} />
              {currentTo && (
                <button type="button" onClick={() => applyFilter({ to: '' })}
                  style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1 }}>✕</button>
              )}
            </label>
          </div>
        )}
        {hasActiveFilters && filterOpen && (
          <div className="mt-2 flex justify-end">
            <button onClick={clearFilters} className="text-xs font-medium" style={{ color: '#F59E0B' }}>清除所有篩選</button>
          </div>
        )}
      </div>

      {/* 紀錄列表 */}
      {logs.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px solid #f4f4f5' }}>
          <p className="text-sm" style={{ color: '#a1a1aa' }}>沒有符合條件的紀錄</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          {logs.map(log => {
            const { date, time } = formatTime(log.createdAt)
            const expanded = expandedId === log.id
            const eventLabel = EVENT_LABELS[log.eventType] ?? log.eventType
            const eventColor = EVENT_COLORS[log.eventType] ?? '#71717a'
            const SeverityIcon = log.severity === 'error' ? AlertCircle : log.severity === 'warn' ? AlertTriangle : Info
            const severityColor = log.severity === 'error' ? '#ef4444' : log.severity === 'warn' ? '#f59e0b' : '#71717a'
            return (
              <div key={log.id} style={{ borderBottom: '1px solid #f4f4f5' }}>
                <button onClick={() => setExpandedId(expanded ? null : log.id)}
                  className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 transition-colors">
                  {/* Time */}
                  <div className="shrink-0 text-right" style={{ minWidth: '4.5rem' }}>
                    <p className="text-xs font-semibold tabular-nums" style={{ color: '#18181b' }}>{date}</p>
                    <p className="text-[10px] tabular-nums" style={{ color: '#a1a1aa' }}>{time}</p>
                  </div>
                  {/* Severity icon */}
                  <SeverityIcon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: severityColor }} />
                  {/* Main */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: eventColor + '15', color: eventColor }}>
                        {eventLabel}
                      </span>
                      <span className="text-[11px]" style={{ color: '#71717a' }}>{log.storeName}</span>
                      <span className="text-[11px] font-medium" style={{ color: '#a1a1aa' }}>·</span>
                      <span className="text-[11px] font-semibold" style={{ color: '#52525b' }}>{log.userName}</span>
                    </div>
                    <p className="text-sm" style={{ color: '#18181b' }}>{log.description}</p>
                  </div>
                  {/* Chevron */}
                  {expanded ? <ChevronUp className="h-3.5 w-3.5 mt-1 shrink-0" style={{ color: '#a1a1aa' }} />
                    : <ChevronDown className="h-3.5 w-3.5 mt-1 shrink-0" style={{ color: '#a1a1aa' }} />}
                </button>
                {expanded && (
                  <div className="px-4 pb-3" style={{ background: '#fafafa' }}>
                    <div className="rounded-xl p-3 space-y-1" style={{ background: 'white', border: '1px solid #f4f4f5' }}>
                      <Row label="事件 ID" value={<code className="text-xs">{log.id}</code>} />
                      <Row label="事件類型" value={log.eventType} />
                      <Row label="等級" value={log.severity} />
                      <Row label="時間" value={new Date(log.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} />
                      <Row label="店家" value={log.storeName} />
                      <Row label="使用者" value={log.userName} />
                      {log.closingId && (
                        <Row label="關聯帳目" value={
                          <Link href={`/manager/history/${log.closingId}`} className="text-blue-600 underline text-xs">
                            查看帳目 → {log.closingId.slice(0, 8)}
                          </Link>
                        } />
                      )}
                      {Object.keys(log.metadata).length > 0 && (
                        <Row label="附加資訊" value={
                          <pre className="text-[11px] overflow-x-auto p-2 rounded bg-slate-50 font-mono">{JSON.stringify(log.metadata, null, 2)}</pre>
                        } />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-center" style={{ color: '#a1a1aa' }}>
        顯示最近 {logs.length} 筆紀錄（最多 500 筆）。需更舊紀錄請使用「日期」篩選。
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <span className="shrink-0 font-semibold" style={{ color: '#a1a1aa', minWidth: '4.5rem' }}>{label}</span>
      <div className="flex-1 min-w-0" style={{ color: '#18181b' }}>{value}</div>
    </div>
  )
}
