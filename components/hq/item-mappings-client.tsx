'use client'

import { useState, useTransition } from 'react'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import { deleteItemMapping, updateItemMapping, saveItemMapping } from '@/app/actions/item-mappings'
import { useRouter } from 'next/navigation'
import { Trash2, Edit2, Check, X, Plus, Tag } from 'lucide-react'

interface Mapping { id: string; item_name: string; excel_column: string; item_category: string }

const CAT_STYLE: Record<string, { bg: string; color: string }> = {
  '食材': { bg: '#d1fae5', color: '#047857' },
  '耗材': { bg: '#eef2ff', color: '#4338ca' },
  '雜項': { bg: '#f4f4f5', color: '#71717a' },
}

const SELECT_STYLE: React.CSSProperties = {
  height: '32px', padding: '0 8px', border: '1.5px solid #6366f1', borderRadius: '8px',
  fontSize: '12px', background: 'white', outline: 'none', fontFamily: 'inherit',
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

  function startEdit(m: Mapping) { setEditId(m.id); setEditCol(m.excel_column); setEditCat(m.item_category) }

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
      setShowAdd(false); setNewName(''); setNewCol(''); setNewCat('食材')
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
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-2xl mx-auto flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
              <Tag className="h-3.5 w-3.5" />
              品項對應
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>品項對應管理</h1>
            <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>管理收據品項與 Excel 欄位的對應關係</p>
          </div>
          <button onClick={() => setShowAdd(!showAdd)}
            className="mt-1 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
            <Plus className="h-4 w-4" /> 新增
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 pb-28">

        {showAdd && (
          <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1.5px solid #e0e7ff', boxShadow: '0 2px 8px rgba(99,102,241,0.1)' }}>
            <p className="text-sm font-semibold" style={{ color: '#4338ca' }}>新增品項對應</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>品項名稱</label>
                <input
                  style={{ width: '100%', height: '36px', padding: '0 10px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white', fontFamily: 'inherit' }}
                  value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：高麗菜" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>Excel 欄位</label>
                <select
                  style={{ width: '100%', height: '36px', padding: '0 8px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white', fontFamily: 'inherit' }}
                  value={newCol} onChange={e => setNewCol(e.target.value)}>
                  <option value="">請選擇</option>
                  {Object.entries(EXCEL_COLUMNS).map(([cat, cols]) => (
                    <optgroup key={cat} label={cat}>
                      {cols.map(col => <option key={col} value={col}>{col}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>類別</label>
                <select
                  style={{ width: '100%', height: '36px', padding: '0 8px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white', fontFamily: 'inherit' }}
                  value={newCat} onChange={e => setNewCat(e.target.value)}>
                  <option>食材</option><option>耗材</option><option>雜項</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!newName.trim() || !newCol || isPending}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', opacity: !newName.trim() || !newCol || isPending ? 0.5 : 1 }}>
                儲存
              </button>
              <button onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
                取消
              </button>
            </div>
          </div>
        )}

        {Object.entries(grouped).map(([cat, items]) => {
          const catSt = CAT_STYLE[cat] ?? CAT_STYLE['雜項']
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: catSt.bg, color: catSt.color }}>
                  {cat}
                </span>
                <span className="text-xs" style={{ color: '#a1a1aa' }}>{items.length} 項</span>
              </div>
              <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                {items.map((m, idx) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2.5"
                    style={{ borderBottom: idx !== items.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                    <span className="flex-1 text-sm font-semibold" style={{ color: '#18181b' }}>{m.item_name}</span>

                    {editId === m.id ? (
                      <>
                        <select style={SELECT_STYLE} value={editCol} onChange={e => setEditCol(e.target.value)}>
                          {Object.entries(EXCEL_COLUMNS).map(([c, cols]) => (
                            <optgroup key={c} label={c}>
                              {cols.map(col => <option key={col} value={col}>{col}</option>)}
                            </optgroup>
                          ))}
                        </select>
                        <select style={SELECT_STYLE} value={editCat} onChange={e => setEditCat(e.target.value)}>
                          <option>食材</option><option>耗材</option><option>雜項</option>
                        </select>
                        <button onClick={() => handleUpdate(m.id)} style={{ color: '#047857' }}>
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditId(null)} style={{ color: '#a1a1aa' }}>
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm tabular-nums" style={{ color: '#71717a' }}>{m.excel_column}</span>
                        <button onClick={() => startEdit(m)} style={{ color: '#d4d4d8' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#6366f1')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#d4d4d8')}>
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(m.id)} style={{ color: '#d4d4d8' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#be123c')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#d4d4d8')}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
