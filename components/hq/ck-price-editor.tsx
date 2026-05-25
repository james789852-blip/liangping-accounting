'use client'

import { useState } from 'react'
import { updateCKPrice } from '@/app/actions/ck-prices'
import { toast } from 'sonner'
import { Loader2, Pencil, Check, X } from 'lucide-react'

interface CKItem { id: string; item_name: string; unit_price: number; updated_at: string }

export default function CKPriceEditor({ items, canEdit }: { items: CKItem[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [prices, setPrices] = useState<CKItem[]>(items)

  function startEdit(item: CKItem) {
    setEditing(item.id)
    setEditValue(String(item.unit_price))
    setReason('')
  }

  function cancelEdit() { setEditing(null); setEditValue(''); setReason('') }

  async function saveEdit(id: string) {
    const newPrice = parseFloat(editValue)
    if (isNaN(newPrice) || newPrice < 0) { toast.error('請輸入有效的金額'); return }
    setLoading(true)
    const result = await updateCKPrice(id, newPrice, reason)
    if (result.error) { toast.error(result.error) }
    else {
      setPrices(prev => prev.map(p => p.id === id ? { ...p, unit_price: newPrice } : p))
      toast.success('單價已更新')
      setEditing(null)
    }
    setLoading(false)
  }

  return (
    <div>
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
                    style={{ width: '88px', height: '34px', padding: '0 10px', border: '1.5px solid #6366f1', borderRadius: '10px', fontSize: '14px', textAlign: 'right', outline: 'none', fontVariantNumeric: 'tabular-nums', boxShadow: '0 0 0 4px rgba(99,102,241,0.1)' }}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                  />
                </div>
                <input
                  placeholder="異動原因（選填）"
                  style={{ width: '136px', height: '28px', padding: '0 8px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '12px', outline: 'none', fontFamily: 'inherit' }}
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
              <span className="text-xl font-bold tabular-nums" style={{ color: '#18181b' }}>${item.unit_price}</span>
              {canEdit && (
                <button onClick={() => startEdit(item)} className="p-1.5 rounded-lg"
                  style={{ background: '#f4f4f5', color: '#a1a1aa' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#eef2ff'; (e.currentTarget as HTMLElement).style.color = '#4338ca' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f4f4f5'; (e.currentTarget as HTMLElement).style.color = '#a1a1aa' }}>
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
