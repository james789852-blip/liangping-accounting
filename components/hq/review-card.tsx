'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Image, FileText, AlertTriangle } from 'lucide-react'
import ReviewActions from './review-actions'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

interface RevenueItem { channel: string; account_name?: string; gross_amount: number }
interface ExpenseItem { description: string; amount: number }
interface OrderItem { item_name: string; quantity: number; total_amount: number }
interface ReceiptItem { item_name: string; amount: number }
interface Receipt {
  id: string; vendor_name: string; receipt_type: string
  total_amount: number; photo_url: string; receipt_items: ReceiptItem[]
}
interface Closing {
  id: string; business_date: string; status: string
  total_revenue: number; variance: number; note: string; dispute_note: string
  submitted_at: string; should_include_delivery: number; actual_remit: number
  total_cost: number; total_expenses: number; stores: { name: string }
  revenue_items: RevenueItem[]; expense_items: ExpenseItem[]; order_items: OrderItem[]
}
interface Props { closing: Closing; receipts: Receipt[]; canReview: boolean; canDispute: boolean }

const TYPE_LABEL: Record<string, string> = { invoice: '發票', receipt: '收據', delivery_note: '估價單' }
const CHANNEL_LABEL: Record<string, string> = {
  pos: 'POS 現金', uber: 'Uber Eats', panda: '熊貓',
  twpay: '台灣Pay', online: '線上點餐', handwrite: '手寫訂單',
}
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  submitted: { bg: '#eef2ff', color: '#4338ca', label: '待審核' },
  disputed:  { bg: '#fff7ed', color: '#c2410c', label: '已退回' },
  verified:  { bg: '#d1fae5', color: '#047857', label: '已核准' },
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

export default function ReviewCard({ closing, receipts, canReview, canDispute }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [photoId, setPhotoId] = useState<string | null>(null)

  const absVar = Math.abs(closing.variance)
  const varColor = absVar === 0 ? '#047857' : absVar <= 200 ? '#b45309' : '#be123c'
  const varBg    = absVar === 0 ? '#d1fae5' : absVar <= 200 ? '#fef3c7' : '#ffe4e6'

  const receiptTotal = receipts.reduce((s, r) => s + r.total_amount, 0)
  const platformTotal = closing.revenue_items
    .filter(r => ['uber', 'panda', 'twpay', 'online'].includes(r.channel))
    .reduce((s, r) => s + r.gross_amount, 0)

  const st = STATUS_STYLE[closing.status] ?? STATUS_STYLE.submitted

  return (
    <div className="bg-white rounded-2xl overflow-hidden"
      style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div className="px-4 py-4 space-y-3">

        {/* 標題列 */}
        <div className="flex items-start justify-between gap-2">
          <div>
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
                              onClick={() => setPhotoId(photoId === r.id ? null : r.id)}
                              className="p-1.5 rounded-lg"
                              style={{
                                background: photoId === r.id ? '#eef2ff' : '#f4f4f5',
                                color: photoId === r.id ? '#4338ca' : '#a1a1aa',
                              }}>
                              <Image className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {photoId === r.id && r.photo_url && (
                        <img src={r.photo_url} alt="receipt"
                          className="w-full max-h-72 object-contain"
                          style={{ background: 'white', borderTop: '1px solid #f4f4f5' }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 操作按鈕 */}
        {(canReview && closing.status === 'submitted') || (canDispute && closing.status === 'verified') ? (
          <ReviewActions closingId={closing.id} currentStatus={closing.status} />
        ) : null}
      </div>
    </div>
  )
}
