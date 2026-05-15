'use client'

import { useState } from 'react'
import { updateCKPrice } from '@/app/actions/ck-prices'
import { toast } from 'sonner'
import { Loader2, Pencil, Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface CKItem {
  id: string
  item_name: string
  unit_price: number
  updated_at: string
}

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

  function cancelEdit() {
    setEditing(null)
    setEditValue('')
    setReason('')
  }

  async function saveEdit(id: string) {
    const newPrice = parseFloat(editValue)
    if (isNaN(newPrice) || newPrice < 0) {
      toast.error('請輸入有效的金額')
      return
    }
    setLoading(true)
    const result = await updateCKPrice(id, newPrice, reason)
    if (result.error) {
      toast.error(result.error)
    } else {
      setPrices(prev => prev.map(p => p.id === id ? { ...p, unit_price: newPrice } : p))
      toast.success('單價已更新')
      setEditing(null)
    }
    setLoading(false)
  }

  return (
    <div className="divide-y divide-slate-100">
      {prices.map(item => (
        <div key={item.id} className="flex items-center gap-4 px-4 py-3">
          <div className="flex-1">
            <p className="font-medium text-sm text-slate-900">{item.item_name}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              上次更新：{new Date(item.updated_at).toLocaleDateString('zh-TW')}
            </p>
          </div>

          {editing === item.id ? (
            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-500">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    className="w-24 h-8 text-right tabular-nums text-sm"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    autoFocus
                  />
                </div>
                <Input
                  placeholder="異動原因（選填）"
                  className="w-36 h-7 text-xs"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
              </div>
              <button
                onClick={() => saveEdit(item.id)}
                disabled={loading}
                className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                onClick={cancelEdit}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold tabular-nums text-slate-900">
                ${item.unit_price}
              </span>
              {canEdit && (
                <button
                  onClick={() => startEdit(item)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
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
