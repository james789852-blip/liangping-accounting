'use client'

import { useState } from 'react'
import { updateCKPrice } from '@/app/actions/ck-prices'
import { toast } from 'sonner'
import { Loader2, Pencil, Check, X } from 'lucide-react'

interface CKItem { id: string; item_name: string; unit_price: number; unit?: string; updated_at: string }

export default function CKPriceEditor({ items, priceHistory = [], canEdit }: { items: CKItem[]; priceHistory?: any[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [prices, setPrices] = useState<CKItem[]>(items)

  function startEdit(item: CKItem) {
    setEditing(item.id)
    setEditValue(String(item.unit_price))
    setEditUnit(item.unit || '份')
    setReason('')
  }

  function cancelEdit() { setEditing(null); setEditValue(''); setEditUnit(''); setReason('') }

  async function saveEdit(id: string) {
    const newPrice = parseFloat(editValue)
    if (isNaN(newPrice) || newPrice < 0) { toast.error('請輸入有效的金額'); return }
    setLoading(true)
    const result = await updateCKPrice(id, newPrice, reason, editUnit)
    if (result.error) { toast.error(result.error) }
    else {
      setPrices(prev => prev.map(p => p.id === id ? { ...p, unit_price: newPrice, unit: editUnit } : p))
      toast.success('已更新')
      setEditing(null)
    }
    setLoading(false)
  }

  return (
    <div>
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      {prices.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-4 px-4 py-3.5"
          style={{ borderBottom: idx !== prices.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: '#18181b' }}>{item.item_name}</p>
            <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>
              上次更新：{new Date(item.updated_at).toLocaleDateString('zh-TW')}
            </p>
          </div>

          {editing === item.id ? (
            <div className="flex items-center gap-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm" style={{ color: '#a1a1aa' }}>$</span>
                  <input
                    type="number" min="0" step="0.5" autoFocus
                    style={{ width: '80px', height: '34px', padding: '0 10px', border: '1.5px solid #F59E0B', borderRadius: '10px', fontSize: '14px', textAlign: 'right', outline: 'none', fontVariantNumeric: 'tabular-nums', boxShadow: '0 0 0 4px rgba(245,158,11,0.12)' }}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                  />
                  <span className="text-xs" style={{ color: '#a1a1aa' }}>／</span>
                  <input
                    placeholder="單位"
                    style={{ width: '52px', height: '34px', padding: '0 8px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', textAlign: 'center' }}
                    value={editUnit}
                    onChange={e => setEditUnit(e.target.value)}
                  />
                </div>
                <input
                  placeholder="異動原因（選填）"
                  style={{ width: '160px', height: '28px', padding: '0 8px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '12px', outline: 'none', fontFamily: 'inherit' }}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
              </div>
              <button onClick={() => saveEdit(item.id)} disabled={loading}
                className="p-1.5 rounded-lg"
                style={{ background: '#d1fae5', color: '#047857', opacity: loading ? 0.5 : 1 }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button onClick={cancelEdit} className="p-1.5 rounded-lg" style={{ background: '#f4f4f5', color: '#52525b' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: '#f4f4f5', color: '#71717a' }}>／{item.unit || '份'}</span>
              <span className="text-xl font-bold tabular-nums" style={{ color: '#18181b' }}>${item.unit_price}</span>
              {canEdit && (
                <button onClick={() => startEdit(item)} className="p-1.5 rounded-lg"
                  style={{ background: '#f4f4f5', color: '#a1a1aa' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FFFBEB'; (e.currentTarget as HTMLElement).style.color = '#92400E' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f4f4f5'; (e.currentTarget as HTMLElement).style.color = '#a1a1aa' }}>
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      </div>

      {priceHistory.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
            <p className="text-sm font-semibold" style={{ color: '#18181b' }}>最近單價變動紀錄</p>
          </div>
          {priceHistory.map((h: any, idx: number) => {
            const dateStr = h.changed_at || h.created_at
            const date = dateStr ? new Date(dateStr).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : '—'
            return (
              <div key={idx} className="px-4 py-3 flex items-start gap-3 text-sm"
                style={{ borderBottom: idx !== priceHistory.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                <span className="shrink-0 text-xs tabular-nums font-medium" style={{ color: '#a1a1aa', marginTop: '1px' }}>{date}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium" style={{ color: '#18181b' }}>{h.item_name}</span>
                  <span className="mx-1.5" style={{ color: '#a1a1aa' }}>
                    <span className="tabular-nums" style={{ color: '#71717a' }}>${h.old_price}</span>
                    <span className="mx-1" style={{ color: '#d4d4d8' }}>→</span>
                    <span className="tabular-nums font-semibold" style={{ color: '#92400E' }}>${h.new_price}</span>
                  </span>
                  {h.reason && (
                    <span className="text-xs" style={{ color: '#a1a1aa' }}>（{h.reason}）</span>
                  )}
                </div>
                {h.changed_by_name && (
                  <span className="shrink-0 text-xs" style={{ color: '#71717a' }}>
                    {h.changed_by_name}{h.changed_by_role && (
                      <span style={{ color: '#a1a1aa', marginLeft: 4 }}>· {h.changed_by_role}</span>
                    )}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
