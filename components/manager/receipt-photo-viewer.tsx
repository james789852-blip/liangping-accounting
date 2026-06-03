'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, X, ZoomIn, Camera } from 'lucide-react'

interface ReceiptItem {
  item_name: string
  amount: number
}

interface ReceiptPhotoItem {
  id: string
  vendor_name: string | null
  total_amount: number
  receipt_type: string | null
  photo_url: string | null
  tax_amount: number | null
  receipt_items?: ReceiptItem[]
}

const TYPE_LABEL: Record<string, string> = {
  invoice: '統一發票',
  receipt: '收據',
  delivery_note: '估價單',
}

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

function ReceiptCard({ receipt, onZoom }: { receipt: ReceiptPhotoItem; onZoom: (url: string) => void }) {
  const [open, setOpen] = useState(false)
  const label = receipt.receipt_type ? (TYPE_LABEL[receipt.receipt_type] ?? receipt.receipt_type) : '收據'
  const hasItems = receipt.receipt_items && receipt.receipt_items.length > 0
  const hasContent = hasItems || receipt.photo_url

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
      {/* Header */}
      <button
        onClick={() => hasContent && setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: 'white', cursor: hasContent ? 'pointer' : 'default' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {receipt.photo_url ? (
            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid #e4e4e7' }}>
              <img src={receipt.photo_url} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center" style={{ background: '#f4f4f5' }}>
              <Camera className="h-3.5 w-3.5" style={{ color: '#a1a1aa' }} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold truncate" style={{ color: '#18181b' }}>
                {receipt.vendor_name || '（未命名）'}
              </p>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: '#f4f4f5', color: '#71717a' }}>
                {label}
              </span>
            </div>
            <p className="text-xs tabular-nums mt-0.5" style={{ color: '#71717a' }}>
              ${fmt(receipt.total_amount)}
              {receipt.tax_amount && receipt.tax_amount > 0 ? `　含稅 $${fmt(receipt.tax_amount)}` : ''}
            </p>
          </div>
        </div>
        {hasContent && (
          <span className="shrink-0 ml-2" style={{ color: '#a1a1aa' }}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        )}
      </button>

      {/* Expanded */}
      {open && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid #f4f4f5', background: '#fafafa' }}>
          {/* 品項明細 */}
          {hasItems && (
            <div className="pt-3 space-y-1">
              {receipt.receipt_items!.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span style={{ color: '#52525b' }}>{item.item_name}</span>
                  <span className="tabular-nums" style={{ color: '#18181b' }}>${fmt(item.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* 照片 */}
          {receipt.photo_url && (
            <div className="relative group cursor-pointer" onClick={() => onZoom(receipt.photo_url!)}>
              <img
                src={receipt.photo_url}
                alt={receipt.vendor_name ?? '收據'}
                className="w-full object-contain rounded-xl"
                style={{ maxHeight: '300px', background: '#f1f5f9', border: '1px solid #e4e4e7' }}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'rgba(0,0,0,0.25)' }}>
                <ZoomIn className="h-8 w-8 text-white" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReceiptPhotoViewer({ receipts }: { receipts: ReceiptPhotoItem[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null)

  if (receipts.length === 0) return null

  const withPhoto = receipts.filter(r => r.photo_url).length

  return (
    <>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5', background: 'white' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
          <p className="text-sm font-semibold" style={{ color: '#18181b' }}>今日收據</p>
          <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>
            共 {receipts.length} 筆{withPhoto > 0 ? `・${withPhoto} 張照片` : ''}，點擊展開品項與照片
          </p>
        </div>
        <div className="p-3 space-y-2">
          {receipts.map(r => (
            <ReceiptCard key={r.id} receipt={r} onZoom={setLightbox} />
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white"
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt="收據"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
