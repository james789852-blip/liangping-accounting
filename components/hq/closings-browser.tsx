'use client'

import { useState, useTransition, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Camera, Package, Video, FileText, Search, CheckCircle, RotateCcw, Trash2, Loader2, BarChart2 as BarChart, Banknote, Wallet, ArrowLeftRight, Download, Sheet } from 'lucide-react'
import { toast } from 'sonner'
import { verifyClosing, disputeClosing, deleteClosing, reSyncMonthToSheets } from '@/app/actions/closings'

interface Store { id: string; name: string; type?: string }
interface RemittanceAdjustment {
  id: string; type: string; label: string; amount: number; person?: string
}
interface Closing {
  id: string; business_date: string; status: string; note?: string; dispute_note?: string
  submitted_by?: string
  total_revenue: number; total_cost: number; total_expenses: number
  expected_remit: number; variance: number
  actual_remit?: number; should_include_delivery?: number
  remittance_adjustments?: RemittanceAdjustment[]
  ck_delivery_photo_url?: string; channel_photo_urls?: Record<string, string>
  envelope_photo_url?: string; void_invoice_photo_urls?: string[]; note_photo_url?: string
  extra_photo_urls?: { url: string; label: string }[]
  stores: { id: string; name: string }
  revenue_items: { channel: string; account_name?: string; gross_amount: number }[]
  order_items: { item_name: string; quantity: number; unit_price: number; total_amount: number }[]
  handwrite_orders?: { order_number: string; amount: number; voided: boolean; void_reason?: string }[]
  expense_items?: { description: string; amount: number }[]
}
interface ReceiptRow {
  id: string; vendor_name: string; receipt_type?: string; total_amount: number
  photo_url?: string; receipt_items?: { item_name: string; quantity: number; unit: string; unit_price: number; amount: number }[]
}
interface VideoRow { closing_id: string; signed_url: string; file_name: string }

interface Props {
  closings: Closing[]
  receiptsByClosing: Record<string, ReceiptRow[]>
  videosByClosing: Record<string, VideoRow>
  stores: Store[]
  currentDate: string
  currentMonth: string
  todayStr: string
  storeId: string
  canReview: boolean
  submitterNames: Record<string, string>
}

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  draft:     { label: '草稿',   bg: '#f4f4f5', color: '#71717a' },
  submitted: { label: '待審核', bg: '#FFFBEB', color: '#92400E' },
  verified:  { label: '已審核', bg: '#d1fae5', color: '#047857' },
  disputed:  { label: '退回',   bg: '#ffe4e6', color: '#be123c' },
}

const CHANNEL_LABEL: Record<string, string> = { pos: 'iChef POS', panda: '熊貓', twpay: '台灣Pay', online: '線上點餐', online_cash: '線上點餐（現金）' }
function channelName(key: string) {
  if (key.startsWith('uber_')) return `Uber ${key.slice(5)}`
  return CHANNEL_LABEL[key] ?? key
}

function Lightbox({ photos, index, onClose, onPrev, onNext }: {
  photos: { url: string; label: string }[]
  index: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  const photo = photos[index]
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (touchStartX.current === null) return
        const diff = e.changedTouches[0].clientX - touchStartX.current
        if (diff > 50) onPrev()
        else if (diff < -50) onNext()
        touchStartX.current = null
      }}>
      {/* 關閉 */}
      <button className="absolute top-4 right-4 z-10 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.15)' }} onClick={onClose}>
        <X className="h-6 w-6 text-white" />
      </button>

      {/* 計數 */}
      {photos.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ background: 'rgba(0,0,0,0.45)' }}>
          {index + 1} / {photos.length}
        </div>
      )}

      {/* 左箭頭 */}
      {hasPrev && (
        <button className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-opacity hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.18)' }}
          onClick={e => { e.stopPropagation(); onPrev() }}>
          <ChevronLeft className="h-7 w-7 text-white" />
        </button>
      )}

      {/* 右箭頭 */}
      {hasNext && (
        <button className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-opacity hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.18)' }}
          onClick={e => { e.stopPropagation(); onNext() }}>
          <ChevronRight className="h-7 w-7 text-white" />
        </button>
      )}

      {/* 照片 */}
      <img src={photo.url} alt={photo.label}
        className="max-w-[88vw] max-h-[88vh] object-contain rounded-xl"
        onClick={e => e.stopPropagation()} />

      {/* 標籤 */}
      {photo.label && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs text-white font-medium"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          {photo.label}
        </div>
      )}
    </div>
  )
}

function PhotoThumb({ url, label, onClick }: { url: string; label?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label}
      className="relative rounded-xl overflow-hidden shrink-0 group"
      style={{ width: 72, height: 72, border: '1px solid #e4e4e7', background: '#f8fafc' }}>
      <img src={url} alt={label} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
      {label && (
        <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[10px] text-white font-medium truncate"
          style={{ background: 'rgba(0,0,0,0.5)' }}>{label}</div>
      )}
    </button>
  )
}

function SectionLabel({ icon, color, title }: { icon: React.ReactNode; color: string; title: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span style={{ color }}>{icon}</span>
      <p className="text-xs font-semibold" style={{ color: '#52525b' }}>{title}</p>
    </div>
  )
}

function ReviewPanel({ closingId, status, canReview }: { closingId: string; status: string; canReview: boolean }) {
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'idle' | 'dispute' | 'delete'>('idle')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()

  if (!canReview || done || status === 'draft') return null

  async function handleVerify() {
    setLoading(true)
    const r = await verifyClosing(closingId)
    if (r.error) toast.error(r.error)
    else { toast.success('已核准'); setDone(true); router.refresh() }
    setLoading(false)
  }
  async function handleDispute() {
    if (!note.trim()) { toast.error('請填寫退回原因'); return }
    setLoading(true)
    const r = await disputeClosing(closingId, note)
    if (r.error) toast.error(r.error)
    else { toast.success('已退回'); setDone(true); router.refresh() }
    setLoading(false)
  }
  async function handleDelete() {
    setLoading(true)
    const r = await deleteClosing(closingId)
    if (r.error) toast.error(r.error)
    else { toast.success('已刪除'); setDone(true); router.refresh() }
    setLoading(false)
  }

  if (mode === 'dispute') return (
    <div className="space-y-2 p-3 rounded-xl" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold" style={{ color: '#c2410c' }}>填寫退回原因</p>
        <button onClick={() => { setMode('idle'); setNote('') }}><X className="h-3.5 w-3.5" style={{ color: '#a1a1aa' }} /></button>
      </div>
      <textarea placeholder="請說明異常原因..." value={note} onChange={e => setNote(e.target.value)}
        style={{ width: '100%', fontSize: '13px', border: '1.5px solid #fed7aa', borderRadius: '8px', padding: '8px 10px', height: '64px', resize: 'none', outline: 'none', fontFamily: 'inherit', background: 'white' }} />
      <div className="flex gap-2">
        <button disabled={loading || !note.trim()} onClick={handleDispute}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
          style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', opacity: loading || !note.trim() ? 0.5 : 1 }}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}確認退回
        </button>
        <button onClick={() => { setMode('idle'); setNote('') }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>取消</button>
      </div>
    </div>
  )

  if (mode === 'delete') return (
    <div className="space-y-2 p-3 rounded-xl" style={{ background: '#fff8f8', border: '1px solid #fda4af' }}>
      <p className="text-xs font-semibold" style={{ color: '#be123c' }}>確認刪除此帳目？刪除後無法復原。</p>
      <div className="flex gap-2">
        <button disabled={loading} onClick={handleDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
          style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', opacity: loading ? 0.5 : 1 }}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}確認刪除
        </button>
        <button onClick={() => setMode('idle')}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>取消</button>
      </div>
    </div>
  )

  return (
    <div className="flex gap-2 flex-wrap">
      {status === 'submitted' && (
        <button disabled={loading} onClick={handleVerify}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
          style={{ background: 'linear-gradient(135deg,#10b981,#059669)', opacity: loading ? 0.5 : 1 }}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}核准
        </button>
      )}
      <button disabled={loading} onClick={() => setMode('dispute')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
        <RotateCcw className="h-3.5 w-3.5" />{status === 'verified' ? '重新退回' : '退回修改'}
      </button>
      <button disabled={loading} onClick={() => setMode('delete')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: '#fff8f8', color: '#be123c', border: '1px solid #fecdd3' }}>
        <Trash2 className="h-3.5 w-3.5" />刪除
      </button>
    </div>
  )
}

function ClosingCard({
  closing, receipts, video, canReview, submitterName,
}: {
  closing: Closing; receipts: ReceiptRow[]; video?: VideoRow; canReview: boolean; submitterName?: string
}) {
  const [expanded, setExpanded] = useState(closing.status === 'submitted' || closing.status === 'disputed')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const st = STATUS[closing.status] ?? STATUS.draft
  const [, mo, d] = closing.business_date.split('-')

  async function handleSync(e: React.MouseEvent) {
    e.stopPropagation()
    const month = closing.business_date.slice(0, 7)
    setSyncing(true)
    try {
      const result = await reSyncMonthToSheets(closing.stores.id, month)
      if (result.error) toast.error(`同步失敗：${result.error}`)
      else toast.success(`已同步 ${closing.stores.name} ${month} 到 Google Sheets`)
    } catch { toast.error('同步失敗') }
    finally { setSyncing(false) }
  }

  async function handleExport(e: React.MouseEvent) {
    e.stopPropagation()
    const month = closing.business_date.slice(0, 7)
    setExporting(true)
    try {
      const res = await fetch(`/api/export/food-cost?storeId=${closing.stores.id}&month=${month}`)
      if (!res.ok) { toast.error('匯出失敗'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const cd = res.headers.get('content-disposition') ?? ''
      const match = cd.match(/filename\*=UTF-8''(.+)$/)
      a.download = match ? decodeURIComponent(match[1]) : `${closing.stores.name}_${month}_食耗成本.xlsx`
      a.href = url; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('匯出失敗') }
    finally { setExporting(false) }
  }

  const channelPhotos = closing.channel_photo_urls ?? {}
  const ckPhoto = closing.ck_delivery_photo_url
  const receiptPhotos = receipts.filter(r => r.photo_url)
  const envelopePhoto = closing.envelope_photo_url
  const voidInvoicePhotos = closing.void_invoice_photo_urls ?? []
  const notePhoto = closing.note_photo_url
  const extraPhotos = Array.isArray(closing.extra_photo_urls) ? closing.extra_photo_urls : []

  // allPhotos: receipt photos first, then CK + channel (for lightbox continuity)
  const allPhotos: { url: string; label: string }[] = [
    ...receiptPhotos.map(r => ({ url: r.photo_url!, label: r.vendor_name || '收據' })),
    ...(ckPhoto ? [{ url: ckPhoto, label: '央廚配送單' }] : []),
    ...Object.entries(channelPhotos).map(([k, url]) => ({ url: url as string, label: channelName(k) })),
    ...(envelopePhoto ? [{ url: envelopePhoto, label: '信封袋' }] : []),
    ...voidInvoicePhotos.map((url, i) => ({ url, label: `作廢發票 ${i + 1}` })),
    ...(notePhoto ? [{ url: notePhoto, label: '備註照片' }] : []),
    ...extraPhotos.map(p => ({ url: p.url, label: p.label || '更多照片' })),
  ]
  // non-receipt photos (CK + channels + 信封袋/作廢/備註), 顯示在「其他照片」區塊
  const otherPhotos: { url: string; label: string }[] = [
    ...(ckPhoto ? [{ url: ckPhoto, label: '央廚配送單' }] : []),
    ...Object.entries(channelPhotos).map(([k, url]) => ({ url: url as string, label: channelName(k) })),
    ...(envelopePhoto ? [{ url: envelopePhoto, label: '信封袋' }] : []),
    ...voidInvoicePhotos.map((url, i) => ({ url, label: `作廢發票${voidInvoicePhotos.length > 1 ? ` ${i + 1}` : ''}` })),
    ...(notePhoto ? [{ url: notePhoto, label: '備註照片' }] : []),
  ]

  const platformTotal = closing.revenue_items
    .filter(r => ['uber', 'panda', 'twpay', 'online', 'online_cash'].some(k => r.channel === k || r.channel.startsWith('uber_')))
    .reduce((s, r) => s + r.gross_amount, 0)

  const ckItems = (closing.order_items ?? []).filter(o => o.item_name !== '央廚配送')

  return (
    <>
    {lightboxIndex !== null && allPhotos.length > 0 && (
      <Lightbox
        photos={allPhotos}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onPrev={() => setLightboxIndex(i => (i !== null && i > 0 ? i - 1 : i))}
        onNext={() => setLightboxIndex(i => (i !== null && i < allPhotos.length - 1 ? i + 1 : i))}
      />
    )}
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `2px solid ${closing.status === 'submitted' ? '#FDE68A' : closing.status === 'disputed' ? '#fecdd3' : '#f4f4f5'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      {/* 標頭 */}
      <div className="flex items-center gap-2 px-4 py-4">
        <button className="flex-1 flex items-center gap-3 text-left min-w-0" onClick={() => setExpanded(!expanded)}>
          <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', fontSize: (closing.stores?.name?.length ?? 0) > 2 ? '10px' : '13px' }}>
            {closing.stores?.name ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: '#18181b' }}>{closing.stores?.name}</p>
            <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>
              {parseInt(mo)}/{parseInt(d)}
              {closing.total_revenue > 0 && <span className="ml-2 tabular-nums font-semibold" style={{ color: '#18181b' }}>${fmt(closing.total_revenue)}</span>}
              {submitterName && <span className="ml-2 font-medium" style={{ color: '#F59E0B' }}>由 {submitterName} 提交</span>}
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0" style={{ background: st.bg, color: st.color }}>{st.label}</span>
          {expanded ? <ChevronUp className="h-4 w-4 shrink-0" style={{ color: '#a1a1aa' }} /> : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: '#a1a1aa' }} />}
        </button>
        <button onClick={handleSync} disabled={syncing}
          className="shrink-0 flex items-center justify-center h-8 w-8 rounded-xl transition-opacity"
          style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: syncing ? '#a1a1aa' : '#15803d', cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.6 : 1 }}
          title={`同步到 Google Sheets`}>
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sheet className="h-3.5 w-3.5" />}
        </button>
        <button onClick={handleExport} disabled={exporting}
          className="shrink-0 flex items-center justify-center h-8 w-8 rounded-xl transition-opacity"
          style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: exporting ? '#a1a1aa' : '#92400E', cursor: exporting ? 'wait' : 'pointer', opacity: exporting ? 0.6 : 1 }}
          title={`匯出 ${closing.stores?.name} Excel`}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-5 space-y-4" style={{ borderTop: '1px solid #f4f4f5' }}>

          {/* 退回原因 */}
          {closing.dispute_note && (
            <div className="mt-4 px-3 py-2 rounded-xl text-xs" style={{ background: '#ffe4e6', color: '#be123c', border: '1px solid #fecdd3' }}>
              退回原因：{closing.dispute_note}
            </div>
          )}

          {/* ── 1. 各渠道收入 ─────────────────────────────── */}
          {closing.revenue_items.length > 0 && (
            <div className="pt-3">
              <SectionLabel icon={<BarChart className="h-3.5 w-3.5" />} color="#F59E0B" title="各渠道收入" />
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                {closing.revenue_items.map((r, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 text-xs"
                    style={{ borderBottom: idx !== closing.revenue_items.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                    <span style={{ color: '#52525b' }}>
                      {channelName(r.channel)}{r.account_name ? `（${r.account_name}）` : ''}
                    </span>
                    <span className="tabular-nums font-semibold" style={{ color: '#18181b' }}>${fmt(r.gross_amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2 text-xs font-bold"
                  style={{ background: '#f8fafc', borderTop: '1px solid #e4e4e7' }}>
                  <span style={{ color: '#18181b' }}>總收入</span>
                  <span className="tabular-nums" style={{ color: '#92400E' }}>${fmt(closing.total_revenue)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── 2. 結算摘要 ──────────────────────────────── */}
          <div>
            <SectionLabel icon={<Banknote className="h-3.5 w-3.5" />} color="#10b981" title="結算摘要" />
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
              {[
                { label: '總收入', val: closing.total_revenue, color: '#18181b' },
                ...(platformTotal > 0 ? [{ label: '　− 平台收款', val: -platformTotal, color: '#71717a' }] : []),
                ...(closing.total_expenses > 0 ? [{ label: '　− 現金支出', val: -closing.total_expenses, color: '#71717a' }] : []),
                { label: '應包進信封', val: closing.should_include_delivery ?? closing.expected_remit, color: '#F59E0B', bold: true },
                ...(closing.total_cost > 0 ? [{ label: '　− 央廚費', val: -closing.total_cost, color: '#f97316' }] : []),
                { label: '應匯總公司', val: closing.expected_remit, color: '#047857', bold: true },
                { label: '實際包進信封', val: closing.actual_remit ?? closing.expected_remit, color: '#18181b', bold: true },
              ].map(({ label, val, color, bold }, idx, arr) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2 text-xs"
                  style={{ borderBottom: idx !== arr.length - 1 ? '1px solid #f4f4f5' : 'none', background: (bold && (label === '應包進信封' || label === '應匯總公司')) ? '#f8fafc' : 'white' }}>
                  <span style={{ color: '#52525b', fontWeight: bold ? 700 : 400 }}>{label}</span>
                  <span className="tabular-nums" style={{ color, fontWeight: bold ? 700 : 500 }}>
                    {val < 0 ? `−$${fmt(-val)}` : `$${fmt(val)}`}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 text-xs font-bold"
                style={{ background: Math.abs(closing.variance) > 200 ? '#fff8f8' : '#f0fdf4', borderTop: '1px solid #e4e4e7' }}>
                <span style={{ color: '#52525b' }}>誤差</span>
                <span className="tabular-nums" style={{ color: Math.abs(closing.variance) > 200 ? '#be123c' : '#047857' }}>
                  {closing.variance >= 0 ? '+' : ''}{fmt(closing.variance)}
                </span>
              </div>
            </div>
          </div>

          {/* ── 3. 央廚配送 ──────────────────────────────── */}
          {ckItems.length > 0 && (
            <div>
              <SectionLabel icon={<Package className="h-3.5 w-3.5" />} color="#f97316"
                title={`央廚配送（$${fmt(closing.total_cost)}）`} />
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                {ckItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 text-xs"
                    style={{ borderBottom: idx !== ckItems.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                    <span style={{ color: '#52525b' }}>{item.item_name}</span>
                    <span className="tabular-nums font-medium" style={{ color: '#18181b' }}>
                      {item.quantity} × ${fmt(item.unit_price)} = ${fmt(item.total_amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 5. 現金支出 ──────────────────────────────── */}
          {(closing.expense_items ?? []).length > 0 && (
            <div>
              <SectionLabel icon={<Wallet className="h-3.5 w-3.5" />} color="#ef4444"
                title={`現金支出（$${fmt(closing.total_expenses)}）`} />
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                {(closing.expense_items ?? []).map((e, idx, arr) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 text-xs"
                    style={{ borderBottom: idx !== arr.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                    <span style={{ color: '#52525b' }}>{e.description || '支出'}</span>
                    <span className="tabular-nums font-semibold" style={{ color: '#be123c' }}>${fmt(e.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 6. 匯款調整 ──────────────────────────────── */}
          {(closing.remittance_adjustments ?? []).length > 0 && (
            <div>
              <SectionLabel icon={<ArrowLeftRight className="h-3.5 w-3.5" />} color="#F97316" title="匯款調整" />
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                {(closing.remittance_adjustments ?? []).map((adj, idx, arr) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 text-xs"
                    style={{ borderBottom: idx !== arr.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                    <span style={{ color: '#52525b' }}>
                      {adj.label}{adj.person ? `（${adj.person}）` : ''}
                    </span>
                    <span className="tabular-nums font-semibold"
                      style={{ color: adj.amount >= 0 ? '#047857' : '#be123c' }}>
                      {adj.amount >= 0 ? '+' : ''}${fmt(adj.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 7. 當日收據 ──────────────────────────────── */}
          {receipts.length > 0 && (
            <div>
              <SectionLabel icon={<FileText className="h-3.5 w-3.5" />} color="#0ea5e9"
                title={`當日收據（${receipts.length} 筆 · $${fmt(receipts.reduce((s, r) => s + r.total_amount, 0))}）`} />
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                {receipts.map((r, idx) => (
                  <div key={r.id} style={{ borderBottom: idx !== receipts.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      {/* 縮圖 */}
                      {r.photo_url ? (
                        <button
                          onClick={() => {
                            const photoIdx = allPhotos.findIndex(p => p.url === r.photo_url)
                            if (photoIdx >= 0) setLightboxIndex(photoIdx)
                          }}
                          style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: '1px solid #e4e4e7', background: '#f8fafc', padding: 0, cursor: 'zoom-in' }}>
                          <img src={r.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        </button>
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0, border: '1px solid #e4e4e7', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileText style={{ width: 18, height: 18, color: '#d4d4d8' }} />
                        </div>
                      )}
                      {/* 文字 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold" style={{ color: '#18181b' }}>{r.vendor_name || '（未填廠商）'}</span>
                          {r.receipt_type && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#f4f4f5', color: '#71717a' }}>
                              {{ invoice: '發票', receipt: '收據', delivery_note: '估價單' }[r.receipt_type] ?? r.receipt_type}
                            </span>
                          )}
                        </div>
                        {(r.receipt_items ?? []).length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {(r.receipt_items ?? []).map((item, ii) => (
                              <div key={ii} className="flex items-center gap-1.5 text-[11px]" style={{ color: '#71717a' }}>
                                <span style={{ flex: '1 1 0', minWidth: 0, fontWeight: 500, color: '#52525b' }}>{item.item_name}</span>
                                {item.quantity > 0 && (
                                  <span className="tabular-nums" style={{ whiteSpace: 'nowrap' }}>
                                    {item.quantity}{item.unit ? item.unit : ''}
                                    {item.unit_price > 0 ? ` × $${fmt(item.unit_price)}` : ''}
                                  </span>
                                )}
                                <span className="tabular-nums font-semibold shrink-0" style={{ color: '#18181b' }}>${fmt(item.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: '#18181b' }}>${fmt(r.total_amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 8. 平台照片 / 配送單 / 信封袋 / 作廢 / 備註 ──────────────────────────────── */}
          {otherPhotos.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Camera className="h-3.5 w-3.5" style={{ color: '#F59E0B' }} />
                <p className="text-xs font-semibold" style={{ color: '#52525b' }}>
                  其他照片
                  <span className="ml-1.5 font-normal" style={{ color: '#a1a1aa' }}>（配送單 / 平台截圖 / 信封袋 / 作廢 / 備註，點擊可左右切換）</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {otherPhotos.map((p) => (
                  <PhotoThumb key={p.url} url={p.url} label={p.label}
                    onClick={() => {
                      const idx = allPhotos.findIndex(x => x.url === p.url)
                      setLightboxIndex(idx >= 0 ? idx : 0)
                    }} />
                ))}
              </div>
            </div>
          )}

          {/* ── 8b. 店家加上傳的其他照片（零用金 / 預付款項等）— 可收合 ─────────── */}
          {extraPhotos.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-semibold flex items-center gap-1.5"
                style={{ color: '#52525b', listStyle: 'none', padding: '4px 0' }}>
                <Camera className="h-3.5 w-3.5" style={{ color: '#F59E0B' }} />
                店家自上傳照片
                <span className="font-normal" style={{ color: '#a1a1aa' }}>（{extraPhotos.length} 張，點擊展開）</span>
              </summary>
              <div className="flex flex-wrap gap-1.5 mt-2 pl-1">
                {extraPhotos.map(p => (
                  <PhotoThumb key={p.url} url={p.url} label={p.label || '更多'}
                    onClick={() => {
                      const idx = allPhotos.findIndex(x => x.url === p.url)
                      setLightboxIndex(idx >= 0 ? idx : 0)
                    }} />
                ))}
              </div>
            </details>
          )}

          {/* ── 9. 影片 ──────────────────────────────────── */}
          {video && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Video className="h-3.5 w-3.5" style={{ color: '#3b82f6' }} />
                <p className="text-xs font-semibold" style={{ color: '#52525b' }}>手寫菜單影片</p>
              </div>
              <video src={video.signed_url} controls playsInline className="w-full rounded-xl bg-black"
                style={{ maxHeight: '200px' }} />
              <p className="text-[11px] mt-1 truncate" style={{ color: '#a1a1aa' }}>{video.file_name}</p>
            </div>
          )}

          {/* ── 10. 備註 ─────────────────────────────────── */}
          {closing.note && (
            <p className="text-xs px-3 py-2 rounded-xl" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
              備註：{closing.note}
            </p>
          )}

          {/* 審核操作 */}
          <ReviewPanel closingId={closing.id} status={closing.status} canReview={canReview} />
        </div>
      )}
    </div>
    </>
  )
}

export default function ClosingsBrowser({ closings, receiptsByClosing, videosByClosing, stores, currentDate, currentMonth, todayStr, storeId, canReview, submitterNames }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [statusFilter, setStatusFilter] = useState('all')
  const [exporting, setExporting] = useState(false)

  // 判斷目前模式：date（單日）或 month（整月）
  const isDateMode = !!currentDate && !currentMonth
  const isMonthMode = !!currentMonth

  // 年份選項（2024 到今年 + 1）
  const thisYear = parseInt(todayStr.slice(0, 4))
  const years = Array.from({ length: thisYear - 2023 }, (_, i) => 2024 + i)

  // 解析目前選擇（用於 dropdown）
  const refDate = currentDate || (currentMonth ? currentMonth + '-01' : todayStr)
  const [selYear, selMon, selDay] = refDate.split('-').map(Number)

  async function handleExportExcel() {
    if (!storeId) return
    const month = `${selYear}-${String(selMon).padStart(2, '0')}`
    setExporting(true)
    try {
      const res = await fetch(`/api/export/food-cost?storeId=${storeId}&month=${month}`)
      if (!res.ok) { toast.error('匯出失敗'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const cd = res.headers.get('content-disposition') ?? ''
      const match = cd.match(/filename\*=UTF-8''(.+)$/)
      a.download = match ? decodeURIComponent(match[1]) : `食耗成本_${month}.xlsx`
      a.href = url; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('匯出失敗') }
    finally { setExporting(false) }
  }
  // 全月模式下 selDay 為 0（顯示「全月」）
  const dayMode = isDateMode ? selDay : 0

  // 該月有幾天
  const daysInMonth = new Date(selYear, selMon, 0).getDate()

  function navigateDate(date: string, sid: string) {
    const p = new URLSearchParams()
    if (date) p.set('date', date)
    if (sid) p.set('storeId', sid)
    startTransition(() => router.push(`/hq/closings?${p.toString()}`))
  }

  function navigateMonth(month: string, sid: string) {
    const p = new URLSearchParams()
    if (month) p.set('month', month)
    if (sid) p.set('storeId', sid)
    startTransition(() => router.push(`/hq/closings?${p.toString()}`))
  }

  function handleYearChange(newYear: number) {
    const month = `${newYear}-${String(selMon).padStart(2, '0')}`
    if (dayMode > 0) {
      const maxDay = new Date(newYear, selMon, 0).getDate()
      const d = Math.min(dayMode, maxDay)
      navigateDate(`${month}-${String(d).padStart(2, '0')}`, storeId)
    } else {
      navigateMonth(month, storeId)
    }
  }

  function handleMonthChange(newMon: number) {
    const month = `${selYear}-${String(newMon).padStart(2, '0')}`
    if (dayMode > 0) {
      const maxDay = new Date(selYear, newMon, 0).getDate()
      const d = Math.min(dayMode, maxDay)
      navigateDate(`${month}-${String(d).padStart(2, '0')}`, storeId)
    } else {
      navigateMonth(month, storeId)
    }
  }

  function handleDayChange(newDay: number) {
    if (newDay === 0) {
      navigateMonth(`${selYear}-${String(selMon).padStart(2, '0')}`, storeId)
    } else {
      navigateDate(`${selYear}-${String(selMon).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`, storeId)
    }
  }

  const filtered = statusFilter === 'all' ? closings : closings.filter(c => c.status === statusFilter)
  const pendingCount = closings.filter(c => c.status === 'submitted').length

  const rangeLabel = isDateMode
    ? (currentDate === todayStr ? '今天' : currentDate)
    : `${selYear} 年 ${selMon} 月`

  const isToday = isDateMode && currentDate === todayStr

  return (
    <div className="space-y-4">
      {/* 篩選器 */}
      <div className="flex gap-2 flex-wrap items-center">

        {/* 今天按鈕 */}
        <button
          onClick={() => navigateDate(todayStr, storeId)}
          className="px-3 h-10 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: isToday ? 'linear-gradient(135deg,#F59E0B,#F97316)' : 'white',
            color: isToday ? 'white' : '#52525b',
            border: `1.5px solid ${isToday ? 'transparent' : '#e4e4e7'}`,
            boxShadow: isToday ? '0 2px 8px rgba(245,158,11,0.3)' : 'none',
          }}>
          今天
        </button>

        {/* 年份下拉 */}
        <select
          value={selYear}
          onChange={e => handleYearChange(parseInt(e.target.value))}
          style={{ height: '40px', padding: '0 12px', border: '1.5px solid #e4e4e7', borderRadius: '12px', fontSize: '14px', outline: 'none', background: 'white', fontFamily: 'inherit', color: '#18181b' }}>
          {years.map(y => <option key={y} value={y}>{y} 年</option>)}
        </select>

        {/* 月份下拉 */}
        <select
          value={selMon}
          onChange={e => handleMonthChange(parseInt(e.target.value))}
          style={{ height: '40px', padding: '0 10px', border: '1.5px solid #e4e4e7', borderRadius: '12px', fontSize: '14px', outline: 'none', background: 'white', fontFamily: 'inherit', color: '#18181b', minWidth: '80px' }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => (
            <option key={mo} value={mo}>{mo} 月</option>
          ))}
        </select>

        {/* 日期下拉 */}
        <select
          value={dayMode}
          onChange={e => handleDayChange(parseInt(e.target.value))}
          style={{ height: '40px', padding: '0 10px', border: `1.5px solid ${dayMode > 0 ? '#FDE68A' : '#e4e4e7'}`, borderRadius: '12px', fontSize: '14px', outline: 'none', background: dayMode > 0 ? '#FFFBEB' : 'white', fontFamily: 'inherit', color: dayMode > 0 ? '#92400E' : '#18181b', minWidth: '80px' }}>
          <option value={0}>全月</option>
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
            <option key={d} value={d}>{d} 日</option>
          ))}
        </select>

        {/* 店家 */}
        {stores.length > 1 && (
          <select
            defaultValue={storeId}
            onChange={e => isDateMode ? navigateDate(currentDate, e.target.value) : navigateMonth(currentMonth, e.target.value)}
            style={{ height: '40px', padding: '0 12px', border: '1.5px solid #e4e4e7', borderRadius: '12px', fontSize: '14px', outline: 'none', background: 'white', fontFamily: 'inherit', color: '#18181b', minWidth: '110px' }}>
            <option value="">全部店家</option>
            {(['店面', '央廚'] as const).map(type => {
              const group = stores.filter(s => (s.type ?? '店面') === type)
              if (group.length === 0) return null
              return (
                <optgroup key={type} label={`── ${type} ──`}>
                  {group.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </optgroup>
              )
            })}
          </select>
        )}

        {/* 狀態快篩 */}
        {(['all', 'submitted', 'verified', 'disputed'] as const).map(s => {
          const labels: Record<string, string> = { all: `全部 ${closings.length}`, submitted: `待審 ${pendingCount}`, verified: '已審', disputed: '退回' }
          const active = statusFilter === s
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 h-9 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: active ? (s === 'submitted' ? '#FFFBEB' : s === 'verified' ? '#d1fae5' : s === 'disputed' ? '#ffe4e6' : '#18181b') : 'white',
                color: active ? (s === 'submitted' ? '#92400E' : s === 'verified' ? '#047857' : s === 'disputed' ? '#be123c' : 'white') : '#71717a',
                border: `1.5px solid ${active ? 'transparent' : '#e4e4e7'}`,
              }}>
              {labels[s]}
            </button>
          )
        })}

        {/* 匯出 Excel：選定特定店家時顯示 */}
        {storeId && (
          <button onClick={handleExportExcel} disabled={exporting}
            className="ml-auto flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-semibold"
            style={{
              background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: 'white',
              border: 'none', cursor: exporting ? 'wait' : 'pointer',
              opacity: exporting ? 0.7 : 1, boxShadow: '0 2px 8px rgba(245,158,11,0.25)',
            }}>
            <Download className="h-3.5 w-3.5" />
            {exporting ? '匯出中...' : '匯出 Excel'}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl" style={{ border: '1px solid #f4f4f5' }}>
          <Search className="h-10 w-10 mx-auto mb-3" style={{ color: '#d4d4d8' }} />
          <p className="text-sm font-medium" style={{ color: '#52525b' }}>
            {rangeLabel}尚無{statusFilter !== 'all' ? '符合的' : ''}帳目
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <ClosingCard
              key={c.id}
              closing={c}
              receipts={receiptsByClosing[c.id] ?? []}
              video={videosByClosing[c.id]}
              canReview={canReview}
              submitterName={c.submitted_by ? submitterNames[c.submitted_by] : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
