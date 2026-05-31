'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface ReceiptPhotoItem {
  id: string
  vendor_name: string | null
  total_amount: number
  receipt_type: string | null
  photo_url: string | null
  tax_amount: number | null
}

const TYPE_LABEL: Record<string, string> = {
  invoice: '統一發票',
  receipt: '收據',
  delivery_note: '估價單',
}

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

function ReceiptPhotoCard({ receipt }: { receipt: ReceiptPhotoItem }) {
  const [open, setOpen] = useState(false)
  const label = receipt.receipt_type ? (TYPE_LABEL[receipt.receipt_type] ?? receipt.receipt_type) : '收據'
  const title = receipt.vendor_name ? `${receipt.vendor_name}（${label}）` : label

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: 'white' }}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: '#18181b' }}>{title}</p>
          <p className="text-xs tabular-nums mt-0.5" style={{ color: '#71717a' }}>
            ${fmt(receipt.total_amount)}
            {receipt.tax_amount && receipt.tax_amount > 0
              ? `　含稅 $${fmt(receipt.tax_amount)}`
              : ''}
          </p>
        </div>
        <span className="shrink-0 ml-2" style={{ color: '#a1a1aa' }}>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && receipt.photo_url && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid #f4f4f5', background: '#fafafa' }}>
          <img
            src={receipt.photo_url}
            alt={title}
            className="w-full object-contain rounded-lg mt-3"
            style={{ maxHeight: '320px', background: '#f1f5f9', border: '1px solid #f4f4f5' }}
          />
        </div>
      )}
    </div>
  )
}

export default function ReceiptPhotoViewer({ receipts }: { receipts: ReceiptPhotoItem[] }) {
  const withPhoto = receipts.filter(r => r.photo_url)
  if (withPhoto.length === 0) return null

  return (
    <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
        <p className="text-sm font-semibold text-slate-700">📋 收據 / 發票照片</p>
        <p className="text-xs text-slate-400 mt-0.5">共 {withPhoto.length} 張，點擊展開查看</p>
      </div>
      <div className="p-3 space-y-2">
        {withPhoto.map(r => (
          <ReceiptPhotoCard key={r.id} receipt={r} />
        ))}
      </div>
    </div>
  )
}
