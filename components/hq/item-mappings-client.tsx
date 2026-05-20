'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import { deleteItemMapping, updateItemMapping, saveItemMapping } from '@/app/actions/item-mappings'
import { useRouter } from 'next/navigation'
import { Trash2, Edit2, Check, X, Plus, Tag } from 'lucide-react'

interface Mapping {
  id: string
  item_name: string
  excel_column: string
  item_category: string
}

const CAT_COLOR: Record<string, string> = {
  '食材': 'bg-green-100 text-green-700',
  '耗材': 'bg-blue-100 text-blue-700',
  '雜項': 'bg-slate-100 text-slate-600',
}

export default function ItemMappingsClient({ mappings: initial }: { mappings: Mapping[] }) {
  const [mappings, setMappings] = useState(initial)
  const [editId, setEditId] = useState<string | null>(null)
  const [editCol, setEditCol] = useState('')
  const [editCat, setEditCat] = useState('')
  const [newName, setNewName] = useState('')
  const [newCol, setNewCol] = useState('')
  const [newCat, setNewCat] = useState('食材')
  const [showAdd, setShowAdd] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function startEdit(m: Mapping) {
    setEditId(m.id)
    setEditCol(m.excel_column)
    setEditCat(m.item_category)
  }

  function handleUpdate(id: string) {
    startTransition(async () => {
      await updateItemMapping(id, editCol, editCat)
      setMappings(prev => prev.map(m => m.id === id ? { ...m, excel_column: editCol, item_category: editCat } : m))
      setEditId(null)
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    if (!confirm('確定要刪除此對應嗎？')) return
    startTransition(async () => {
      await deleteItemMapping(id)
      setMappings(prev => prev.filter(m => m.id !== id))
    })
  }

  function handleAdd() {
    if (!newName.trim() || !newCol) return
    startTransition(async () => {
      await saveItemMapping(newName.trim(), newCol, newCat)
      setShowAdd(false)
      setNewName('')
      setNewCol('')
      setNewCat('食材')
      router.refresh()
    })
  }

  const grouped = mappings.reduce<Record<string, Mapping[]>>((acc, m) => {
    const cat = m.item_category || '其他'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(m)
    return acc
  }, {})

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Tag className="h-5 w-5 text-blue-500" /> 品項對應管理
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">管理收據品項與 Excel 欄位的對應關係</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> 新增
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-800">新增品項對應</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">品項名稱</label>
              <input
                className="w-full h-9 px-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 bg-white"
                value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：高麗菜"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Excel 欄位</label>
              <select
                className="w-full h-9 px-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 bg-white"
                value={newCol} onChange={e => setNewCol(e.target.value)}
              >
                <option value="">請選擇</option>
                {Object.entries(EXCEL_COLUMNS).map(([cat, cols]) => (
                  <optgroup key={cat} label={cat}>
                    {cols.map(col => <option key={col} value={col}>{col}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">類別</label>
              <select
                className="w-full h-9 px-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 bg-white"
                value={newCat} onChange={e => setNewCat(e.target.value)}
              >
                <option>食材</option><option>耗材</option><option>雜項</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!newName.trim() || !newCol || isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              儲存
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">
              取消
            </button>
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-2">
            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', CAT_COLOR[cat] ?? CAT_COLOR['雜項'])}>
              {cat}
            </span>
            <span className="text-xs text-slate-400">{items.length} 項</span>
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            {items.map((m, idx) => (
              <div key={m.id} className={cn(
                'flex items-center gap-3 px-4 py-2.5',
                idx !== items.length - 1 && 'border-b border-slate-100'
              )}>
                <span className="flex-1 text-sm text-slate-700 font-medium">{m.item_name}</span>

                {editId === m.id ? (
                  <>
                    <select
                      className="h-8 px-2 text-xs rounded-lg border border-blue-300 outline-none bg-white"
                      value={editCol} onChange={e => setEditCol(e.target.value)}
                    >
                      {Object.entries(EXCEL_COLUMNS).map(([c, cols]) => (
                        <optgroup key={c} label={c}>
                          {cols.map(col => <option key={col} value={col}>{col}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <select
                      className="h-8 px-2 text-xs rounded-lg border border-blue-300 outline-none bg-white"
                      value={editCat} onChange={e => setEditCat(e.target.value)}
                    >
                      <option>食材</option><option>耗材</option><option>雜項</option>
                    </select>
                    <button onClick={() => handleUpdate(m.id)} className="text-green-600 hover:text-green-700">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditId(null)} className="text-slate-400">
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-slate-500 tabular-nums">{m.excel_column}</span>
                    <button onClick={() => startEdit(m)} className="text-slate-300 hover:text-blue-500">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(m.id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
