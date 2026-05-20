'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { FileText, Plus, Trash2, Image, ChevronDown, ChevronUp, Receipt } from 'lucide-react'
import { deleteReceipt } from '@/app/actions/receipts'
import ReceiptUpload from './receipt-upload'
import { useRouter } from 'next/navigation'

interface ReceiptItem {
  id: string
  item_name: string
  amount: number
}

interface Receipt {
  id: string
  business_date: string
  vendor_name: string
  receipt_type: string
  total_amount: number
  tax_amount: number
  photo_url: string
  status: string
  notes: string
  created_at: string
  receipt_items: ReceiptItem[]
}

interface Props {
  storeId: string
  storeName: string
  today: string
  receipts: Receipt[]
}

const TYPE_LABEL: Record<string, string> = {
  invoice: '統一發票',
  receipt: '收據',
  delivery_note: '估價單',
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  submitted: 'bg-blue-100 text-blue-700',
  verified: 'bg-green-100 text-green-700',
}

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  submitted: '已送出',
  verified: '已確認',
}

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

function formatDate(d: string) {
  const dt = new Date(d + 'T00:00:00+08:00')
  return `${dt.getMonth() + 1}/${dt.getDate()}（${['日','一','二','三','四','五','六'][dt.getDay()]}）`
}

function ReceiptCard({ receipt, onDelete }: { receipt: Receipt; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [showPhoto, setShowPhoto] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm('確定要刪除這筆收據嗎？')) return
    setDeleting(true)
    await deleteReceipt(receipt.id)
    onDelete()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 truncate">
              {receipt.vendor_name || '（未填廠商）'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
              {TYPE_LABEL[receipt.receipt_type] ?? receipt.receipt_type}
            </span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded', STATUS_STYLE[receipt.status] ?? STATUS_STYLE.draft)}>
              {STATUS_LABEL[receipt.status] ?? receipt.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-base font-bold tabular-nums text-slate-900">${fmt(receipt.total_amount)}</span>
            {receipt.tax_amount > 0 && (
              <span className="text-xs text-slate-400">含稅 ${fmt(receipt.tax_amount)}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {receipt.photo_url && (
            <button
              onClick={() => setShowPhoto(!showPhoto)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
            >
              <Image className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showPhoto && receipt.photo_url && (
        <div className="px-4 pb-3">
          <img
            src={receipt.photo_url}
            alt="receipt"
            className="w-full max-h-64 object-contain rounded-lg border border-slate-100 bg-slate-50"
          />
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-3 border-t border-slate-100 pt-3 space-y-2">
          {receipt.receipt_items.length > 0 ? (
            <>
              <p className="text-xs font-semibold text-slate-500">品項明細</p>
              {receipt.receipt_items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-slate-600">{item.item_name}</span>
                  <span className="tabular-nums font-medium">${fmt(item.amount)}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="text-xs text-slate-400">無品項明細</p>
          )}
          {receipt.notes && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-2 py-1.5">{receipt.notes}</p>
          )}
          <p className="text-[10px] text-slate-400">
            {new Date(receipt.created_at).toLocaleString('zh-TW', {
              timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            })}
          </p>
        </div>
      )}
    </div>
  )
}

export default function ReceiptsClient({ storeId, storeName, today, receipts: initial }: Props) {
  const [receipts, setReceipts] = useState(initial)
  const [showUpload, setShowUpload] = useState(false)
  const router = useRouter()

  function handleSaved() {
    setShowUpload(false)
    router.refresh()
  }

  // Group by date
  const grouped = receipts.reduce<Record<string, Receipt[]>>((acc, r) => {
    const d = r.business_date
    if (!acc[d]) acc[d] = []
    acc[d].push(r)
    return acc
  }, {})
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const todayTotal = receipts
    .filter(r => r.business_date === today)
    .reduce((s, r) => s + r.total_amount, 0)

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-blue-500" /> 單據管理
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{storeName} · {today}</p>
        </div>
        {!showUpload && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> 新增
          </button>
        )}
      </div>

      {/* 今日統計 */}
      {!showUpload && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex justify-between text-sm">
          <span className="text-slate-500">今日單據</span>
          <div className="text-right">
            <span className="font-bold tabular-nums text-slate-800">${fmt(todayTotal)}</span>
            <span className="text-slate-400 ml-2 text-xs">
              共 {receipts.filter(r => r.business_date === today).length} 筆
            </span>
          </div>
        </div>
      )}

      {/* 上傳表單 */}
      {showUpload && (
        <div className="rounded-xl border border-blue-200 bg-white p-4">
          <ReceiptUpload
            storeId={storeId}
            today={today}
            onSaved={handleSaved}
            onCancel={() => setShowUpload(false)}
          />
        </div>
      )}

      {/* 收據列表 */}
      {dates.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>尚無單據紀錄</p>
          <p className="text-xs mt-1">點右上角「新增」上傳第一張收據</p>
        </div>
      ) : (
        dates.map(date => (
          <div key={date} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">
                {date === today ? `今天 ${formatDate(date)}` : formatDate(date)}
              </p>
              <p className="text-xs text-slate-400 tabular-nums">
                ${fmt(grouped[date].reduce((s, r) => s + r.total_amount, 0))}
              </p>
            </div>
            {grouped[date].map(r => (
              <ReceiptCard key={r.id} receipt={r} onDelete={() => router.refresh()} />
            ))}
          </div>
        ))
      )}
    </div>
  )
}
