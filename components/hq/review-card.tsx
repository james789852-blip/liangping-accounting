'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Image, FileText, AlertTriangle, Check } from 'lucide-react'
import ReviewActions from './review-actions'
import PhotoLightbox from './photo-lightbox'
import SafePhotoImage from './safe-photo-image'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

interface RevenueItem { channel: string; account_name?: string; gross_amount: number }
interface ExpenseItem { description: string; amount: number }
interface OrderItem { item_name: string; quantity: number; total_amount: number }
interface ReceiptItem { item_name: string; amount: number }
interface Receipt {
  id: string; vendor_name: string; receipt_type: string
  total_amount: number; photo_url: string; receipt_items: ReceiptItem[]
}
interface ReserveItem { reason: string; amount: number }
interface Closing {
  id: string; business_date: string; status: string
  total_revenue: number; variance: number; note: string; dispute_note: string
  submitted_at: string; should_include_delivery: number; actual_remit: number
  total_cost: number; total_expenses: number; stores: { name: string }
  revenue_items: RevenueItem[]; expense_items: ExpenseItem[]; order_items: OrderItem[]
  remittance_adjustments?: any[]; reserve_items?: ReserveItem[]
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
  twpay: '台灣Pay', online: '線上點餐', handwrite: '手寫訂單',
}
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  submitted: { bg: '#FFFBEB', color: '#92400E', label: '待審核' },
  disputed:  { bg: '#fff7ed', color: '#c2410c', label: '已退回' },
  verified:  { bg: '#d1fae5', color: '#047857', label: '已核准' },
}

type PhotoInfo = { url: string; label: string }

function normalizeExtraPhotos(extraPhotoUrls: Closing['extra_photo_urls']): PhotoInfo[] {
  return (extraPhotoUrls ?? [])
    .map((photo, index) => {
      if (typeof photo === 'string') {
        const url = photo.trim()
        return url ? { url, label: `附加照片 ${index + 1}` } : null
      }

      if (!photo || typeof photo !== 'object') return null

      const url = (photo.url ?? '').trim()
      if (!url) return null

      return {
        url,
        label: (photo.label ?? '').trim() || `附加照片 ${index + 1}`,
      }
    })
    .filter((photo): photo is PhotoInfo => Boolean(photo))
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
  const showCheckbox = canReview && closing.status === 'submitted' && !!onToggleSelect
  const extraPhotos = normalizeExtraPhotos(closing.extra_photo_urls)

  // 統一收集所有照片給 lightbox（收據 + 其他）
  const allPhotos: { url: string; label: string }[] = [
    ...receipts.filter(r => r.photo_url).map(r => ({ url: r.photo_url, label: `收據：${r.vendor_name}` })),
    ...(closing.ck_delivery_photo_url ? [{ url: closing.ck_delivery_photo_url, label: '央廚配送單' }] : []),
    ...(closing.channel_photo_urls
      ? Object.entries(closing.channel_photo_urls).filter(([, u]) => u).map(([k, u]) => ({ url: u as string, label: CHANNEL_LABEL[k] ?? k }))
      : []),
    ...(closing.envelope_photo_url ? [{ url: closing.envelope_photo_url, label: '信封袋' }] : []),
    ...(closing.void_invoice_photo_urls ?? []).map((url, i, arr) => ({ url, label: `作廢發票${arr.length > 1 ? ` ${i + 1}` : ''}` })),
    ...(closing.note_photo_url ? [{ url: closing.note_photo_url, label: '備註照片' }] : []),
    ...extraPhotos,
  ]

  const absVar = Math.abs(closing.variance)
  const varColor = absVar === 0 ? '#047857' : absVar <= 200 ? '#b45309' : '#be123c'
  const varBg    = absVar === 0 ? '#d1fae5' : absVar <= 200 ? '#fef3c7' : '#ffe4e6'

  const receiptTotal = receipts.reduce((s, r) => s + r.total_amount, 0)
  const platformTotal = closing.revenue_items
    .filter(r => ['uber', 'panda', 'twpay', 'online'].includes(r.channel))
    .reduce((s, r) => s + r.gross_amount, 0)

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
                {(() => {
                  const reserves = closing.reserve_items ?? []
                  if (reserves.length === 0) return null
                  const adjTotal = (closing.remittance_adjustments ?? []).reduce((s: number, a: any) => s + (a.amount ?? 0), 0)
                  const totalReserved = reserves.reduce((s, r) => s + r.amount, 0)
                  const remitToHQ = closing.actual_remit + adjTotal - totalReserved
                  return (
                    <>
                      {reserves.map((r, i) => (
                        <div key={i} className="flex justify-between text-xs pt-1" style={{ color: '#ea580c' }}>
                          <span>🐷 預留 {r.reason}</span>
                          <span className="tabular-nums">−{fmt(r.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-bold pt-1" style={{ borderTop: '1px solid #fed7aa', color: remitToHQ < 0 ? '#dc2626' : '#18181b' }}>
                        <span>今日實際匯入</span>
                        <span className="tabular-nums">${fmt(remitToHQ)}</span>
                      </div>
                    </>
                  )
                })()}
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
                  {receipts.map(r => (
                    <div key={r.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                      <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#fafafa' }}>
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
                            <button
                              onClick={() => {
                                const idx = allPhotos.findIndex(x => x.url === r.photo_url)
                                setLightboxIdx(idx >= 0 ? idx : 0)
                              }}
                              className="p-1.5 rounded-lg"
                              style={{ background: '#f4f4f5', color: '#a1a1aa' }}
                              title="放大檢視">
                              <Image className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
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
        {canReview || (canDispute && closing.status === 'verified') ? (
          <ReviewActions closingId={closing.id} currentStatus={closing.status} onProcessed={onProcessed} />
        ) : null}
      </div>
    </div>
    </>
  )
}
