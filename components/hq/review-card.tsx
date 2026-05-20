'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Image, FileText, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import ReviewActions from './review-actions'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

interface RevenueItem { channel: string; account_name?: string; gross_amount: number }
interface ExpenseItem { description: string; amount: number }
interface OrderItem { item_name: string; quantity: number; total_amount: number }
interface ReceiptItem { item_name: string; amount: number }
interface Receipt {
  id: string
  vendor_name: string
  receipt_type: string
  total_amount: number
  photo_url: string
  receipt_items: ReceiptItem[]
}

interface Closing {
  id: string
  business_date: string
  status: string
  total_revenue: number
  variance: number
  note: string
  dispute_note: string
  submitted_at: string
  should_include_delivery: number
  actual_remit: number
  total_cost: number
  total_expenses: number
  stores: { name: string }
  revenue_items: RevenueItem[]
  expense_items: ExpenseItem[]
  order_items: OrderItem[]
}

interface Props {
  closing: Closing
  receipts: Receipt[]
  canReview: boolean
  canDispute: boolean
}

const TYPE_LABEL: Record<string, string> = {
  invoice: '發票', receipt: '收據', delivery_note: '估價單',
}

const CHANNEL_LABEL: Record<string, string> = {
  pos: 'POS 現金', uber: 'Uber Eats', panda: '熊貓',
  twpay: '台灣Pay', online: '線上點餐', handwrite: '手寫訂單',
}

const statusLabel: Record<string, string> = {
  submitted: '待審核', disputed: '已退回', verified: '已核准',
}
const statusColor: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  disputed: 'bg-orange-100 text-orange-700',
  verified: 'bg-green-100 text-green-700',
}

export default function ReviewCard({ closing, receipts, canReview, canDispute }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [photoId, setPhotoId] = useState<string | null>(null)

  const varColor = Math.abs(closing.variance) === 0 ? 'text-green-600' :
    Math.abs(closing.variance) <= 200 ? 'text-yellow-600' : 'text-red-600'

  const receiptTotal = receipts.reduce((s, r) => s + r.total_amount, 0)
  const platformTotal = closing.revenue_items
    .filter(r => ['uber', 'panda', 'twpay', 'online'].includes(r.channel))
    .reduce((s, r) => s + r.gross_amount, 0)

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* 標題列 */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-900 text-sm">{closing.stores?.name}</span>
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusColor[closing.status])}>
                {statusLabel[closing.status]}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{closing.business_date}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold tabular-nums">${fmt(closing.total_revenue)}</p>
            <p className={cn('text-xs tabular-nums font-medium', varColor)}>
              誤差 {closing.variance >= 0 ? '+' : ''}{fmt(closing.variance)}
            </p>
          </div>
        </div>

        {/* 警示：大誤差 */}
        {Math.abs(closing.variance) > 200 && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            誤差超過 $200，請仔細核對
          </div>
        )}

        {/* 店長備註 */}
        {closing.note && (
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            備註：{closing.note}
          </p>
        )}

        {/* 退回原因 */}
        {closing.status === 'disputed' && closing.dispute_note && (
          <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
            已退回原因：{closing.dispute_note}
          </p>
        )}

        {/* 展開明細按鈕 */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? '收起明細' : '查看明細'}
        </button>

        {expanded && (
          <div className="space-y-4 pt-1">
            {/* 營收明細 */}
            {closing.revenue_items.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">營收明細</p>
                <div className="space-y-1">
                  {closing.revenue_items.map((r, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-slate-600">
                        {CHANNEL_LABEL[r.channel] ?? r.channel}
                        {r.account_name ? `（${r.account_name}）` : ''}
                      </span>
                      <span className="tabular-nums font-medium">${fmt(r.gross_amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs pt-1 border-t border-slate-100 font-semibold">
                    <span>總計</span>
                    <span className="tabular-nums">${fmt(closing.total_revenue)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 結算摘要 */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">結算摘要</p>
              <div className="bg-slate-50 rounded-lg px-3 py-2 space-y-1">
                {platformTotal > 0 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>平台收款（已扣）</span>
                    <span className="tabular-nums">−${fmt(platformTotal)}</span>
                  </div>
                )}
                {closing.total_expenses > 0 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>現金支出（已扣）</span>
                    <span className="tabular-nums">−${fmt(closing.total_expenses)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-semibold text-slate-700 pt-0.5 border-t border-slate-200">
                  <span>應包進信封</span>
                  <span className="tabular-nums">${fmt(closing.should_include_delivery)}</span>
                </div>
                {closing.total_cost > 0 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span className="pl-2">其中央廚費</span>
                    <span className="tabular-nums">${fmt(closing.total_cost)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-semibold text-slate-800 pt-0.5 border-t border-slate-200">
                  <span>實際包進信封</span>
                  <span className="tabular-nums">${fmt(closing.actual_remit)}</span>
                </div>
                <div className={cn('flex justify-between text-xs font-bold pt-0.5 border-t border-slate-200', varColor)}>
                  <span>誤差</span>
                  <span className="tabular-nums">{closing.variance >= 0 ? '+' : ''}{fmt(closing.variance)}</span>
                </div>
              </div>
            </div>

            {/* 央廚配送 */}
            {closing.order_items.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">央廚配送</p>
                <div className="space-y-1">
                  {closing.order_items.map((o, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-slate-600">{o.item_name} × {o.quantity}</span>
                      <span className="tabular-nums">${fmt(o.total_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 現金支出 */}
            {closing.expense_items.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">現金支出</p>
                <div className="space-y-1">
                  {closing.expense_items.map((e, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-slate-600">{e.description}</span>
                      <span className="tabular-nums">${fmt(e.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 收據 / 發票 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-slate-500">
                  當日單據（{receipts.length} 筆）
                </p>
                {receipts.length > 0 && (
                  <span className="text-xs tabular-nums text-slate-500">
                    合計 ${fmt(receiptTotal)}
                  </span>
                )}
              </div>

              {receipts.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                  <FileText className="h-3.5 w-3.5" /> 本日無上傳單據
                </div>
              ) : (
                <div className="space-y-2">
                  {receipts.map(r => (
                    <div key={r.id} className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium text-slate-700">{r.vendor_name || '（未填廠商）'}</span>
                            <span className="text-[10px] px-1 py-0.5 rounded bg-slate-200 text-slate-500">
                              {TYPE_LABEL[r.receipt_type] ?? r.receipt_type}
                            </span>
                          </div>
                          {r.receipt_items.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                              {r.receipt_items.map(i => i.item_name).join('、')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold tabular-nums">${fmt(r.total_amount)}</span>
                          {r.photo_url && (
                            <button
                              onClick={() => setPhotoId(photoId === r.id ? null : r.id)}
                              className={cn(
                                'p-1 rounded transition-colors',
                                photoId === r.id ? 'text-blue-600 bg-blue-100' : 'text-slate-400 hover:text-blue-500'
                              )}
                            >
                              <Image className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {photoId === r.id && r.photo_url && (
                        <img
                          src={r.photo_url}
                          alt="receipt"
                          className="w-full max-h-72 object-contain bg-white border-t border-slate-100"
                        />
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
      </CardContent>
    </Card>
  )
}
