'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface Order {
  id?: string
  order_number: string
  amount: number
  voided: boolean
  void_reason?: string
}

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

export default function HandwriteOrdersList({
  orders,
  initialOpen = false,
}: { orders: Order[]; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  const validCount = orders.filter(o => !o.voided && o.amount > 0).length
  const total = orders.filter(o => !o.voided).reduce((s, o) => s + o.amount, 0)

  return (
    <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-left">
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-xl flex items-center justify-center text-base" style={{ background: '#d1fae5' }}>📝</span>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: '#18181b' }}>手寫訂單</h3>
            <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
              共 {orders.length} 筆 · 有效 {validCount} 筆 · 合計 ${fmt(total)}
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: '#d1fae5', color: '#047857' }}>
          {open ? '收合' : '展開'}
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>

      {open && (
        <div className="space-y-1 mt-4">
          {orders.map(o => (
            <div key={o.id ?? o.order_number} className="flex justify-between items-center py-1.5" style={{ opacity: o.voided ? 0.4 : 1 }}>
              <span className="text-sm font-mono" style={{ color: '#52525b', textDecoration: o.voided ? 'line-through' : 'none' }}>
                {o.order_number}
              </span>
              <span className="text-sm font-medium tabular-nums" style={{ color: o.voided ? '#a1a1aa' : '#18181b' }}>
                {o.voided ? '作廢' : `$${fmt(o.amount)}`}
              </span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid #f4f4f5' }}>
            <span className="text-sm font-bold" style={{ color: '#18181b' }}>合計</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: '#10b981' }}>${fmt(total)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
