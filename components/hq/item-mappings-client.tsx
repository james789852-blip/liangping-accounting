'use client'

import { useState, useTransition, useEffect } from 'react'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import {
  deleteItemMapping, updateItemMapping, saveItemMapping, copyGlobalMappingsToStore, reorderItemMappings,
} from '@/app/actions/item-mappings'
import { useRouter } from 'next/navigation'
import { Trash2, Edit2, Check, X, Plus, Tag, Copy, ChevronLeft, ChevronUp, ChevronDown } from 'lucide-react'

interface Mapping {
  id: string; item_name: string; excel_column: string; item_category: string; store_id?: string | null; vendor_group?: string | null
}

const CAT_STYLE: Record<string, { bg: string; color: string }> = {
  '食材': { bg: '#d1fae5', color: '#047857' },
  '耗材': { bg: '#FFFBEB', color: '#92400E' },
  '雜項': { bg: '#f4f4f5', color: '#71717a' },
}

const VG_STYLE = { bg: '#FEF3C7', color: '#92400E' }
const VG_STYLE_UNCAT = { bg: '#f4f4f5', color: '#71717a' }
const VG_STYLE_DOC = { bg: '#DBEAFE', color: '#1E40AF' }
const DOC_TYPES = new Set(['發票', '收據', '估價單', '公司開'])

const SELECT_STYLE: React.CSSProperties = {
  height: '32px', padding: '0 8px', border: '1.5px solid #F59E0B', borderRadius: '8px',
  fontSize: '12px', background: 'white', outline: 'none', fontFamily: 'inherit',
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', height: '36px', padding: '0 10px', border: '1.5px solid #e4e4e7',
  borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white', fontFamily: 'inherit',
}

const SELECT_ADD_STYLE: React.CSSProperties = {
  width: '100%', height: '36px', padding: '0 8px', border: '1.5px solid #e4e4e7',
  borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white', fontFamily: 'inherit',
}

export default function ItemMappingsClient({
  mappings: initial,
  stores,
  selectedStoreId: initStoreId,
}: {
  mappings: Mapping[]
  stores: { id: string; name: string }[]
  selectedStoreId: string
}) {
  const [mappings, setMappings] = useState(initial)
  const [activeStoreId, setActiveStoreId] = useState(initStoreId)
  const [editId, setEditId] = useState<string | null>(null)
  const [editCol, setEditCol] = useState('')
  const [editCat, setEditCat] = useState('')
  const [editVendorGroup, setEditVendorGroup] = useState('')
  const [newName, setNewName] = useState('')
  const [newCol, setNewCol] = useState('')
  const [newCat, setNewCat] = useState('食材')
  const [showAdd, setShowAdd] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Sync from server after router.refresh()
  useEffect(() => { setMappings(initial) }, [initial])

  const displayMappings = activeStoreId === ''
    ? mappings.filter(m => !m.store_id)
    : mappings.filter(m => m.store_id === activeStoreId)

  const globalCount = mappings.filter(m => !m.store_id).length
  const isStorePage = activeStoreId !== ''

  function startEdit(m: Mapping) { setEditId(m.id); setEditCol(m.excel_column); setEditCat(m.item_category); setEditVendorGroup(m.vendor_group ?? '') }

  function handleUpdate(id: string) {
    startTransition(async () => {
      await updateItemMapping(id, editCol, editCat, editVendorGroup || null)
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
    const storeIdParam = activeStoreId || undefined
    startTransition(async () => {
      await saveItemMapping(newName.trim(), newCol, newCat, storeIdParam)
      setMappings(prev => [...prev, {
        id: `tmp-${Date.now()}`,
        item_name: newName.trim(),
        excel_column: newCol,
        item_category: newCat,
        store_id: storeIdParam ?? null,
      }])
      setShowAdd(false); setNewName(''); setNewCol(''); setNewCat('食材')
      router.refresh()
    })
  }

  function moveItem(vg: string, idx: number, direction: 'up' | 'down') {
    const items = grouped[vg]
    if (!items) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= items.length) return
    const reordered = [...items]
    ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
    // 找出該 vg 內的 ids 新順序，呼叫 server update sort_order
    startTransition(async () => {
      await reorderItemMappings(reordered.map(i => i.id))
      // 重新 fetch
      router.refresh()
    })
    // optimistic update: 把 mappings 內這 vg 對應的兩筆順序 swap
    setMappings(prev => {
      const next = [...prev]
      const idxA = next.findIndex(m => m.id === items[idx].id)
      const idxB = next.findIndex(m => m.id === items[newIdx].id)
      if (idxA >= 0 && idxB >= 0) {
        [next[idxA], next[idxB]] = [next[idxB], next[idxA]]
      }
      return next
    })
  }

  function handleCopyGlobal() {
    const storeName = stores.find(s => s.id === activeStoreId)?.name ?? '此店'
    if (!confirm(`確定要把全域對應（${globalCount} 筆）複製到「${storeName}」嗎？\n這會覆蓋此店現有的所有對應。`)) return
    startTransition(async () => {
      const result = await copyGlobalMappingsToStore(activeStoreId)
      if ('error' in result) { alert(result.error); return }
      router.refresh()
    })
  }

  // 顯示用：若 item_name 以 vendor_group 開頭就剝離前綴（"翁師傅其他" → "其他"）
  function displayName(m: Mapping): string {
    const vg = m.vendor_group?.trim()
    if (vg && m.item_name.startsWith(vg) && m.item_name !== vg) {
      return m.item_name.slice(vg.length)
    }
    return m.item_name
  }

  // 以 vendor_group 為主分類（無則歸「未分類」），分組內依 item_name 排序
  const grouped = displayMappings.reduce<Record<string, Mapping[]>>((acc, m) => {
    const vg = (m.vendor_group?.trim() || '未分類')
    if (!acc[vg]) acc[vg] = []
    acc[vg].push(m)
    return acc
  }, {})

  // 排序：文件類型分類（發票/收據/估價單/公司開）放在 vendor 後、未分類最後
  const groupOrder = Object.keys(grouped).sort((a, b) => {
    const rank = (g: string) => g === '未分類' ? 2 : DOC_TYPES.has(g) ? 1 : 0
    const ra = rank(a), rb = rank(b)
    if (ra !== rb) return ra - rb
    return a.localeCompare(b, 'zh-Hant')
  })

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* Header */}
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-2xl mx-auto">
          <button onClick={() => router.back()}
            className="flex items-center gap-1 text-sm font-medium mb-3"
            style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <ChevronLeft className="h-4 w-4" />上一頁
          </button>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
                <Tag className="h-3.5 w-3.5" />
                品項對應
              </div>
              <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>品項對應管理</h1>
              <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
                {isStorePage ? '此店自訂對應（優先於全域預設）' : '全域預設對應（適用所有店）'}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {isStorePage && globalCount > 0 && (
                <button onClick={handleCopyGlobal} disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{ background: 'white', border: '1.5px solid #FEF3C7', color: '#92400E' }}>
                  <Copy className="h-3.5 w-3.5" /> 複製全域
                </button>
              )}
              <button onClick={() => { setShowAdd(!showAdd); setNewName(''); setNewCol(''); setNewCat('食材') }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
                <Plus className="h-4 w-4" /> 新增
              </button>
            </div>
          </div>

          {/* Store tabs */}
          {stores.length > 0 && (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => { setActiveStoreId(''); setShowAdd(false); setEditId(null) }}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={activeStoreId === ''
                  ? { background: '#F59E0B', color: 'white' }
                  : { background: '#f4f4f5', color: '#52525b' }}>
                全域預設 ({globalCount})
              </button>
              {stores.map(s => {
                const count = mappings.filter(m => m.store_id === s.id).length
                return (
                  <button key={s.id}
                    onClick={() => { setActiveStoreId(s.id); setShowAdd(false); setEditId(null) }}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                    style={activeStoreId === s.id
                      ? { background: '#F59E0B', color: 'white' }
                      : { background: '#f4f4f5', color: '#52525b' }}>
                    {s.name} ({count})
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 pb-28">

        {/* Add form */}
        {showAdd && (
          <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1.5px solid #FEF3C7', boxShadow: '0 2px 8px rgba(245,158,11,0.12)' }}>
            <p className="text-sm font-semibold" style={{ color: '#92400E' }}>
              新增品項對應{isStorePage ? `（${stores.find(s => s.id === activeStoreId)?.name ?? '此店'} 專屬）` : '（全域）'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>品項名稱</label>
                <input style={INPUT_STYLE} value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：高麗菜" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>Excel 欄位</label>
                <select style={SELECT_ADD_STYLE} value={newCol} onChange={e => setNewCol(e.target.value)}>
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
                <select style={SELECT_ADD_STYLE} value={newCat} onChange={e => setNewCat(e.target.value)}>
                  <option>食材</option><option>耗材</option><option>雜項</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!newName.trim() || !newCol || isPending}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', opacity: !newName.trim() || !newCol || isPending ? 0.5 : 1 }}>
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

        {/* Empty state for store tab */}
        {isStorePage && displayMappings.length === 0 && !showAdd ? (
          <div className="text-center py-16">
            <p className="text-sm font-medium" style={{ color: '#a1a1aa' }}>此店尚無自訂品項對應</p>
            <p className="text-xs mt-1" style={{ color: '#d4d4d8' }}>自訂對應優先於全域預設</p>
            {globalCount > 0 && (
              <button onClick={handleCopyGlobal} disabled={isPending}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
                <Copy className="h-4 w-4" /> 從全域預設複製 ({globalCount} 筆)
              </button>
            )}
          </div>
        ) : null}

        {/* Mapping list — 以 vendor_group 為主分類 */}
        {groupOrder.map(vg => {
          const items = grouped[vg]
          const vgSt = vg === '未分類' ? VG_STYLE_UNCAT : DOC_TYPES.has(vg) ? VG_STYLE_DOC : VG_STYLE
          return (
            <div key={vg}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: vgSt.bg, color: vgSt.color }}>
                  {vg}
                </span>
                <span className="text-xs" style={{ color: '#a1a1aa' }}>{items.length} 項</span>
              </div>
              <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                {items.map((m, idx) => {
                  const catSt = CAT_STYLE[m.item_category] ?? CAT_STYLE['雜項']
                  const isFirst = idx === 0
                  const isLast = idx === items.length - 1
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5"
                      style={{ borderBottom: idx !== items.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                      <div className="flex flex-col shrink-0" style={{ width: 20 }}>
                        <button onClick={() => moveItem(vg, idx, 'up')} disabled={isFirst || isPending}
                          style={{ background: 'none', border: 'none', cursor: isFirst ? 'default' : 'pointer', color: isFirst ? '#e4e4e7' : '#a1a1aa', padding: 0, lineHeight: 0.8 }}>
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button onClick={() => moveItem(vg, idx, 'down')} disabled={isLast || isPending}
                          style={{ background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer', color: isLast ? '#e4e4e7' : '#a1a1aa', padding: 0, lineHeight: 0.8 }}>
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="flex-1 text-sm font-semibold" style={{ color: '#18181b' }}>{displayName(m)}</span>

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
                          <input placeholder="分類（廠商或發票）" value={editVendorGroup} onChange={e => setEditVendorGroup(e.target.value)}
                            style={{ height: '32px', padding: '0 8px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '12px', background: 'white', outline: 'none', fontFamily: 'inherit', width: '110px' }} />
                          <button onClick={() => handleUpdate(m.id)} style={{ color: '#047857' }}>
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditId(null)} style={{ color: '#a1a1aa' }}>
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: catSt.bg, color: catSt.color }}>{m.item_category}</span>
                          <span className="text-sm tabular-nums" style={{ color: '#71717a' }}>{m.excel_column}</span>
                          <button onClick={() => startEdit(m)} style={{ color: '#d4d4d8' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#F59E0B')}
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
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
