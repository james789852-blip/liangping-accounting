'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Image, FileText, AlertTriangle, Check, CheckCircle2, X, Camera } from 'lucide-react'
import ReviewActions from './review-actions'
import PhotoLightbox from './photo-lightbox'
import SafePhotoImage from './safe-photo-image'
import { getPreReservedExpenseTotal } from '@/lib/pre-reserved-expenses'
import { disputeClosing } from '@/app/actions/closings'
import { toast } from 'sonner'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

interface RevenueItem { channel: string; account_name?: string; gross_amount: number }
interface ExpenseItem { description: string; amount: number }
interface OrderItem { item_name: string; quantity: number; total_amount: number }
interface ReceiptItem { item_name: string; amount: number; unit?: string; quantity?: number; unit_price?: number }
interface Receipt {
  id: string; vendor_name: string; actual_vendor_name?: string; receipt_type: string
  total_amount: number; tax_amount?: number; notes?: string; photo_url: string; receipt_items: ReceiptItem[]
}
interface ReserveItem { reason: string; amount: number }
interface Closing {
  id: string; business_date: string; status: string
  total_revenue: number; variance: number; note: string; dispute_note: string
  submitted_at: string; should_include_delivery: number; actual_remit: number
  total_cost: number; total_expenses: number; stores: { name: string }
  revenue_items: RevenueItem[]; expense_items: ExpenseItem[]; order_items: OrderItem[]
  remittance_adjustments?: any[]; reserve_items?: ReserveItem[]
  cash_counts?: { large_expenses?: unknown }[]
  // 其他照片（總覽用）
  ck_delivery_photo_url?: string | null
  channel_photo_urls?: Record<string, string> | null
  envelope_photo_url?: string | null
  void_invoice_photo_urls?: string[] | null
  note_photo_url?: string | null
  extra_photo_urls?: Array<string | { url?: string | null; label?: string | null }> | null
}
interface Props {
  closing: Closing; receipts: Receipt[]; canReview: boolean; canDispute: boolean
  selected?: boolean; onToggleSelect?: () => void; onProcessed?: () => void; defaultExpanded?: boolean
}

const TYPE_LABEL: Record<string, string> = { invoice: '發票', receipt: '收據', delivery_note: '估價單' }
const CHANNEL_LABEL: Record<string, string> = {
  pos: 'POS 現金', uber: 'Uber Eats', panda: '熊貓',
  twpay: '台灣Pay', online: '線上點餐', online_cash: '線上點餐（現金）', handwrite: '手寫訂單',
}
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  submitted: { bg: '#FFFBEB', color: '#92400E', label: '待審核' },
  disputed:  { bg: '#fff7ed', color: '#c2410c', label: '已退回' },
  verified:  { bg: '#d1fae5', color: '#047857', label: '已核准' },
}

type PhotoInfo = {
  url: string
  label: string
  kind?: 'receipt' | 'ck' | 'channel' | 'envelope' | 'void' | 'note' | 'extra'
  channel?: string
}

function normalizeExtraPhotos(extraPhotoUrls: Closing['extra_photo_urls']): PhotoInfo[] {
  const photos: PhotoInfo[] = []
  for (const [index, photo] of (extraPhotoUrls ?? []).entries()) {
      if (typeof photo === 'string') {
        const url = photo.trim()
        if (url) photos.push({ url, label: `附加照片 ${index + 1}`, kind: 'extra' })
        continue
      }

      if (!photo || typeof photo !== 'object') continue

      const url = (photo.url ?? '').trim()
      if (!url) continue

      photos.push({
        url,
        label: (photo.label ?? '').trim() || `附加照片 ${index + 1}`,
        kind: 'extra',
      })
  }
  return photos
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#a1a1aa' }}>{children}</p>
  )
}

function InfoRow({ label, value, muted, accent }: { label: string; value: string; muted?: boolean; accent?: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: muted ? '#a1a1aa' : '#52525b' }}>{label}</span>
      <span className="tabular-nums font-medium" style={{ color: accent ?? '#18181b' }}>{value}</span>
    </div>
  )
}

export default function ReviewCard({ closing, receipts, canReview, canDispute, selected, onToggleSelect, onProcessed, defaultExpanded }: Props) {
  const shouldAutoExpand = defaultExpanded ?? (closing.variance !== 0 || closing.status === 'disputed')
  const [expanded, setExpanded] = useState(shouldAutoExpand)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [openReceiptIds, setOpenReceiptIds] = useState<Set<string>>(new Set())
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [confirmedPhotos, setConfirmedPhotos] = useState<Set<number>>(new Set())
  const [photoIssues, setPhotoIssues] = useState<Record<number, string>>({})
  const [issueEditorOpen, setIssueEditorOpen] = useState(false)
  const [issueDraft, setIssueDraft] = useState('')
  const [rejectPending, startReject] = useTransition()
  const showCheckbox = canReview && closing.status === 'submitted' && !!onToggleSelect
  const extraPhotos = normalizeExtraPhotos(closing.extra_photo_urls)

  // 統一收集所有照片給 lightbox（收據 + 其他）
  const allPhotos: PhotoInfo[] = [
    ...receipts.filter(r => r.photo_url).map(r => ({ url: r.photo_url, label: `收據：${r.vendor_name}`, kind: 'receipt' as const })),
    ...(closing.ck_delivery_photo_url ? [{ url: closing.ck_delivery_photo_url, label: '央廚配送單', kind: 'ck' as const }] : []),
    ...(closing.channel_photo_urls
      ? Object.entries(closing.channel_photo_urls).filter(([, u]) => u).map(([k, u]) => ({ url: u as string, label: CHANNEL_LABEL[k] ?? k, kind: 'channel' as const, channel: k }))
      : []),
    ...(closing.envelope_photo_url ? [{ url: closing.envelope_photo_url, label: '信封袋', kind: 'envelope' as const }] : []),
    ...(closing.void_invoice_photo_urls ?? []).map((url, i, arr) => ({ url, label: `作廢發票${arr.length > 1 ? ` ${i + 1}` : ''}`, kind: 'void' as const })),
    ...(closing.note_photo_url ? [{ url: closing.note_photo_url, label: '備註照片', kind: 'note' as const }] : []),
    ...extraPhotos,
  ]
  const currentPhoto = allPhotos[reviewIndex]
  const currentReceipt = currentPhoto
    ? receipts.find(r => r.photo_url === currentPhoto.url)
    : undefined
  const currentChannelItems = currentPhoto?.kind === 'channel'
    ? closing.revenue_items.filter(item => item.channel === currentPhoto.channel)
    : []
  const reviewedCount = new Set([...confirmedPhotos, ...Object.keys(photoIssues).map(Number)]).size
  const reviewComplete = allPhotos.length === 0 || reviewedCount === allPhotos.length
  const issueEntries = Object.entries(photoIssues).filter(([, note]) => note.trim())

  function confirmCurrentPhoto() {
    setConfirmedPhotos(prev => new Set(prev).add(reviewIndex))
    setPhotoIssues(prev => {
      const next = { ...prev }
      delete next[reviewIndex]
      return next
    })
    setIssueEditorOpen(false)
    if (reviewIndex < allPhotos.length - 1) setReviewIndex(reviewIndex + 1)
  }

  function openIssueEditor() {
    setIssueDraft(photoIssues[reviewIndex] ?? '')
    setIssueEditorOpen(true)
  }

  function saveCurrentIssue() {
    const note = issueDraft.trim()
    if (!note) return
    setPhotoIssues(prev => ({ ...prev, [reviewIndex]: note }))
    setConfirmedPhotos(prev => {
      const next = new Set(prev)
      next.delete(reviewIndex)
      return next
    })
    setIssueEditorOpen(false)
    if (reviewIndex < allPhotos.length - 1) setReviewIndex(reviewIndex + 1)
  }

  function rejectWithIssues() {
    const note = issueEntries.map(([index, issue], order) => {
      const photo = allPhotos[Number(index)]
      return `${order + 1}. 【${photo?.label || `照片 ${Number(index) + 1}`}】${issue.trim()}`
    }).join('\n')
    startReject(async () => {
      const result = await disputeClosing(closing.id, note)
      if (result.error) toast.error(result.error)
      else {
        toast.success(`已退回，並回報 ${issueEntries.length} 個問題`)
        setReviewOpen(false)
        onProcessed?.()
      }
    })
  }

  function toggleReceipt(id: string) {
    setOpenReceiptIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const absVar = Math.abs(closing.variance)
  const varColor = absVar === 0 ? '#047857' : absVar <= 200 ? '#b45309' : '#be123c'
  const varBg    = absVar === 0 ? '#d1fae5' : absVar <= 200 ? '#fef3c7' : '#ffe4e6'

  const receiptTotal = receipts.reduce((s, r) => s + r.total_amount, 0)
  const platformTotal = closing.revenue_items
    .filter(r => ['uber', 'panda', 'twpay', 'online'].includes(r.channel))
    .reduce((s, r) => s + r.gross_amount, 0)
  const remittanceAdjustments = closing.remittance_adjustments ?? []
  const reserves = closing.reserve_items ?? []
  const adjustmentTotal = remittanceAdjustments.reduce((s: number, a: any) => s + (Number(a?.amount) || 0), 0)
  const totalReserved = reserves.reduce((s, r) => s + Math.max(0, Number(r?.amount) || 0), 0)
  const preReservedExpenseTotal = getPreReservedExpenseTotal(closing.cash_counts)
  const hasRemittanceChange = adjustmentTotal !== 0 || totalReserved > 0 || preReservedExpenseTotal > 0
  const remitToHQ = closing.actual_remit + adjustmentTotal - totalReserved + preReservedExpenseTotal

  const st = STATUS_STYLE[closing.status] ?? STATUS_STYLE.submitted

  useEffect(() => {
    setExpanded(defaultExpanded ?? (closing.variance !== 0 || closing.status === 'disputed'))
  }, [closing.id, closing.status, closing.variance, defaultExpanded])

  return (
    <>
    {lightboxIdx !== null && allPhotos.length > 0 && (
      <PhotoLightbox
        photos={allPhotos}
        index={lightboxIdx}
        onClose={() => setLightboxIdx(null)}
        onPrev={() => setLightboxIdx(i => (i !== null && i > 0 ? i - 1 : i))}
        onNext={() => setLightboxIdx(i => (i !== null && i < allPhotos.length - 1 ? i + 1 : i))}
      />
    )}
    {reviewOpen && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(9,9,11,0.72)' }}>
        <div className="bg-white w-full sm:max-w-3xl sm:rounded-3xl overflow-hidden flex flex-col" style={{ maxHeight: '94dvh' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #e4e4e7' }}>
            <div>
              <p className="text-sm font-bold" style={{ color: '#18181b' }}>逐張核對 · {closing.stores?.name}</p>
              <p className="text-xs" style={{ color: '#71717a' }}>{allPhotos.length === 0 ? '本日沒有照片' : `${reviewIndex + 1} / ${allPhotos.length}　${currentPhoto?.label ?? ''}`}</p>
            </div>
            <button type="button" onClick={() => setReviewOpen(false)} className="p-2 rounded-full" style={{ background: '#f4f4f5' }} aria-label="關閉核對">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-4 grid sm:grid-cols-2 gap-4">
            <div className="min-h-64 rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: '#18181b' }}>
              {currentPhoto ? (
                <SafePhotoImage src={currentPhoto.url} alt={currentPhoto.label} className="w-full h-full max-h-[55dvh] object-contain" />
              ) : (
                <div className="text-center p-8" style={{ color: '#d4d4d8' }}><FileText className="h-10 w-10 mx-auto mb-2" /><p className="text-sm">沒有照片需要核對</p></div>
              )}
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl p-3 space-y-2" style={{ background: '#fafafa', border: '1px solid #e4e4e7' }}>
                <p className="text-xs font-bold" style={{ color: '#52525b' }}>分店輸入內容</p>
                {currentReceipt ? (
                  <>
                    <InfoRow label="廠商" value={currentReceipt.actual_vendor_name || currentReceipt.vendor_name || '未填寫'} />
                    <InfoRow label="單據類型" value={TYPE_LABEL[currentReceipt.receipt_type] ?? currentReceipt.receipt_type} />
                    <InfoRow label="單據總額" value={`$${fmt(currentReceipt.total_amount)}`} accent="#92400e" />
                    {!!currentReceipt.tax_amount && <InfoRow label="稅額" value={`$${fmt(currentReceipt.tax_amount)}`} />}
                    {currentReceipt.receipt_items.map((item, i) => (
                      <div key={i} className="pt-2" style={{ borderTop: '1px solid #e4e4e7' }}>
                        <InfoRow label={item.item_name || `品項 ${i + 1}`} value={`$${fmt(item.amount)}`} />
                        {(item.quantity || item.unit || item.unit_price) && <p className="text-[11px] mt-0.5" style={{ color: '#a1a1aa' }}>{item.quantity ? `${item.quantity}` : ''}{item.unit || ''}{item.unit_price ? ` × $${fmt(item.unit_price)}` : ''}</p>}
                      </div>
                    ))}
                    {currentReceipt.notes && <p className="text-xs pt-2" style={{ borderTop: '1px solid #e4e4e7', color: '#52525b' }}>備註：{currentReceipt.notes}</p>}
                  </>
                ) : currentPhoto?.kind === 'ck' ? (
                  <>
                    <InfoRow label="步驟" value="央廚配送" />
                    {closing.order_items.length > 0 ? closing.order_items.map((item, i) => (
                      <div key={i} className="pt-2" style={{ borderTop: '1px solid #e4e4e7' }}>
                        <InfoRow label={`${item.item_name} × ${item.quantity}`} value={`$${fmt(item.total_amount)}`} />
                      </div>
                    )) : <p className="text-xs" style={{ color: '#a1a1aa' }}>未輸入配送品項</p>}
                    <div className="pt-2" style={{ borderTop: '1px solid #e4e4e7' }}>
                      <InfoRow label="央廚配送總額" value={`$${fmt(closing.total_cost)}`} accent="#92400e" />
                    </div>
                  </>
                ) : currentPhoto?.kind === 'channel' ? (
                  <>
                    <InfoRow label="步驟" value={currentPhoto.label} />
                    {currentChannelItems.length > 0 ? currentChannelItems.map((item, i) => (
                      <InfoRow key={i}
                        label={item.account_name || CHANNEL_LABEL[item.channel] || item.channel}
                        value={`$${fmt(item.gross_amount)}`} accent="#92400e" />
                    )) : <InfoRow label="輸入金額" value="$0" muted />}
                    {currentChannelItems.length > 1 && (
                      <div className="pt-2" style={{ borderTop: '1px solid #e4e4e7' }}>
                        <InfoRow label="通路合計" value={`$${fmt(currentChannelItems.reduce((sum, item) => sum + item.gross_amount, 0))}`} accent="#92400e" />
                      </div>
                    )}
                  </>
                ) : currentPhoto?.kind === 'envelope' ? (
                  <>
                    <InfoRow label="步驟" value="信封袋／匯款結算" />
                    <InfoRow label="應匯入" value={`$${fmt(closing.should_include_delivery)}`} />
                    <InfoRow label="實匯入" value={`$${fmt(closing.actual_remit)}`} accent="#92400e" />
                    {hasRemittanceChange && <InfoRow label="調整後應包回公司" value={`$${fmt(remitToHQ)}`} accent="#047857" />}
                    <InfoRow label="結算誤差" value={`${closing.variance >= 0 ? '+' : ''}$${fmt(closing.variance)}`} accent={varColor} />
                    {remittanceAdjustments.filter((a: any) => Number(a?.amount) !== 0).map((a: any, i: number) => (
                      <InfoRow key={i} label={a.label || '匯款調整'} value={`${a.amount >= 0 ? '+' : '−'}$${fmt(Math.abs(Number(a.amount) || 0))}`} />
                    ))}
                    {reserves.map((item, i) => <InfoRow key={i} label={`預留：${item.reason}`} value={`−$${fmt(item.amount)}`} />)}
                  </>
                ) : currentPhoto?.kind === 'void' ? (
                  <>
                    <InfoRow label="步驟" value="作廢發票確認" />
                    <InfoRow label="照片用途" value={currentPhoto.label} />
                    <p className="text-xs pt-2" style={{ borderTop: '1px solid #e4e4e7', color: '#71717a' }}>此步驟沒有另外輸入金額，請核對發票確實作廢且照片清晰。</p>
                  </>
                ) : currentPhoto?.kind === 'note' ? (
                  <>
                    <InfoRow label="步驟" value="結帳備註" />
                    <InfoRow label="相關結算金額" value={`$${fmt(remitToHQ)}`} accent="#92400e" />
                    <p className="text-xs pt-2" style={{ borderTop: '1px solid #e4e4e7', color: '#52525b' }}>備註：{closing.note || '未輸入文字備註'}</p>
                  </>
                ) : currentPhoto ? (
                  <>
                    <InfoRow label="步驟／照片用途" value={currentPhoto.label} />
                    <InfoRow label="當日結算金額" value={`$${fmt(remitToHQ)}`} accent="#92400e" />
                    {closing.note && <p className="text-xs pt-2" style={{ borderTop: '1px solid #e4e4e7', color: '#52525b' }}>備註：{closing.note}</p>}
                  </>
                ) : <p className="text-xs" style={{ color: '#a1a1aa' }}>沒有照片需要核對。</p>}
              </div>

              {currentPhoto && !issueEditorOpen && (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={confirmCurrentPhoto} className="py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                    style={{ background: confirmedPhotos.has(reviewIndex) ? '#d1fae5' : 'linear-gradient(135deg,#10b981,#059669)', color: confirmedPhotos.has(reviewIndex) ? '#047857' : 'white' }}>
                    <CheckCircle2 className="h-4 w-4" />{confirmedPhotos.has(reviewIndex) ? '已確認相符' : '內容相符'}
                  </button>
                  <button type="button" onClick={openIssueEditor} className="py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                    style={{ background: photoIssues[reviewIndex] ? '#ffe4e6' : '#fff7ed', color: '#be123c', border: '1px solid #fda4af' }}>
                    <AlertTriangle className="h-4 w-4" />{photoIssues[reviewIndex] ? '已記錄問題' : '照片內容有誤'}
                  </button>
                </div>
              )}

              {issueEditorOpen && (
                <div className="rounded-2xl p-3 space-y-2" style={{ background: '#fff1f2', border: '1px solid #fda4af' }}>
                  <p className="text-xs font-bold" style={{ color: '#be123c' }}>請輸入這張照片／步驟的問題</p>
                  <textarea autoFocus value={issueDraft} onChange={e => setIssueDraft(e.target.value)}
                    placeholder="例如：照片金額為 $4,570，但輸入 $4,750；請重新確認。"
                    className="w-full min-h-24 rounded-xl p-3 text-sm outline-none" style={{ background: 'white', border: '1px solid #fecdd3', resize: 'vertical' }} />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setIssueEditorOpen(false)} className="px-3 py-2 rounded-lg text-xs" style={{ background: 'white', color: '#71717a' }}>取消</button>
                    <button type="button" disabled={!issueDraft.trim()} onClick={saveCurrentIssue} className="px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40" style={{ background: '#e11d48' }}>記錄問題</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={reviewIndex === 0} onClick={() => setReviewIndex(i => Math.max(0, i - 1))} className="py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1" style={{ background: '#f4f4f5', color: reviewIndex === 0 ? '#d4d4d8' : '#52525b' }}><ChevronLeft className="h-4 w-4" />上一張</button>
                <button type="button" disabled={reviewIndex >= allPhotos.length - 1} onClick={() => setReviewIndex(i => Math.min(allPhotos.length - 1, i + 1))} className="py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1" style={{ background: '#f4f4f5', color: reviewIndex >= allPhotos.length - 1 ? '#d4d4d8' : '#52525b' }}>下一張<ChevronRight className="h-4 w-4" /></button>
              </div>

              {reviewComplete && issueEntries.length === 0 && (
                <div className="rounded-2xl p-4 space-y-2" style={{ background: '#ecfdf5', border: '1px solid #6ee7b7' }}>
                  <p className="text-sm font-bold" style={{ color: '#065f46' }}>照片核對完成，最後確認結算</p>
                  <InfoRow label="應匯入" value={`$${fmt(closing.should_include_delivery)}`} />
                  <InfoRow label="實匯入" value={`$${fmt(closing.actual_remit)}`} />
                  {hasRemittanceChange && <InfoRow label="調整後應包回公司" value={`$${fmt(remitToHQ)}`} accent="#047857" />}
                  <InfoRow label="結算誤差" value={`${closing.variance >= 0 ? '+' : ''}$${fmt(closing.variance)}`} accent={varColor} />
                  <div className="pt-2" style={{ borderTop: '1px solid #a7f3d0' }}>
                    <ReviewActions closingId={closing.id} currentStatus={closing.status} onProcessed={onProcessed} />
                  </div>
                </div>
              )}
              {reviewComplete && issueEntries.length > 0 && (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: '#fff1f2', border: '1px solid #fda4af' }}>
                  <p className="text-sm font-bold" style={{ color: '#9f1239' }}>已發現 {issueEntries.length} 個問題</p>
                  <div className="space-y-2">
                    {issueEntries.map(([index, issue]) => <div key={index} className="text-xs rounded-lg p-2" style={{ background: 'white', color: '#881337' }}><b>{allPhotos[Number(index)]?.label}：</b>{issue}</div>)}
                  </div>
                  <button type="button" disabled={rejectPending} onClick={rejectWithIssues} className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#f43f5e,#e11d48)' }}>
                    {rejectPending ? '退回中…' : '彙整以上問題並退回店面'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
    <div className="bg-white rounded-2xl overflow-hidden transition-colors"
      style={{
        border: selected ? '1.5px solid #10b981' : '1px solid #f4f4f5',
        boxShadow: selected ? '0 4px 14px rgba(16,185,129,0.18)' : '0 2px 8px rgba(0,0,0,0.05)',
      }}>
      <div className="px-4 py-4 space-y-3">

        {/* 標題列 */}
        <div className="flex items-start justify-between gap-2">
          {showCheckbox && (
            <button type="button" onClick={onToggleSelect}
              className="shrink-0 mt-0.5 w-6 h-6 rounded-md flex items-center justify-center transition-colors"
              style={{
                background: selected ? '#10b981' : 'white',
                border: selected ? '1.5px solid #10b981' : '1.5px solid #d4d4d8',
              }}
              aria-label={selected ? '取消勾選' : '勾選此筆'}>
              {selected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: '#18181b' }}>{closing.stores?.name}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>
                {st.label}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>{closing.business_date}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(closing.total_revenue)}</p>
            <span className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-lg"
              style={{ background: varBg, color: varColor }}>
              誤差 {closing.variance >= 0 ? '+' : ''}{fmt(closing.variance)}
            </span>
          </div>
        </div>

        {/* 大誤差警示 */}
        {absVar > 200 && (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl"
            style={{ background: '#fff8f8', border: '1px solid #fda4af', color: '#be123c' }}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            誤差超過 $200，請仔細核對
          </div>
        )}

        {/* 店長備註 */}
        {closing.note && (
          <p className="text-xs px-3 py-2 rounded-xl" style={{ background: '#f8fafc', color: '#52525b' }}>
            備註：{closing.note}
          </p>
        )}

        {/* 退回原因 */}
        {closing.status === 'disputed' && closing.dispute_note && (
          <p className="text-xs px-3 py-2 rounded-xl" style={{ background: '#fff7ed', color: '#c2410c' }}>
            已退回原因：{closing.dispute_note}
          </p>
        )}

        {/* 展開按鈕 */}
        <button onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl"
          style={{ border: '1px solid #f4f4f5', color: '#71717a', background: '#fafafa' }}>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? '收起明細' : '查看明細'}
        </button>

        {expanded && (
          <div className="space-y-4 pt-1">

            {/* 營收明細 */}
            {closing.revenue_items.length > 0 && (
              <div>
                <SubLabel>營收明細</SubLabel>
                <div className="space-y-1">
                  {closing.revenue_items.map((r, i) => (
                    <InfoRow key={i}
                      label={`${CHANNEL_LABEL[r.channel] ?? r.channel}${r.account_name ? `（${r.account_name}）` : ''}`}
                      value={`$${fmt(r.gross_amount)}`} />
                  ))}
                  <div className="flex justify-between text-xs pt-1 font-semibold"
                    style={{ borderTop: '1px solid #f4f4f5', color: '#18181b' }}>
                    <span>總計</span>
                    <span className="tabular-nums">${fmt(closing.total_revenue)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 結算摘要 */}
            <div>
              <SubLabel>結算摘要</SubLabel>
              <div className="rounded-xl px-3 py-2.5 space-y-1.5" style={{ background: '#f8fafc', border: '1px solid #f4f4f5' }}>
                {platformTotal > 0 && <InfoRow label="平台收款（已扣）" value={`−$${fmt(platformTotal)}`} muted />}
                {closing.total_expenses > 0 && <InfoRow label="現金支出（已扣）" value={`−$${fmt(closing.total_expenses)}`} muted />}
                <div className="flex justify-between text-xs font-semibold pt-1" style={{ borderTop: '1px solid #e4e4e7', color: '#18181b' }}>
                  <span>應包進信封</span>
                  <span className="tabular-nums">${fmt(closing.should_include_delivery)}</span>
                </div>
                {closing.total_cost > 0 && <InfoRow label="　其中央廚費" value={`$${fmt(closing.total_cost)}`} muted />}
                <div className="flex justify-between text-xs font-semibold pt-1" style={{ borderTop: '1px solid #e4e4e7', color: '#18181b' }}>
                  <span>實際包進信封</span>
                  <span className="tabular-nums">${fmt(closing.actual_remit)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold pt-1" style={{ borderTop: '1px solid #e4e4e7', color: varColor }}>
                  <span>誤差</span>
                  <span className="tabular-nums">{closing.variance >= 0 ? '+' : ''}{fmt(closing.variance)}</span>
                </div>
                {hasRemittanceChange && (
                  <>
                    {remittanceAdjustments.filter((a: any) => Number(a?.amount) !== 0).map((a: any, i: number) => (
                      <div key={`adjustment-${i}`} className="flex justify-between text-xs pt-1" style={{ color: a.amount >= 0 ? '#047857' : '#2563eb' }}>
                        <span>💳 {a.label || '匯款調整'}</span>
                        <span className="tabular-nums">{a.amount >= 0 ? '+' : '−'}{fmt(Math.abs(Number(a.amount) || 0))}</span>
                      </div>
                    ))}
                    {reserves.map((r, i) => (
                      <div key={`reserve-${i}`} className="flex justify-between text-xs pt-1" style={{ color: '#ea580c' }}>
                        <span>🐷 預留 {r.reason}</span>
                        <span className="tabular-nums">−{fmt(Number(r.amount) || 0)}</span>
                      </div>
                    ))}
                    {preReservedExpenseTotal > 0 && (
                      <div className="flex justify-between text-xs pt-1" style={{ color: '#15803d' }}>
                        <span>前幾日已預留支出加回</span>
                        <span className="tabular-nums">＋{fmt(preReservedExpenseTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-bold pt-1" style={{ borderTop: '1px solid #fed7aa', color: remitToHQ < 0 ? '#dc2626' : '#18181b' }}>
                      <span>今日實際應包回公司</span>
                      <span className="tabular-nums">${fmt(remitToHQ)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 央廚配送 */}
            {closing.order_items.length > 0 && (
              <div>
                <SubLabel>央廚配送</SubLabel>
                <div className="space-y-1">
                  {closing.order_items.map((o, i) => (
                    <InfoRow key={i} label={`${o.item_name} × ${o.quantity}`} value={`$${fmt(o.total_amount)}`} />
                  ))}
                </div>
              </div>
            )}

            {/* 現金支出 */}
            {closing.expense_items.length > 0 && (
              <div>
                <SubLabel>現金支出</SubLabel>
                <div className="space-y-1">
                  {closing.expense_items.map((e, i) => (
                    <InfoRow key={i} label={e.description} value={`$${fmt(e.amount)}`} />
                  ))}
                </div>
              </div>
            )}

            {/* 當日單據 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <SubLabel>當日單據（{receipts.length} 筆）</SubLabel>
                {receipts.length > 0 && (
                  <span className="text-xs tabular-nums" style={{ color: '#a1a1aa' }}>合計 ${fmt(receiptTotal)}</span>
                )}
              </div>

              {receipts.length === 0 ? (
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl" style={{ background: '#f8fafc', color: '#a1a1aa' }}>
                  <FileText className="h-3.5 w-3.5" /> 本日無上傳單據
                </div>
              ) : (
                <div className="space-y-2">
                  {receipts.map(r => {
                    const isOpen = openReceiptIds.has(r.id)
                    return (
                    <div key={r.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                      <button type="button" onClick={() => toggleReceipt(r.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left" style={{ background: '#fafafa' }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium" style={{ color: '#18181b' }}>{r.vendor_name || '（未填廠商）'}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#f4f4f5', color: '#71717a' }}>
                              {TYPE_LABEL[r.receipt_type] ?? r.receipt_type}
                            </span>
                          </div>
                          {r.receipt_items.length > 0 && (
                            <p className="text-[10px] mt-0.5 truncate" style={{ color: '#a1a1aa' }}>
                              {r.receipt_items.map(i => i.item_name).join('、')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(r.total_amount)}</span>
                          {r.photo_url && (
                            <span
                              onClick={e => {
                                e.stopPropagation()
                                const idx = allPhotos.findIndex(x => x.url === r.photo_url)
                                setLightboxIdx(idx >= 0 ? idx : 0)
                              }}
                              className="p-1.5 rounded-lg"
                              style={{ background: '#f4f4f5', color: '#a1a1aa' }}
                              title="放大檢視">
                              <Image className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {isOpen ? <ChevronUp className="h-4 w-4" style={{ color: '#a1a1aa' }} /> : <ChevronDown className="h-4 w-4" style={{ color: '#a1a1aa' }} />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-3 py-3 space-y-2" style={{ borderTop: '1px solid #f4f4f5', background: 'white' }}>
                          <InfoRow label="廠商" value={r.actual_vendor_name || r.vendor_name || '未填寫'} />
                          <InfoRow label="單據類型" value={TYPE_LABEL[r.receipt_type] ?? r.receipt_type} />
                          {!!r.tax_amount && <InfoRow label="稅額" value={`$${fmt(r.tax_amount)}`} />}
                          {r.receipt_items.length > 0 ? r.receipt_items.map((item, i) => (
                            <div key={i} className="pt-2" style={{ borderTop: '1px solid #f4f4f5' }}>
                              <InfoRow label={item.item_name || `品項 ${i + 1}`} value={`$${fmt(item.amount)}`} />
                              {(item.quantity || item.unit || item.unit_price) && <p className="text-[10px]" style={{ color: '#a1a1aa' }}>{item.quantity ? item.quantity : ''}{item.unit || ''}{item.unit_price ? ` × $${fmt(item.unit_price)}` : ''}</p>}
                            </div>
                          )) : <p className="text-xs" style={{ color: '#a1a1aa' }}>未輸入品項明細</p>}
                          {r.notes && <p className="text-xs pt-2" style={{ borderTop: '1px solid #f4f4f5', color: '#52525b' }}>備註：{r.notes}</p>}
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              )}
            </div>

            {/* 其他照片：央廚配送單 / 通路截圖 / 信封袋 / 作廢發票 / 備註 */}
            {(() => {
              const otherPhotos: { url: string; label: string }[] = []
              if (closing.ck_delivery_photo_url) otherPhotos.push({ url: closing.ck_delivery_photo_url, label: '央廚配送單' })
              if (closing.channel_photo_urls) {
                for (const [k, url] of Object.entries(closing.channel_photo_urls)) {
                  if (url) otherPhotos.push({ url: url as string, label: CHANNEL_LABEL[k] ?? k })
                }
              }
              if (closing.envelope_photo_url) otherPhotos.push({ url: closing.envelope_photo_url, label: '信封袋' })
              for (const [i, url] of (closing.void_invoice_photo_urls ?? []).entries()) {
                otherPhotos.push({ url, label: `作廢發票${(closing.void_invoice_photo_urls?.length ?? 1) > 1 ? ` ${i + 1}` : ''}` })
              }
              if (closing.note_photo_url) otherPhotos.push({ url: closing.note_photo_url, label: '備註照片' })
              otherPhotos.push(...extraPhotos)
              if (otherPhotos.length === 0) return null
              return (
                <div>
                  <SubLabel>其他照片</SubLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {otherPhotos.map((p, i) => {
                      // 找到這張照片在 allPhotos 內的 index
                      const globalIdx = allPhotos.findIndex(x => x.url === p.url)
                      return (
                        <button key={i} onClick={() => setLightboxIdx(globalIdx >= 0 ? globalIdx : 0)}
                          className="block rounded-lg overflow-hidden text-left"
                          style={{ border: '1px solid #f4f4f5', background: 'white', cursor: 'pointer', padding: 0 }}>
                          <SafePhotoImage
                            src={p.url}
                            alt={p.label}
                            thumb
                            width={220}
                            height={220}
                            className="w-full aspect-square object-cover"
                          />
                          <p className="text-[10px] text-center py-1" style={{ color: '#71717a' }}>{p.label}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* 操作按鈕 */}
        {canReview && (closing.status === 'submitted' || closing.status === 'disputed') && (
          <button type="button" onClick={() => { setReviewIndex(0); setReviewOpen(true) }} className="w-full py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#f59e0b,#f97316)', boxShadow: '0 3px 10px rgba(245,158,11,0.22)' }}>
            <Camera className="h-4 w-4" />{reviewedCount > 0 && !reviewComplete ? `繼續核對（剩 ${allPhotos.length - reviewedCount} 張）` : '開始核對'}
          </button>
        )}
        {canReview || (canDispute && closing.status === 'verified') ? (
          <ReviewActions closingId={closing.id} currentStatus={closing.status} onProcessed={onProcessed} hideVerify />
        ) : null}
      </div>
    </div>
    </>
  )
}
