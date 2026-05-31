'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, ChevronDown, ChevronUp, Camera, Package, Receipt } from 'lucide-react'

interface Store { id: string; name: string }
interface Closing {
  id: string; business_date: string; status: string; note?: string
  total_revenue: number; total_cost: number; total_expenses: number
  expected_remit: number; variance: number
  ck_delivery_photo_url?: string; channel_photo_urls?: Record<string, string>
  stores: { id: string; name: string }
  revenue_items: { channel: string; account_name?: string; gross_amount: number }[]
  order_items: { item_name: string; quantity: number; unit_price: number; total_amount: number }[]
}

interface Props {
  closings: Closing[]
  receiptsByClosing: Record<string, { id: string; vendor_name: string; total_amount: number; photo_url?: string }[]>
  stores: Store[]
  month: string
  storeId: string
}

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  draft:     { label: '草稿',   bg: '#f4f4f5', color: '#71717a' },
  submitted: { label: '待審核', bg: '#eef2ff', color: '#4338ca' },
  verified:  { label: '已審核', bg: '#d1fae5', color: '#047857' },
  disputed:  { label: '退回',   bg: '#ffe4e6', color: '#be123c' },
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.15)' }}
        onClick={onClose}
      >
        <X className="h-6 w-6 text-white" />
      </button>
      <img
        src={url}
        alt="photo"
        className="max-w-[95vw] max-h-[92vh] object-contain rounded-xl"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

function PhotoThumb({ url, label }: { url: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative rounded-xl overflow-hidden shrink-0 group"
        style={{ width: 80, height: 80, border: '1px solid #e4e4e7', background: '#f8fafc' }}
        title={label}
      >
        <img src={url} alt={label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
        {label && (
          <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[10px] text-white font-medium truncate"
            style={{ background: 'rgba(0,0,0,0.5)' }}>
            {label}
          </div>
        )}
      </button>
      {open && <Lightbox url={url} onClose={() => setOpen(false)} />}
    </>
  )
}

function ClosingCard({ closing, receipts }: { closing: Closing; receipts: any[] }) {
  const [expanded, setExpanded] = useState(true)
  const st = STATUS[closing.status] ?? STATUS.draft
  const [y, mo, d] = closing.business_date.split('-')
  const dateLabel = `${parseInt(mo)}/${parseInt(d)}`

  const channelPhotos = closing.channel_photo_urls ?? {}
  const ckPhoto = closing.ck_delivery_photo_url
  const receiptPhotos = receipts.filter(r => r.photo_url)
  const hasPhotos = receiptPhotos.length > 0 || ckPhoto || Object.keys(channelPhotos).length > 0

  const channelLabel: Record<string, string> = { pos: 'iChef POS', panda: '熊貓', twpay: '台灣Pay', online: '線上點餐' }
  const getChannelLabel = (key: string) => {
    if (key.startsWith('uber_')) return `Uber ${key.slice(5)}`
    return channelLabel[key] ?? key
  }

  const ckItems = closing.order_items.filter(o => o.item_name !== '央廚配送')

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      {/* 標頭 */}
      <button
        className="w-full flex items-center gap-3 px-4 py-4 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
          {closing.stores?.name?.slice(0, 2) ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: '#18181b' }}>{closing.stores?.name}</p>
          <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>{y} 年 {dateLabel}</p>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0"
          style={{ background: st.bg, color: st.color }}>
          {st.label}
        </span>
        {expanded
          ? <ChevronUp className="h-4 w-4 shrink-0" style={{ color: '#a1a1aa' }} />
          : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: '#a1a1aa' }} />}
      </button>

      {expanded && (
        <div className="px-4 pb-5 space-y-4" style={{ borderTop: '1px solid #f4f4f5' }}>

          {/* 數字 */}
          <div className="grid grid-cols-2 gap-3 pt-4">
            {[
              { label: '總收入', val: closing.total_revenue, color: '#4338ca' },
              { label: '應繳金額', val: closing.expected_remit, color: '#047857' },
              { label: '央廚配送費', val: closing.total_cost, color: '#f97316' },
              { label: '差異', val: closing.variance, color: Math.abs(closing.variance) > 200 ? '#be123c' : '#047857' },
            ].map(({ label, val, color }) => (
              <div key={label} className="rounded-xl px-3 py-2.5" style={{ background: '#f8fafc', border: '1px solid #f4f4f5' }}>
                <p className="text-[11px] font-medium mb-0.5" style={{ color: '#a1a1aa' }}>{label}</p>
                <p className="text-lg font-bold tabular-nums" style={{ color }}>${fmt(val)}</p>
              </div>
            ))}
          </div>

          {/* 央廚品項 */}
          {ckItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Package className="h-3.5 w-3.5" style={{ color: '#f97316' }} />
                <p className="text-xs font-semibold" style={{ color: '#52525b' }}>央廚配送明細</p>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                {ckItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm"
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

          {/* 照片 */}
          {hasPhotos && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Camera className="h-3.5 w-3.5" style={{ color: '#6366f1' }} />
                <p className="text-xs font-semibold" style={{ color: '#52525b' }}>上傳照片</p>
              </div>
              <div className="space-y-3">
                {receiptPhotos.length > 0 && (
                  <div>
                    <p className="text-[11px] mb-2" style={{ color: '#a1a1aa' }}>收據 ({receiptPhotos.length} 張)</p>
                    <div className="flex flex-wrap gap-2">
                      {receiptPhotos.map(r => (
                        <PhotoThumb key={r.id} url={r.photo_url!} label={r.vendor_name || '收據'} />
                      ))}
                    </div>
                  </div>
                )}
                {ckPhoto && (
                  <div>
                    <p className="text-[11px] mb-2" style={{ color: '#a1a1aa' }}>央廚配送單</p>
                    <PhotoThumb url={ckPhoto} label="配送單" />
                  </div>
                )}
                {Object.keys(channelPhotos).length > 0 && (
                  <div>
                    <p className="text-[11px] mb-2" style={{ color: '#a1a1aa' }}>平台截圖</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(channelPhotos).map(([key, url]) => (
                        <PhotoThumb key={key} url={url as string} label={getChannelLabel(key)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {closing.note && (
            <p className="text-xs px-3 py-2 rounded-xl" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
              備註：{closing.note}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function ClosingsBrowser({ closings, receiptsByClosing, stores, month, storeId }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function navigate(newMonth: string, newStoreId: string) {
    const params = new URLSearchParams()
    if (newMonth) params.set('month', newMonth)
    if (newStoreId) params.set('storeId', newStoreId)
    startTransition(() => router.push(`/hq/closings?${params.toString()}`))
  }

  const [y, m] = month.split('-')

  return (
    <div className="space-y-4">
      {/* 篩選器 */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="month"
          defaultValue={month}
          onChange={e => navigate(e.target.value, storeId)}
          style={{
            height: '40px', padding: '0 12px',
            border: '1.5px solid #e4e4e7', borderRadius: '12px',
            fontSize: '14px', outline: 'none', background: 'white',
            fontFamily: 'inherit', color: '#18181b',
          }}
        />
        {stores.length > 1 && (
          <select
            defaultValue={storeId}
            onChange={e => navigate(month, e.target.value)}
            style={{
              height: '40px', padding: '0 12px',
              border: '1.5px solid #e4e4e7', borderRadius: '12px',
              fontSize: '14px', outline: 'none', background: 'white',
              fontFamily: 'inherit', color: '#18181b', minWidth: '120px',
            }}
          >
            <option value="">全部店家</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <div className="flex items-center text-sm" style={{ color: '#a1a1aa' }}>
          共 {closings.length} 筆
        </div>
      </div>

      {/* 帳目列表 */}
      {closings.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl" style={{ border: '1px solid #f4f4f5' }}>
          <Receipt className="h-10 w-10 mx-auto mb-3" style={{ color: '#d4d4d8' }} />
          <p className="text-sm font-medium" style={{ color: '#52525b' }}>
            {y} 年 {parseInt(m)} 月尚無帳目
          </p>
          <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>店長送出後會顯示在這裡</p>
        </div>
      ) : (
        <div className="space-y-3">
          {closings.map(c => (
            <ClosingCard
              key={c.id}
              closing={c}
              receipts={receiptsByClosing[c.id] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  )
}
