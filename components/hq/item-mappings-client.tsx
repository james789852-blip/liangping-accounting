'use client'

import { useState, useTransition, useEffect, createContext, useContext } from 'react'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import {
  deleteItemMapping, updateItemMapping, saveItemMapping, copyGlobalMappingsToStore, reorderItemMappings,
} from '@/app/actions/item-mappings'
import { useRouter } from 'next/navigation'
import { Trash2, Edit2, Check, X, Plus, Tag, Copy, ChevronLeft, ChevronUp, ChevronDown, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import HelpBox from './help-box'
import {
  DndContext, closestCorners, rectIntersection, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Mapping {
  id: string; item_name: string; excel_column: string; item_category: string; store_id?: string | null; vendor_group?: string | null; doc_type_override?: string | null; is_refund?: boolean; vg_sort_order?: number
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
  vendorGroups = [],
  selectedStoreId: initStoreId,
}: {
  mappings: Mapping[]
  stores: { id: string; name: string }[]
  vendorGroups?: { id: string; name: string; sort_order: number; doc_type?: string | null }[]
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
  const [newVendorGroup, setNewVendorGroup] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showAddVg, setShowAddVg] = useState(false)
  const [sortMode, setSortMode] = useState(false)
  const [batchStoreIds, setBatchStoreIds] = useState<string[]>([])
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [inlineAddVg, setInlineAddVg] = useState<string | null>(null)
  const [inlineAddName, setInlineAddName] = useState('')
  const [newVgName, setNewVgName] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // 用 state 保存 vendorGroups，允許 optimistic update
  const [vgsState, setVgsState] = useState(vendorGroups)
  // 剛新增、尚無品項的空類別（不在 displayMappings 裡），用來讓 UI 立即顯示空分類
  const [pendingVgs, setPendingVgs] = useState<string[]>([])

  // Sync from server after router.refresh()
  useEffect(() => { setMappings(initial) }, [initial])
  useEffect(() => { setVgsState(vendorGroups) }, [vendorGroups])

  // Drag-and-drop sensors — 桌面觸發距離小 + 手機 delay 縮短
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // 品項排序
    const activeItem = displayMappings.find(m => m.id === active.id)
    if (!activeItem) return
    const activeVg = activeItem.vendor_group ?? '未分類'
    // 判斷 over 是別的 item 還是 vg group header
    const overIsVg = String(over.id).startsWith('vg-')
    const overVg = overIsVg
      ? String(over.id).slice(3)
      : (displayMappings.find(m => m.id === over.id)?.vendor_group ?? '未分類')

    // 跨 vg：把 item 的 vendor_group 改為 overVg
    if (activeVg !== overVg) {
      setMappings(prev => prev.map(m => m.id === active.id ? { ...m, vendor_group: overVg } : m))
      updateItemMapping(active.id as string, activeItem.excel_column, activeItem.item_category, overVg)
        .then(r => { if (r && 'error' in r) toast.error('改廠商失敗：' + r.error) })
        .catch(e => toast.error('改廠商失敗：' + (e instanceof Error ? e.message : String(e))))
      toast.success(`已改到「${overVg}」`)
      return
    }
    if (overIsVg) return
    const vgItems = (grouped[activeVg] ?? [])
    const oldIdx = vgItems.findIndex(m => m.id === active.id)
    const newIdx = vgItems.findIndex(m => m.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(vgItems, oldIdx, newIdx)
    // 為 reordered 賦新 sort_order → 讓 displayMappings.sort(sortByOrder) 能反映新順序
    const withOrder = reordered.map((m, i) => ({ ...m, sort_order: (i + 1) * 10 } as any))
    setMappings(prev => {
      const otherItems = prev.filter(m => !reordered.some(r => r.id === m.id))
      return [...otherItems, ...withOrder]
    })
    reorderItemMappings(reordered.map(i => i.id))
      .then(r => { if (r && 'error' in r) toast.error('排序儲存失敗：' + r.error) })
      .catch(e => toast.error('排序儲存失敗：' + (e instanceof Error ? e.message : String(e))))
  }

  // 店家 tab 顯示 = 該店 override + 未被 override 的全域繼承（即 xlsx 實際會用到的完整品項清單）
  // 全域 tab 只顯示全域 mapping
  // 依 sort_order 排序（不分專屬/全域），確保拖曳排序能正確反映
  const sortByOrder = (a: Mapping, b: Mapping) =>
    ((a as any).sort_order ?? 999999) - ((b as any).sort_order ?? 999999)
  const displayMappings = activeStoreId === ''
    ? mappings.filter(m => !m.store_id).sort(sortByOrder)
    : (() => {
        const storeOverride = mappings.filter(m => m.store_id === activeStoreId)
        const overriddenNames = new Set(storeOverride.map(m => m.item_name))
        const globalInherited = mappings.filter(m => !m.store_id && !overriddenNames.has(m.item_name))
        return [...storeOverride, ...globalInherited].sort(sortByOrder)
      })()

  const globalCount = mappings.filter(m => !m.store_id).length
  const isStorePage = activeStoreId !== ''

  function startEdit(m: Mapping) { setEditId(m.id); setEditCol(m.excel_column); setEditCat(m.item_category); setEditVendorGroup(m.vendor_group ?? '') }

  function handleUpdate(id: string) {
    // optimistic：UI 立刻關閉編輯態並更新顯示
    setMappings(prev => prev.map(m => m.id === id ? { ...m, excel_column: editCol, item_category: editCat, vendor_group: editVendorGroup || null } : m))
    setEditId(null)
    updateItemMapping(id, editCol, editCat, editVendorGroup || null).catch(e => {
      toast.error('儲存失敗：' + (e instanceof Error ? e.message : String(e)))
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
    if (!newName.trim()) return
    const excelCol = newCol.trim() || newName.trim()
    startTransition(async () => {
      // 若在全域頁且勾了店家 → 批次建立 store-specific mapping（不建全域）
      // 若在全域頁沒勾店家 → 建全域 mapping（store_id=null）
      // 若在店家頁 → 只建該店 mapping
      const targets: (string | undefined)[] = activeStoreId
        ? [activeStoreId]
        : (batchStoreIds.length > 0 ? batchStoreIds : [undefined])
      const results = await Promise.all(
        targets.map(sid => saveItemMapping(newName.trim(), excelCol, newCat, sid, newVendorGroup.trim() || undefined))
      )
      const errors = results.filter((r): r is { error: string } => !!(r as any)?.error)
      if (errors.length > 0) {
        toast.error(`新增失敗：${errors.map(e => e.error).join('；')}`)
        return
      }
      // Optimistic：若 auto-create 了新 vg，立即加入 vgsState
      for (const r of results) {
        const newVg = (r as any)?.newVg as { id: string; name: string; sort_order: number } | null | undefined
        if (newVg) {
          setVgsState(prev => prev.some(v => v.id === newVg.id) ? prev : [...prev, { ...newVg, doc_type: null }])
        }
      }
      toast.success(`已新增到 ${targets.length} 個位置`)
      setShowAdd(false); setNewName(''); setNewCol(''); setNewCat('食材'); setNewVendorGroup(''); setBatchStoreIds([])
      router.refresh()
    })
  }

  function moveItem(vg: string, idx: number, direction: 'up' | 'down') {
    const items = grouped[vg]
    if (!items) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= items.length) return
    // optimistic update — UI 立即反應
    setMappings(prev => {
      const next = [...prev]
      const idxA = next.findIndex(m => m.id === items[idx].id)
      const idxB = next.findIndex(m => m.id === items[newIdx].id)
      if (idxA >= 0 && idxB >= 0) {
        [next[idxA], next[idxB]] = [next[idxB], next[idxA]]
      }
      return next
    })
    // fire-and-forget server update（不 refresh，避免重 fetch 整頁拖慢）
    const reorderedIds = [...items]
    ;[reorderedIds[idx], reorderedIds[newIdx]] = [reorderedIds[newIdx], reorderedIds[idx]]
    reorderItemMappings(reorderedIds.map(i => i.id))
      .then(r => {
        if (r && 'error' in r) toast.error('排序儲存失敗：' + r.error)
      })
      .catch(e => {
        toast.error('排序儲存失敗：' + (e instanceof Error ? e.message : String(e)))
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

  // UI 直接顯示完整 item_name（不剝 vg 前綴），避免「你看到什麼 vs 實際名字」的混淆
  // xlsx 匯出時另有 displayHeader 邏輯剝離前綴（保持 xlsx layout 整齊）
  function displayName(m: Mapping): string {
    return m.item_name
  }

  // 以 vendor_group 為主分類（無則歸「未分類」），分組內依 item_name 排序
  const grouped = displayMappings.reduce<Record<string, Mapping[]>>((acc, m) => {
    const vg = (m.vendor_group?.trim() || '未分類')
    if (!acc[vg]) acc[vg] = []
    acc[vg].push(m)
    return acc
  }, {})
  // 新增後尚無品項的空類別也要顯示
  for (const vg of pendingVgs) {
    if (!grouped[vg]) grouped[vg] = []
  }

  // 排序：優先用 system_vendor_groups.sort_order（對齊各店 Excel 順序），
  //       不在 system_vendor_groups 內的分類往後排
  const vgSortMap = new Map(vgsState.map(v => [v.name, v.sort_order] as const))
  const groupOrder = Object.keys(grouped).sort((a, b) => {
    const sa = vgSortMap.has(a) ? vgSortMap.get(a)! : 99999
    const sb = vgSortMap.has(b) ? vgSortMap.get(b)! : 99999
    if (sa !== sb) return sa - sb
    // 同 sort_order：未分類最後 / 文件類型次後
    const rank = (g: string) => g === '未分類' ? 2 : DOC_TYPES.has(g) ? 1 : 0
    const ra = rank(a), rb = rank(b)
    if (ra !== rb) return ra - rb
    return a.localeCompare(b, 'zh-Hant')
  })

  function handleAddVendorGroup() {
    const name = newVgName.trim()
    if (!name) return
    startTransition(async () => {
      const { createVendorGroup } = await import('@/app/actions/system-config')
      const maxSort = Math.max(0, ...vgsState.map(v => v.sort_order ?? 0))
      const sort = maxSort + 10
      const r = await createVendorGroup({ name, kind: 'vendor', sort_order: sort })
      if ('error' in r && r.error) {
        toast.error(r.error)
        return
      }
      // Optimistic：立即把新 vg 加入 local state，UI 立刻有排序 / 單據下拉 / rename
      if ('id' in r && r.id) {
        setVgsState(prev => prev.some(v => v.name === name) ? prev : [...prev, { id: r.id!, name, sort_order: sort, doc_type: null }])
      }
      // 讓這個「還沒品項」的空類別在該店立即顯示，使用者才能在底下加品項
      setPendingVgs(prev => prev.includes(name) ? prev : [...prev, name])
      toast.success(`已新增分類「${name}」，可在底下「加品項」`)
      setShowAddVg(false)
      setNewVgName('')
      // 不 router.refresh()：避免整頁重載造成畫面亂跳；空類別已由 pendingVgs 即時顯示
    })
  }

  function moveVendorGroup(vgName: string, direction: 'up' | 'down') {
    const idx = groupOrder.indexOf(vgName)
    if (idx < 0) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= groupOrder.length) return
    const reordered = [...groupOrder]
    ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
    const ids = reordered.map(name => vgsState.find(v => v.name === name)?.id).filter((x): x is string => !!x)
    if (ids.length === 0) return
    // optimistic：更新 local vgsState.sort_order
    setVgsState(prev => prev.map(v => {
      const i = ids.indexOf(v.id)
      return i >= 0 ? { ...v, sort_order: (i + 1) * 10 } : v
    }))
    // fire-and-forget server update
    import('@/app/actions/system-config').then(({ reorderVendorGroups }) => {
      reorderVendorGroups(ids)
        .then(r => {
          if (r && 'error' in r) toast.error('分類排序失敗：' + r.error)
        })
        .catch(e => {
          toast.error('分類排序失敗：' + (e instanceof Error ? e.message : String(e)))
        })
    })
  }

  async function handleBatchDelete() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!confirm(`確定刪除 ${ids.length} 個品項？此動作無法復原。`)) return
    startTransition(async () => {
      const { batchDeleteItemMappings } = await import('@/app/actions/item-mappings')
      const r = await batchDeleteItemMappings(ids)
      if (r && 'error' in r) { toast.error(r.error); return }
      toast.success(`已刪除 ${(r as any).deleted ?? ids.length} 個品項`)
      setSelectedIds(new Set())
      setSelectMode(false)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col" style={{ background: '#fafafa', height: '100dvh' }}>

      {/* 浮動選取工具列 */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg"
          style={{ background: 'white', border: '1.5px solid #fecaca', boxShadow: '0 8px 24px rgba(220,38,38,0.15)' }}>
          <span className="text-sm font-semibold" style={{ color: '#18181b' }}>已選 {selectedIds.size} 個品項</span>
          <button onClick={() => setSelectedIds(new Set())}
            className="text-xs font-semibold px-2 py-1 rounded-lg"
            style={{ background: '#fafafa', border: '1px solid #e4e4e7', color: '#52525b', cursor: 'pointer' }}>清除</button>
          <button onClick={handleBatchDelete} disabled={isPending}
            className="text-xs font-semibold px-3 py-1 rounded-lg text-white flex items-center gap-1"
            style={{ background: '#dc2626', cursor: 'pointer', opacity: isPending ? 0.5 : 1 }}>
            <Trash2 className="h-3 w-3" /> 刪除選中
          </button>
        </div>
      )}

      {/* 新增分類 modal */}
      {showAddVg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddVg(false) }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 space-y-3"
            style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold" style={{ color: '#18181b' }}>新增廠商分類</h2>
              <button onClick={() => setShowAddVg(false)} className="p-1.5 rounded-lg"
                style={{ color: '#a1a1aa', background: '#f4f4f5', border: 'none', cursor: 'pointer' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>分類名稱</label>
              <input value={newVgName} onChange={e => setNewVgName(e.target.value)} autoFocus
                placeholder="例：豆腐商 / 滷肉廠商 / 蛋商"
                style={INPUT_STYLE}
                onKeyDown={e => {
                  // 中文 IME 組字期間 Enter 是選字用，不能觸發提交
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault()
                    handleAddVendorGroup()
                  }
                }} />
              <p className="text-[11px] mt-1.5" style={{ color: '#a1a1aa' }}>新增後可在分類列表用上下箭頭調整位置（影響 Excel 匯出順序）</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddVg(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
                取消
              </button>
              <button onClick={handleAddVendorGroup} disabled={!newVgName.trim() || isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', opacity: (!newVgName.trim() || isPending) ? 0.5 : 1 }}>
                新增
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header (固定不滑動) */}
      <div className="bg-white px-4 md:px-6 py-4 md:py-5 shrink-0" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', zIndex: 40 }}>
        <div className="max-w-2xl mx-auto">
          <button onClick={() => router.back()}
            className="flex items-center gap-1 text-sm font-medium mb-3"
            style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <ChevronLeft className="h-4 w-4" />上一頁
          </button>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
                <Tag className="h-3.5 w-3.5" />
                品項對應
              </div>
              <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>品項對應管理</h1>
              <p className="text-xs md:text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
                各店專屬品項對應 — Excel 匯出實際會用到的品項
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => { setSortMode(v => !v); setSelectMode(false) }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={sortMode
                  ? { background: '#F59E0B', color: 'white', boxShadow: '0 2px 8px rgba(245,158,11,0.3)' }
                  : { background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b' }}
                title={sortMode ? '完成排序' : '進入排序模式（避免誤觸）'}>
                {sortMode ? <><Check className="h-3.5 w-3.5" /> 完成</> : <><ChevronUp className="h-3.5 w-3.5" /> 排序</>}
              </button>
              <button onClick={() => { setSelectMode(v => !v); setSortMode(false); if (selectMode) setSelectedIds(new Set()) }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={selectMode
                  ? { background: '#dc2626', color: 'white', boxShadow: '0 2px 8px rgba(220,38,38,0.3)' }
                  : { background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b' }}
                title={selectMode ? '取消選取' : '進入選取模式（可批次刪除）'}>
                {selectMode ? <><X className="h-3.5 w-3.5" /> 取消</> : <><Check className="h-3.5 w-3.5" /> 選取</>}
              </button>
              <CopyToStoreButton fromStoreId={activeStoreId} stores={stores} />
              <button onClick={() => setShowAddVg(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'white', border: '1.5px solid #E0F2FE', color: '#0369A1' }}>
                <Tag className="h-3.5 w-3.5" /> 新增分類
              </button>
              <button onClick={() => { setShowAdd(!showAdd); setNewName(''); setNewCol(''); setNewCat('食材') }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
                <Plus className="h-4 w-4" /> 新增品項
              </button>
            </div>
          </div>

          {/* Store tabs（全域已廢除，一律該店專屬） */}
          {stores.length > 0 && (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
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

      <div className="max-w-2xl mx-auto px-2 md:px-4 py-3 md:py-5 space-y-4 md:space-y-5 pb-28 flex-1 overflow-y-auto w-full" id="mappings-scroll">

        {false && (
        <HelpBox title="📖 這頁怎麼用？（直接決定 Excel 匯出）">
          <p className="font-semibold" style={{ color: '#7c2d12' }}>此頁決定「食耗成本 Excel」的每一欄！設錯 → 數字對不上原檔。</p>

          <div className="rounded-lg p-3 mt-2" style={{ background: 'white' }}>
            <p className="font-bold mb-1.5">🎯 三個核心設定與 Excel 對應</p>
            <ul className="space-y-1 list-none">
              <li>1. <b>廠商群組</b>（vendor_group）→ Excel <b>Row 1</b>（例：央廚配送 / 菜商 / 雜貨 / 免洗）</li>
              <li>2. <b>單據類型</b>（doc_type）→ Excel <b>Row 2</b>（例：發票 / 收據 / 公司開 / 梁鑫開）</li>
              <li>3. <b>品項名稱</b>（item_name）→ Excel <b>Row 3</b>（例：雞肉 / 好吃醬 / 油菜）</li>
            </ul>
          </div>

          <div className="rounded-lg p-3 mt-2" style={{ background: 'white' }}>
            <p className="font-bold mb-1.5">🔧 主要操作</p>
            <ul className="space-y-1 list-disc list-inside">
              <li><b>調整欄位順序</b>：用「↑↓」箭頭排序，會**直接影響 Excel 從左到右的順序**</li>
              <li><b>新增分類</b>：點右上角「新增分類」按鈕（Row 1 廠商群組多一欄）</li>
              <li><b>新增品項</b>：點右上角「新增品項」按鈕（Row 3 多一欄品項）</li>
              <li><b>設分類（食/耗/雜）</b>：影響 Excel「食材小計 / 耗材小計 / 雜項小計」加總</li>
              <li><b>Excel 欄名</b>：填入該品項的 Excel 欄位標題（通常跟品項名一致）</li>
            </ul>
          </div>

          <div className="rounded-lg p-3 mt-2" style={{ background: '#fee2e2', color: '#991b1b' }}>
            <p className="font-bold">⚠️ 重要提醒</p>
            <ul className="space-y-0.5 list-disc list-inside mt-1">
              <li>「新增／刪除品項」= Excel 該欄會出現 / 消失</li>
              <li>店面收據錄入時，店長選的品項會自動對應到這裡設定的欄位</li>
              <li>設完後可到「店家總覽」的「匯出 Excel」預覽</li>
            </ul>
          </div>

          <div className="rounded-lg p-3 mt-2" style={{ background: '#e0f2fe' }}>
            <p className="font-bold mb-1">📝 建議設定步驟</p>
            <ol className="space-y-0.5 list-decimal list-inside">
              <li>先「新增分類」建好所有廠商群組（Row 1）</li>
              <li>用「↑↓」把廠商群組排到跟原本 Excel 一樣的順序</li>
              <li>在每個分類下「新增品項」加入該廠商賣的所有品項（Row 3）</li>
              <li>用「↑↓」在每個分類內把品項排好順序</li>
              <li>設定各品項的「單據類型」+「食/耗/雜」</li>
              <li>到「店家總覽」試匯出 Excel，看是否對得上原檔</li>
            </ol>
          </div>

          <div className="rounded-lg p-3 mt-2" style={{ background: '#fef3c7', color: '#92400e' }}>
            <p className="font-bold mb-1">➕ 新增系統沒有的品項（例：娃娃菜）</p>
            <p className="mb-1">「Excel 欄位」欄可直接**打新的欄名**，不用非要選預設清單裡的！</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>品項名稱：<b>娃娃菜</b></li>
              <li>Excel 欄位：<b>留空</b>（系統自動用「娃娃菜」）或自己打「娃娃菜」</li>
              <li>類別：食材</li>
              <li>廠商分類：菜商</li>
            </ul>
            <p className="mt-1">Excel 匯出時會**自動多一欄「娃娃菜」**，落在你設定的 Row 1 廠商 + Row 2 單據下。</p>
            <p className="mt-1">💡 若想把「娃娃菜」的金額**合併**到既有欄（例：「大陸妹」），把 Excel 欄位選成「大陸妹」即可。</p>
          </div>
        </HelpBox>
        )}

        {/* Add form */}
        {showAdd && (
          <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1.5px solid #FEF3C7', boxShadow: '0 2px 8px rgba(245,158,11,0.12)' }}>
            <p className="text-sm font-semibold" style={{ color: '#92400E' }}>
              新增品項對應{isStorePage ? `（${stores.find(s => s.id === activeStoreId)?.name ?? '此店'} 專屬）` : '（全域）'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>品項名稱</label>
                <input style={INPUT_STYLE} value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：高麗菜" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>廠商分類</label>
                <input style={INPUT_STYLE} value={newVendorGroup} onChange={e => setNewVendorGroup(e.target.value)}
                  list="vg-list" placeholder="例：菜商 / 雜貨 / 免洗 / 小雲" />
                <datalist id="vg-list">
                  {[...new Set(mappings.map(m => m.vendor_group).filter(Boolean) as string[])].sort().map(v => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>
                  Excel 欄位 <span className="text-[10px]" style={{ color: '#a1a1aa' }}>（可打新的，通常跟品項同名）</span>
                </label>
                <input list="excel-col-list" style={SELECT_ADD_STYLE}
                  value={newCol} onChange={e => setNewCol(e.target.value)}
                  placeholder={newName.trim() ? `留空預設為「${newName.trim()}」` : '選預設或自訂'} />
                <datalist id="excel-col-list">
                  {/* 系統預設欄位 */}
                  {Object.entries(EXCEL_COLUMNS).flatMap(([, cols]) => cols).map(col => (
                    <option key={`preset-${col}`} value={col} />
                  ))}
                  {/* 已存在的自訂欄位（來自現有 mappings） */}
                  {[...new Set(mappings.map(m => m.excel_column).filter(Boolean))].map(col => (
                    <option key={`existing-${col}`} value={col} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>類別</label>
                <select style={SELECT_ADD_STYLE} value={newCat} onChange={e => setNewCat(e.target.value)}>
                  <option>食材</option><option>耗材</option><option>雜項</option>
                </select>
              </div>
            </div>
            {/* 全域頁專屬：批次選店 */}
            {!isStorePage && (
              <div className="rounded-lg p-3" style={{ background: '#fefce8', border: '1.5px solid #fde68a' }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold" style={{ color: '#713f12' }}>
                    套用到店家（{batchStoreIds.length > 0 ? `${batchStoreIds.length} 家店` : '不勾＝建全域'}）
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setBatchStoreIds(stores.map(s => s.id))}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded"
                      style={{ background: 'white', border: '1px solid #fbbf24', color: '#92400e', cursor: 'pointer' }}>全選</button>
                    <button type="button" onClick={() => setBatchStoreIds([])}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded"
                      style={{ background: 'white', border: '1px solid #e4e4e7', color: '#71717a', cursor: 'pointer' }}>清除</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {stores.map(s => {
                    const checked = batchStoreIds.includes(s.id)
                    return (
                      <button key={s.id} type="button"
                        onClick={() => setBatchStoreIds(prev => checked ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                        className="text-xs px-2.5 py-1 rounded-full font-semibold transition-colors"
                        style={checked
                          ? { background: '#F59E0B', color: 'white', border: '1.5px solid #F59E0B' }
                          : { background: 'white', color: '#52525b', border: '1.5px solid #e4e4e7' }}>
                        {checked ? '✓ ' : ''}{s.name}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] mt-2" style={{ color: '#a1a1aa' }}>
                  💡 不勾任何店家 → 建全域預設（所有店繼承）；勾了店家 → 只建到勾選店家的專屬 mapping
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!newName.trim() || isPending}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', opacity: !newName.trim() || isPending ? 0.5 : 1 }}>
                儲存{!isStorePage && batchStoreIds.length > 0 && `（${batchStoreIds.length} 家）`}
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
        <DndContext sensors={sensors}
          collisionDetection={(args) => {
            // rectIntersection 找出所有跟拖曳矩形重疊的目標
            // 再從中選 y 座標最接近的（拖到哪就對到哪）
            const intersections = rectIntersection(args)
            if (intersections.length > 0) {
              const activeRect = args.active.rect.current.translated
              if (!activeRect) return intersections
              const activeCenterY = activeRect.top + activeRect.height / 2
              intersections.sort((a, b) => {
                const ra = args.droppableRects.get(a.id)
                const rb = args.droppableRects.get(b.id)
                if (!ra || !rb) return 0
                return Math.abs((ra.top + ra.height / 2) - activeCenterY)
                     - Math.abs((rb.top + rb.height / 2) - activeCenterY)
              })
              return [intersections[0]]
            }
            return closestCorners(args)
          }}
          onDragEnd={handleDragEnd}>
        {groupOrder.map((vg, vgIdx) => {
          const items = grouped[vg]
          const vgSt = vg === '未分類' ? VG_STYLE_UNCAT : DOC_TYPES.has(vg) ? VG_STYLE_DOC : VG_STYLE
          const isVgFirst = vgIdx === 0
          const isVgLast = vgIdx === groupOrder.length - 1
          // 每店獨立：所有真實類別（非「未分類」）都可改名/排序，不再依賴全域 system_vendor_groups record
          const hasVgRecord = vg !== '未分類'
          return (
            <div key={vg}>
              <div className="flex items-center gap-2 mb-2 px-1">
                {sortMode && hasVgRecord && (
                  <div className="flex flex-col" style={{ width: 20, background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, padding: 2 }}>
                    <button onClick={() => moveVendorGroup(vg, 'up')} disabled={isVgFirst || isPending}
                      style={{ background: 'none', border: 'none', cursor: isVgFirst ? 'default' : 'pointer', color: isVgFirst ? '#e4e4e7' : '#92400e', padding: 0, lineHeight: 0.7 }} title="上移">
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button onClick={() => moveVendorGroup(vg, 'down')} disabled={isVgLast || isPending}
                      style={{ background: 'none', border: 'none', cursor: isVgLast ? 'default' : 'pointer', color: isVgLast ? '#e4e4e7' : '#92400e', padding: 0, lineHeight: 0.7 }} title="下移">
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: vgSt.bg, color: vgSt.color }}>
                  {vg}
                </span>
                <span className="text-xs" style={{ color: '#a1a1aa' }}>{items.length} 項</span>
                {/* 單據類型（doc_type）— Excel Row 2 顯示的內容 */}
                {(() => {
                  const vgRec = vgsState.find(v => v.name === vg)
                  if (!vgRec) return null
                  return (
                    <VgDocTypeSelector vgId={vgRec.id} vgName={vg} currentDoc={vgRec.doc_type ?? null} />
                  )
                })()}
                {/* Rename / 刪除 */}
                {hasVgRecord && vg !== '未分類' && (
                  <VgActions vgName={vg} storeId={activeStoreId || null} itemCount={items.length} onDone={() => router.refresh()} />
                )}
                {/* 分類內快速新增品項（inline，就地展開輸入框） */}
                <button onClick={() => {
                  if (inlineAddVg === vg) { setInlineAddVg(null); return }
                  setInlineAddVg(vg); setInlineAddName('')
                }}
                  className="ml-auto flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={inlineAddVg === vg
                    ? { background: '#F59E0B', color: 'white', border: '1px solid #F59E0B', cursor: 'pointer' }
                    : { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', cursor: 'pointer' }}
                  title={`新增品項到「${vg}」`}>
                  <Plus className="h-3 w-3" /> 加品項
                </button>
              </div>
              {inlineAddVg === vg && (
                <div className="flex items-center gap-2 mb-2 px-2 py-2 rounded-lg" style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A' }}>
                  <input autoFocus value={inlineAddName} onChange={e => setInlineAddName(e.target.value)}
                    placeholder="品項名稱（例：辣椒）"
                    onKeyDown={e => { if (e.key === 'Escape') { setInlineAddVg(null); setInlineAddName('') } }}
                    style={{ flex: 1, height: 32, padding: '0 8px', border: '1.5px solid #F59E0B', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                  <button disabled={!inlineAddName.trim() || isPending}
                    onClick={() => {
                      const name = inlineAddName.trim()
                      if (!name) return
                      startTransition(async () => {
                        const targetVg = vg === '未分類' ? undefined : vg
                        const storeParam = activeStoreId || undefined
                        const r = await saveItemMapping(name, name, '食材', storeParam, targetVg)
                        if (r && 'error' in r) { toast.error('新增失敗：' + r.error); return }
                        // Optimistic：若 auto-create 新 vg → 加入 vgsState
                        const newVg = (r as any)?.newVg
                        if (newVg) setVgsState(prev => prev.some(v => v.id === newVg.id) ? prev : [...prev, { ...newVg, doc_type: null }])
                        toast.success(`已加「${name}」到「${vg}」`)
                        setInlineAddName('')
                        router.refresh()
                      })
                    }}
                    className="text-xs font-semibold px-3 py-1 rounded-lg text-white"
                    style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', cursor: 'pointer', opacity: (!inlineAddName.trim() || isPending) ? 0.5 : 1 }}>
                    儲存
                  </button>
                  <button onClick={() => { setInlineAddVg(null); setInlineAddName('') }}
                    className="text-xs font-semibold px-2 py-1 rounded-lg"
                    style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b', cursor: 'pointer' }}>
                    取消
                  </button>
                </div>
              )}
              <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <SortableContext items={items.map(m => m.id)} strategy={verticalListSortingStrategy}>
                {(() => {
                  // 「退稅」vg 特別處理：依品項名稱的「稅金/稅」前綴推導原廠商，拆子區塊
                  const isRefund = vg === '退稅'
                  const refundSource = (name: string) => {
                    if (name.endsWith('稅金')) return name.slice(0, -2)
                    if (name.endsWith('稅')) return name.slice(0, -1)
                    return name
                  }
                  const uniqSources = isRefund ? new Set(items.map(i => refundSource(i.item_name))) : new Set<string>()
                  const showSubHeaders = isRefund && uniqSources.size > 1
                  const rendered: React.ReactNode[] = []
                  let lastSource = ''
                  items.forEach((m, idx) => {
                    const source = refundSource(m.item_name)
                    if (showSubHeaders && source !== lastSource) {
                      rendered.push(
                        <div key={`sub-${m.id}`} className="px-4 py-1.5 text-[11px] font-semibold flex items-center gap-1.5"
                          style={{ background: '#fef9c3', color: '#713f12', borderBottom: '1px solid #fde68a', borderTop: idx > 0 ? '2px solid #fbbf24' : 'none' }}>
                          <span>🏷️</span>
                          <span>{source} 退稅</span>
                          <span className="text-[10px] font-normal" style={{ color: '#a1a1aa' }}>（獨立區塊）</span>
                        </div>
                      )
                      lastSource = source
                    }
                    // 若在全域頁，計算此 item_name 有多少 store 專屬 override
                    const storesUsingIds = !isStorePage
                      ? mappings.filter(x => x.item_name === m.item_name && x.store_id).map(x => x.store_id as string)
                      : []
                    rendered.push(
                      <SortableItemRow
                        key={m.id}
                        m={m}
                        vg={vg}
                        isLast={idx === items.length - 1}
                        isStorePage={isStorePage}
                        activeStoreId={activeStoreId}
                        sortMode={sortMode}
                        selectMode={selectMode}
                        isSelected={selectedIds.has(m.id)}
                        onToggleSelect={() => setSelectedIds(prev => {
                          const next = new Set(prev)
                          if (next.has(m.id)) next.delete(m.id); else next.add(m.id)
                          return next
                        })}
                        storesUsingIds={storesUsingIds}
                        allStores={stores}
                        editId={editId}
                        editCol={editCol}
                        editCat={editCat}
                        editVendorGroup={editVendorGroup}
                        setEditCol={setEditCol}
                        setEditCat={setEditCat}
                        setEditVendorGroup={setEditVendorGroup}
                        startEdit={startEdit}
                        handleUpdate={handleUpdate}
                        setEditId={setEditId}
                        handleDelete={handleDelete}
                        displayName={displayName}
                      />
                    )
                  })
                  return rendered
                })()}
                </SortableContext>
              </div>
            </div>
          )
        })}
        </DndContext>
      </div>
    </div>
  )
}

/** 可拖曳的分類群組 wrapper */
function SortableVgGroup({ vg, enableDrag, children }: { vg: string; enableDrag: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `vg-${vg}`, disabled: !enableDrag })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <SortableVgContext.Provider value={{ listeners, attributes }}>
        {children}
      </SortableVgContext.Provider>
    </div>
  )
}

const SortableVgContext = createContext<{ listeners: any; attributes: any }>({ listeners: {}, attributes: {} })

/** 分類 header 內的拖曳 handle（讀 SortableVgContext 取得 listeners） */
function VgDragHandle() {
  const { listeners, attributes } = useContext(SortableVgContext)
  return (
    <button {...attributes} {...listeners}
      className="shrink-0"
      style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, cursor: 'grab', color: '#92400e', padding: 4, touchAction: 'none' }}
      title="拖曳分類排序"
      aria-label="拖曳分類">
      <GripVertical className="h-4 w-4" />
    </button>
  )
}

/** 可拖曳的品項 row（同 vg 內拖曳排序） */
function SortableItemRow({
  m, vg, isLast, isStorePage, activeStoreId, sortMode, selectMode, isSelected, onToggleSelect, storesUsingIds, allStores, editId, editCol, editCat, editVendorGroup,
  setEditCol, setEditCat, setEditVendorGroup, startEdit, handleUpdate, setEditId, handleDelete, displayName,
}: {
  m: Mapping; vg: string; isLast: boolean; isStorePage: boolean; activeStoreId: string; sortMode: boolean
  selectMode: boolean; isSelected: boolean; onToggleSelect: () => void
  storesUsingIds: string[]; allStores: { id: string; name: string }[]
  editId: string | null; editCol: string; editCat: string; editVendorGroup: string
  setEditCol: (v: string) => void; setEditCat: (v: string) => void; setEditVendorGroup: (v: string) => void
  startEdit: (m: Mapping) => void; handleUpdate: (id: string) => void; setEditId: (v: string | null) => void
  handleDelete: (id: string) => void; displayName: (m: Mapping) => string
}) {
  const [showStores, setShowStores] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id })
  const catSt = CAT_STYLE[m.item_category] ?? CAT_STYLE['雜項']
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderBottom: isLast ? 'none' : '1px solid #f4f4f5',
    background: isDragging ? '#fef3c7' : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-2 md:py-2.5">
      {/* 選取模式：checkbox */}
      {selectMode && (
        <input type="checkbox" checked={isSelected} onChange={onToggleSelect}
          className="shrink-0 cursor-pointer" style={{ width: 18, height: 18, accentColor: '#dc2626' }} />
      )}
      {/* Drag handle — 只在排序模式時可見可操作，避免手機誤觸 */}
      {sortMode && (
        <button {...attributes} {...listeners}
          className="shrink-0"
          style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, cursor: 'grab', color: '#92400e', padding: '4px', touchAction: 'none' }}
          title="拖曳排序"
          aria-label="拖曳排序">
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <span className="flex-1 text-sm font-semibold flex flex-wrap items-center gap-1.5" style={{ color: '#18181b' }}>
        <InlineItemNameEditor mappingId={m.id} currentName={displayName(m)} fullName={m.item_name} />
        {false && (
          <button onClick={() => setShowStores(v => !v)}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1"
            style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', cursor: 'pointer' }}
            title="管理哪些店有專屬 override">
            {storesUsingIds.length} 家店使用
            <span style={{ fontSize: 8 }}>{showStores ? '▲' : '▼'}</span>
          </button>
        )}
        {!isStorePage && showStores && (
          <StoresOverridePanel item={m} allStores={allStores} storesUsingIds={storesUsingIds} />
        )}
      </span>
      {editId !== m.id && (
        <ItemDocOverrideSelector
          itemName={m.item_name}
          storeId={m.store_id ?? null}
          currentOverride={m.doc_type_override ?? null}
        />
      )}
      {editId === m.id ? (
        <>
          <input list="excel-col-list" style={SELECT_STYLE}
            value={editCol} onChange={e => setEditCol(e.target.value)}
            placeholder="Excel 欄位" />
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
          <RefundToggle mappingId={m.id} isRefund={!!m.is_refund} />
          <span className="hidden md:inline text-sm tabular-nums" style={{ color: '#71717a' }}>{m.excel_column}</span>
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
}

/** 點名稱直接編輯 — Enter 儲存、Esc 取消 */
function InlineItemNameEditor({ mappingId, currentName, fullName }: { mappingId: string; currentName: string; fullName: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(fullName)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  useEffect(() => { setValue(fullName) }, [fullName])

  async function save() {
    if (value.trim() === fullName) { setEditing(false); return }
    setSaving(true)
    try {
      const { renameItem } = await import('@/app/actions/item-mappings')
      const r = await renameItem(mappingId, value.trim())
      if (r && 'error' in r) { toast.error(r.error); return }
      toast.success('已改名')
      setEditing(false)
      router.refresh()
    } finally { setSaving(false) }
  }
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input autoFocus value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            // 不用 Enter 儲存，避免 IME 選字時誤觸；只保留 Esc 取消
            if (e.key === 'Escape') { setValue(fullName); setEditing(false) }
          }}
          disabled={saving}
          style={{ minWidth: 100, padding: '2px 6px', border: '1.5px solid #F59E0B', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: '#18181b' }} />
        <button onClick={save} disabled={saving || !value.trim()}
          className="rounded transition-opacity hover:opacity-70"
          style={{ background: '#22c55e', color: 'white', border: 'none', padding: '3px 6px', cursor: 'pointer', fontSize: 12, fontWeight: 700, opacity: (saving || !value.trim()) ? 0.5 : 1 }}
          title="確認">
          ✓
        </button>
        <button onClick={() => { setValue(fullName); setEditing(false) }} disabled={saving}
          className="rounded transition-opacity hover:opacity-70"
          style={{ background: '#e4e4e7', color: '#71717a', border: 'none', padding: '3px 6px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          title="取消">
          ✕
        </button>
      </span>
    )
  }
  return (
    <button onClick={() => setEditing(true)}
      className="hover:bg-amber-50 rounded px-1 -mx-1 transition-colors"
      style={{ background: 'none', border: 'none', padding: '0 4px', cursor: 'text', color: '#18181b', fontWeight: 600, fontSize: 14, fontFamily: 'inherit', textAlign: 'left' }}
      title="點擊改名稱">
      {currentName}
    </button>
  )
}

/** 展開店家 override 面板 — 已 override 的店可移除，未 override 的店可新增 */
function StoresOverridePanel({ item, allStores, storesUsingIds }: {
  item: Mapping
  allStores: { id: string; name: string }[]
  storesUsingIds: string[]
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const router = useRouter()
  const usedSet = new Set(storesUsingIds)
  const used = allStores.filter(s => usedSet.has(s.id))
  const unused = allStores.filter(s => !usedSet.has(s.id))

  async function addStore(sid: string) {
    setBusy(sid)
    try {
      const { saveItemMapping } = await import('@/app/actions/item-mappings')
      const r = await saveItemMapping(item.item_name, item.excel_column || item.item_name, item.item_category, sid, item.vendor_group ?? undefined)
      if (r && 'error' in r) toast.error('新增失敗：' + r.error)
      else { toast.success('已新增'); router.refresh() }
    } finally { setBusy(null) }
  }
  async function removeStore(sid: string) {
    if (!confirm(`確定要移除該店的專屬 override？該店會回到全域繼承。`)) return
    setBusy(sid)
    try {
      // 找該店對應的 mapping id → deleteItemMapping
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: target } = await supabase.from('item_column_mappings').select('id')
        .eq('item_name', item.item_name).eq('store_id', sid).maybeSingle()
      if (target) {
        const { deleteItemMapping } = await import('@/app/actions/item-mappings')
        await deleteItemMapping(target.id)
        toast.success('已移除')
        router.refresh()
      }
    } finally { setBusy(null) }
  }

  return (
    <div className="w-full mt-1 rounded-lg p-2 space-y-2" style={{ background: '#fafafa', border: '1px solid #e4e4e7' }}>
      {used.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold mb-1" style={{ color: '#166534' }}>✓ 已使用店家（{used.length}）</p>
          <div className="flex flex-wrap gap-1">
            {used.map(s => (
              <button key={s.id} onClick={() => removeStore(s.id)} disabled={busy === s.id}
                className="text-[10px] px-1.5 py-0.5 rounded transition-opacity hover:opacity-70"
                style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', cursor: 'pointer' }}
                title="點擊移除該店 override">
                {s.name} ✕
              </button>
            ))}
          </div>
        </div>
      )}
      {unused.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold mb-1" style={{ color: '#71717a' }}>+ 加店家使用（{unused.length}）</p>
          <div className="flex flex-wrap gap-1">
            {unused.map(s => (
              <button key={s.id} onClick={() => addStore(s.id)} disabled={busy === s.id}
                className="text-[10px] px-1.5 py-0.5 rounded transition-colors hover:bg-amber-50"
                style={{ background: 'white', color: '#52525b', border: '1px dashed #d4d4d8', cursor: 'pointer' }}
                title="點擊新增到該店">
                {s.name} +
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** 「屬於退稅」勾選框 — 勾了此品項納入「梁平退稅」總額，跟 vg 解耦 */
function RefundToggle({ mappingId, isRefund }: { mappingId: string; isRefund: boolean }) {
  const [checked, setChecked] = useState(isRefund)
  useEffect(() => { setChecked(isRefund) }, [isRefund])
  async function toggle() {
    const next = !checked
    setChecked(next)  // optimistic
    const { setItemRefundFlag } = await import('@/app/actions/item-mappings')
    const r = await setItemRefundFlag(mappingId, next)
    if (r && 'error' in r) {
      setChecked(!next)
      toast.error('儲存失敗：' + r.error)
    }
  }
  return (
    <button onClick={toggle}
      className="text-xs px-2 py-0.5 rounded-full shrink-0 font-semibold transition-colors"
      style={checked
        ? { background: '#dcfce7', color: '#166534', border: '1.5px solid #86efac' }
        : { background: 'white', color: '#a1a1aa', border: '1.5px solid #e4e4e7' }}
      title={checked ? '已納入梁平退稅總額（點擊取消）' : '未納入梁平退稅（點擊勾選）'}>
      {checked ? '✓ 退稅' : '退稅'}
    </button>
  )
}

/** vg 修改名稱 / 刪除 */
function VgActions({ vgName, storeId, itemCount, onDone }: { vgName: string; storeId: string | null; itemCount: number; onDone: () => void }) {
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState(vgName)
  const [saving, setSaving] = useState(false)

  async function handleRename() {
    if (!newName.trim() || newName.trim() === vgName) { setEditing(false); return }
    setSaving(true)
    try {
      const { renameVendorGroup } = await import('@/app/actions/item-mappings')
      const r = await renameVendorGroup(vgName, newName.trim())
      if ('error' in r) { toast.error(String(r.error)); return }
      toast.success('已改名')
      onDone()
    } finally { setSaving(false); setEditing(false) }
  }

  async function handleDelete() {
    const scope = storeId ? '本店' : '所有店家'
    if (!confirm(`確定刪除「${vgName}」廠商群組？（${scope}，含底下 ${itemCount} 個品項的對應）\n\n※ 品項本身不會刪除，只是移除對應。可到品項對應管理重建。`)) return
    setSaving(true)
    try {
      const { deleteVendorGroupWithItems } = await import('@/app/actions/item-mappings')
      const r = await deleteVendorGroupWithItems(vgName, storeId ?? undefined)
      if ('error' in r) { toast.error(String(r.error)); return }
      toast.success(`已移除 ${r.mappingsRemoved} 筆對應`)
      onDone()
    } finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            // 中文 IME 組字期間 Enter 是選字用，不能觸發提交
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); handleRename() }
            if (e.key === 'Escape') setEditing(false)
          }}
          autoFocus
          style={{ height: 22, padding: '0 6px', fontSize: 11, borderRadius: 4, border: '1.5px solid #F59E0B', outline: 'none' }} />
        <button onClick={handleRename} disabled={saving}
          style={{ background: 'none', border: 'none', color: '#047857', cursor: 'pointer', padding: 2 }}>
          <Check className="h-3 w-3" />
        </button>
        <button onClick={() => setEditing(false)}
          style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 2 }}>
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }
  return (
    <>
      <button onClick={() => setEditing(true)}
        title="改名"
        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 2 }}>
        <Edit2 className="h-3 w-3" />
      </button>
      <button onClick={handleDelete} disabled={saving}
        title="刪除整個群組"
        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 2 }}>
        <Trash2 className="h-3 w-3" />
      </button>
    </>
  )
}

const BUILTIN_DOC_TYPES = ['發票', '收據', '估價單', '公司開', '梁鑫開', '府中開']
/** doc_type → 色碼 mapping（背景色 / 文字色 / 邊框色） */
function docColor(doc: string): { bg: string; fg: string; bd: string } {
  switch (doc) {
    case '發票': return { bg: '#DBEAFE', fg: '#1E40AF', bd: '#93C5FD' }  // 藍
    case '收據': return { bg: '#DCFCE7', fg: '#166534', bd: '#86EFAC' }  // 綠
    case '估價單': return { bg: '#EDE9FE', fg: '#6D28D9', bd: '#C4B5FD' } // 紫
    case '公司開': return { bg: '#FFEDD5', fg: '#9A3412', bd: '#FDBA74' } // 橘
    case '梁鑫開': return { bg: '#FCE7F3', fg: '#9F1239', bd: '#F9A8D4' } // 粉
    case '府中開': return { bg: '#FEF3C7', fg: '#92400E', bd: '#FCD34D' } // 黃
    default:
      if (doc) return { bg: '#F1F5F9', fg: '#334155', bd: '#CBD5E1' }    // 灰（自訂）
      return { bg: 'transparent', fg: '#a1a1aa', bd: '#E4E4E7' }         // 空
  }
}
/** 品項層級 doc_type override（覆蓋 vg 預設） */
function ItemDocOverrideSelector({ itemName, storeId, currentOverride, extraOptions = [] }: {
  itemName: string; storeId: string | null; currentOverride: string | null; extraOptions?: string[]
}) {
  const [doc, setDoc] = useState(currentOverride ?? '')
  const [saving, setSaving] = useState(false)
  // refresh 後（server 傳回新 currentOverride）同步 local state，避免顯示回舊值
  useEffect(() => { setDoc(currentOverride ?? '') }, [currentOverride])
  // 合併：built-in + 目前 value + 自訂 extraOptions（去重）
  const allOptions = Array.from(new Set([...BUILTIN_DOC_TYPES, ...extraOptions, ...(doc && !BUILTIN_DOC_TYPES.includes(doc) ? [doc] : [])]))
  async function save(next: string) {
    setDoc(next)
    setSaving(true)
    try {
      const { setItemDocOverride } = await import('@/app/actions/item-mappings')
      const r = await setItemDocOverride(itemName, storeId, next || null)
      if ('error' in r) toast.error(String(r.error))
    } finally { setSaving(false) }
  }
  async function handleChange(v: string) {
    if (v === '__custom__') {
      const name = prompt('輸入自訂單據類型名稱（例：巷日開）:')?.trim()
      if (!name) return
      await save(name)
    } else {
      await save(v)
    }
  }
  return (
    <select value={doc} onChange={e => handleChange(e.target.value)} disabled={saving}
      title={`「${itemName}」的單據 override（覆蓋廠商群組預設）`}
      style={{
        height: 22, padding: '0 4px', fontSize: 10, borderRadius: 4,
        border: `1px solid ${docColor(doc).bd}`,
        background: docColor(doc).bg, color: docColor(doc).fg,
        fontFamily: 'inherit', outline: 'none', fontWeight: doc ? 600 : 400,
      }}>
      <option value="">單據 (預設)</option>
      {allOptions.map(o => <option key={o} value={o}>{o}</option>)}
      <option value="__custom__">➕ 新增自訂…</option>
    </select>
  )
}

/** 把目前店的品項對應手動複製到另一店（單次操作，不自動連動） */
function CopyToStoreButton({ fromStoreId, stores }: { fromStoreId: string; stores: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false)
  const [toStoreId, setToStoreId] = useState('')
  const [copying, setCopying] = useState(false)

  const targets = stores.filter(s => s.id !== fromStoreId)
  if (targets.length === 0) return null

  async function handleCopy() {
    if (!toStoreId) return
    const target = targets.find(s => s.id === toStoreId)
    if (!confirm(`確定要把目前店的品項設定覆蓋到「${target?.name}」嗎？\n\n此操作無法復原，會清除「${target?.name}」的現有品項對應。`)) return
    setCopying(true)
    try {
      const { copyStoreMappingsToStore } = await import('@/app/actions/item-mappings')
      const r = await copyStoreMappingsToStore(fromStoreId, toStoreId)
      if ('error' in r) { toast.error(String(r.error)); return }
      toast.success(`已複製到「${target?.name}」（${(r as any).count} 筆）`)
      setOpen(false)
    } finally {
      setCopying(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        style={{ background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b' }}
        title="把目前店的品項設定複製到另一店（手動一次性操作）">
        複製到其他店…
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 50, minWidth: 220,
          background: 'white', border: '1px solid #e4e4e7', borderRadius: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <p style={{ fontSize: 12, color: '#71717a', margin: 0 }}>選擇目標店家（會覆蓋該店現有對應）</p>
          <select value={toStoreId} onChange={e => setToStoreId(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #e4e4e7', fontSize: 13, width: '100%' }}>
            <option value="">選擇店家…</option>
            {targets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setOpen(false)} disabled={copying}
              style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #e4e4e7', background: 'white', fontSize: 13, cursor: 'pointer' }}>
              取消
            </button>
            <button onClick={handleCopy} disabled={!toStoreId || copying}
              style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: toStoreId ? '#F59E0B' : '#e4e4e7', color: toStoreId ? 'white' : '#a1a1aa', border: 'none', fontSize: 13, fontWeight: 600, cursor: toStoreId ? 'pointer' : 'default' }}>
              {copying ? '複製中…' : '確認複製'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 廠商群組的單據類型（doc_type）快速編輯 */
function VgDocTypeSelector({ vgId, vgName, currentDoc }: { vgId: string; vgName: string; currentDoc: string | null }) {
  const [doc, setDoc] = useState(currentDoc ?? '')
  const [saving, setSaving] = useState(false)
  // refresh 後同步 server 傳回的新值
  useEffect(() => { setDoc(currentDoc ?? '') }, [currentDoc])

  async function save(next: string) {
    setDoc(next)
    setSaving(true)
    try {
      const { updateVendorGroup } = await import('@/app/actions/system-config')
      const r = await updateVendorGroup(vgId, { doc_type: next || null })
      if ('error' in r) { toast.error(String((r as any).error)); return }
    } finally {
      setSaving(false)
    }
  }

  const allOptions = Array.from(new Set([...BUILTIN_DOC_TYPES, ...(doc && !BUILTIN_DOC_TYPES.includes(doc) ? [doc] : [])]))
  async function handleChange(v: string) {
    if (v === '__custom__') {
      const name = prompt('輸入自訂單據類型名稱（例：巷日開）:')?.trim()
      if (!name) return
      await save(name)
    } else {
      await save(v)
    }
  }
  return (
    <select value={doc} onChange={e => handleChange(e.target.value)} disabled={saving}
      title={`「${vgName}」的預設單據類型（會顯示在 Excel Row 2）`}
      style={{
        height: 22, padding: '0 4px', fontSize: 11, borderRadius: 4,
        border: `1px solid ${docColor(doc).bd}`,
        background: doc ? docColor(doc).bg : 'white',
        color: docColor(doc).fg,
        fontFamily: 'inherit', outline: 'none', fontWeight: doc ? 600 : 400,
      }}>
      <option value="">單據類型…</option>
      {allOptions.map(o => <option key={o} value={o}>{o}</option>)}
      <option value="__custom__">➕ 新增自訂…</option>
    </select>
  )
}
