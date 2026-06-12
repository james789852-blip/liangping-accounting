'use client'

import { useState } from 'react'
import { ShoppingCart, ChevronDown, ChevronUp } from 'lucide-react'

interface ReceiptItem { id: string; item_name: string; amount: number; excel_column: string; item_category: string }
interface Receipt {
  id: string; business_date: string; vendor_name: string; receipt_type: string
  total_amount: number; tax_amount: number; photo_url: string; receipt_items: ReceiptItem[]
}

interface Props { storeName: string; storeId: string; today: string; month: string; receipts: Receipt[] }

const TYPE_LABEL: Record<string, string> = { invoice: '發票', receipt: '收據', delivery_note: '估價單' }

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

function VendorCard({ vendor, items }: { vendor: string; items: Receipt[] }) {
  const [expanded, setExpanded] = useState(false)
  const [photoId, setPhotoId] = useState<string | null>(null)
  const total = items.reduce((s, r) => s + r.total_amount, 0)
  const allItems = items.flatMap(r => r.receipt_items)
  const itemSummary = allItems.reduce<Record<string, number>>((acc, it) => {
    acc[it.item_name] = (acc[it.item_name] || 0) + it.amount
    return acc
  }, {})

  return (
    <div className="bg-white rounded-2xl overflow-hidden transition-all"
      style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <button className="w-full flex items-center gap-3 px-4 py-4 text-left"
        onClick={() => setExpanded(!expanded)}>
        <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: 'linear-gradient(135deg,#f97316,#f59e0b)' }}>
          {(vendor || '?').slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: '#18181b' }}>{vendor || '（未填廠商）'}</p>
          <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>
            {items.length} 筆 · {items.map(r => TYPE_LABEL[r.receipt_type] ?? r.receipt_type).filter((v, i, a) => a.indexOf(v) === i).join('、')}
          </p>
        </div>
        <span className="text-base font-bold tabular-nums shrink-0 mr-2" style={{ color: '#18181b' }}>${fmt(total)}</span>
        {expanded
          ? <ChevronUp className="h-[18px] w-[18px] shrink-0" style={{ color: '#a1a1aa' }} />
          : <ChevronDown className="h-[18px] w-[18px] shrink-0" style={{ color: '#a1a1aa' }} />
        }
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 space-y-4" style={{ borderTop: '1px solid #f4f4f5' }}>
          {Object.keys(itemSummary).length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#a1a1aa' }}>品項彙總</p>
              <div className="space-y-1.5">
                {Object.entries(itemSummary).map(([name, amt]) => (
                  <div key={name} className="flex justify-between items-center">
                    <span className="text-sm" style={{ color: '#52525b' }}>{name}</span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: '#18181b' }}>${fmt(amt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#a1a1aa' }}>單據明細</p>
            <div className="space-y-2">
              {items.map(r => (
                <div key={r.id}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: '#52525b' }}>
                      {r.business_date.slice(5)} {TYPE_LABEL[r.receipt_type] ?? r.receipt_type}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums" style={{ color: '#18181b' }}>${fmt(r.total_amount)}</span>
                      {r.photo_url && (
                        <button onClick={() => setPhotoId(photoId === r.id ? null : r.id)}
                          className="text-xs font-medium px-2 py-0.5 rounded-lg"
                          style={{ background: '#FFFBEB', color: '#92400E' }}>
                          {photoId === r.id ? '收起' : '照片'}
                        </button>
                      )}
                    </div>
                  </div>
                  {photoId === r.id && r.photo_url && (
                    <img src={r.photo_url} alt="receipt"
                      className="w-full max-h-56 object-contain rounded-xl mt-2"
                      style={{ background: '#f8fafc', border: '1px solid #f4f4f5' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OrderClient({ storeName, storeId, today, month, receipts }: Props) {
  const monthTotal = receipts.reduce((s, r) => s + r.total_amount, 0)
  const [y, m] = month.split('-')

  const byVendor = receipts.reduce<Record<string, Receipt[]>>((acc, r) => {
    const v = r.vendor_name || '（未填廠商）'
    if (!acc[v]) acc[v] = []
    acc[v].push(r)
    return acc
  }, {})

  const vendors = Object.entries(byVendor).sort((a, b) =>
    b[1].reduce((s, r) => s + r.total_amount, 0) - a[1].reduce((s, r) => s + r.total_amount, 0)
  )

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* 頁首 */}
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between max-w-xl mx-auto">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
              <ShoppingCart className="h-3.5 w-3.5" />
              叫貨明細
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>
              {storeName}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>{parseInt(y)} 年 {parseInt(m)} 月</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4 pb-28">

        {/* 月份統計 */}
        {vendors.length > 0 && (
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: '#18181b' }}>本月叫貨統計</p>
              <p className="text-xl font-bold tabular-nums" style={{ color: '#f97316' }}>${fmt(monthTotal)}</p>
            </div>
            <div className="space-y-2">
              {vendors.map(([vendor, items]) => {
                const vtotal = items.reduce((s, r) => s + r.total_amount, 0)
                const pct = Math.round((vtotal / monthTotal) * 100)
                return (
                  <div key={vendor}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: '#52525b' }}>{vendor}</span>
                      <span className="text-xs font-semibold tabular-nums" style={{ color: '#18181b' }}>${fmt(vtotal)}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#f97316,#f59e0b)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 廠商卡片 */}
        {vendors.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-20 w-20 rounded-3xl flex items-center justify-center mx-auto mb-4"
              style={{ background: '#f1f5f9' }}>
              <ShoppingCart className="h-9 w-9" style={{ color: '#a1a1aa' }} />
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: '#52525b' }}>本月尚無叫貨紀錄</p>
            <p className="text-xs" style={{ color: '#a1a1aa' }}>請至「發票收據」頁面上傳收據</p>
          </div>
        ) : (
          vendors.map(([vendor, items]) => (
            <VendorCard key={vendor} vendor={vendor} items={items} />
          ))
        )}

      </div>
    </div>
  )
}
