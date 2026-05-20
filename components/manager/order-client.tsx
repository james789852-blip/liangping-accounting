'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ShoppingCart, ChevronDown, ChevronUp, Image, Download } from 'lucide-react'

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
  const [photoReceipt, setPhotoReceipt] = useState<string | null>(null)
  const total = items.reduce((s, r) => s + r.total_amount, 0)
  const allItems = items.flatMap(r => r.receipt_items)

  // Group items by name and sum amounts
  const itemSummary = allItems.reduce<Record<string, number>>((acc, it) => {
    acc[it.item_name] = (acc[it.item_name] || 0) + it.amount
    return acc
  }, {})

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">{vendor || '（未填廠商）'}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {items.length} 筆單據 · {items.map(r => TYPE_LABEL[r.receipt_type] ?? r.receipt_type).filter((v,i,a)=>a.indexOf(v)===i).join('、')}
          </p>
        </div>
        <span className="text-base font-bold tabular-nums text-slate-900">${fmt(total)}</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          {/* 品項彙總 */}
          {Object.keys(itemSummary).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">品項彙總</p>
              <div className="space-y-1">
                {Object.entries(itemSummary).map(([name, amt]) => (
                  <div key={name} className="flex justify-between text-sm">
                    <span className="text-slate-600">{name}</span>
                    <span className="tabular-nums font-medium">${fmt(amt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 每筆單據 */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5">單據明細</p>
            <div className="space-y-1.5">
              {items.map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs text-slate-500">
                  <span>{r.business_date.slice(5)} {TYPE_LABEL[r.receipt_type] ?? r.receipt_type}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-medium text-slate-700">${fmt(r.total_amount)}</span>
                    {r.photo_url && (
                      <button onClick={() => setPhotoReceipt(photoReceipt === r.id ? null : r.id)}
                        className="text-slate-300 hover:text-blue-500">
                        <Image className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 照片預覽 */}
          {photoReceipt && (() => {
            const r = items.find(x => x.id === photoReceipt)
            return r?.photo_url ? (
              <img src={r.photo_url} alt="receipt" className="w-full max-h-56 object-contain rounded-lg border border-slate-100 bg-slate-50" />
            ) : null
          })()}
        </div>
      )}
    </div>
  )
}

export default function OrderClient({ storeName, storeId, today, month, receipts }: Props) {
  const monthTotal = receipts.reduce((s, r) => s + r.total_amount, 0)

  // Group by vendor
  const byVendor = receipts.reduce<Record<string, Receipt[]>>((acc, r) => {
    const v = r.vendor_name || '（未填廠商）'
    if (!acc[v]) acc[v] = []
    acc[v].push(r)
    return acc
  }, {})

  const vendors = Object.entries(byVendor).sort((a, b) =>
    b[1].reduce((s, r) => s + r.total_amount, 0) - a[1].reduce((s, r) => s + r.total_amount, 0)
  )

  const [y, m] = month.split('-')

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4 pb-24">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-orange-500" /> 叫貨明細
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{storeName} · {y} 年 {parseInt(m)} 月</p>
        </div>
        <a
          href={`/api/export/food-cost?storeId=${storeId}&month=${month}`}
          className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
        >
          <Download className="h-4 w-4" /> 匯出 Excel
        </a>
      </div>

      {/* 月份統計 */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-500">本月叫貨總計</span>
          <span className="font-bold tabular-nums text-slate-800">${fmt(monthTotal)}</span>
        </div>
        <div className="space-y-1">
          {vendors.map(([vendor, items]) => (
            <div key={vendor} className="flex justify-between text-xs text-slate-500">
              <span>{vendor}</span>
              <span className="tabular-nums">${fmt(items.reduce((s, r) => s + r.total_amount, 0))}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 廠商卡片 */}
      {vendors.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>本月尚無叫貨紀錄</p>
          <p className="text-xs mt-1">請至「發票收據」頁面上傳收據</p>
        </div>
      ) : (
        vendors.map(([vendor, items]) => (
          <VendorCard key={vendor} vendor={vendor} items={items} />
        ))
      )}
    </div>
  )
}
