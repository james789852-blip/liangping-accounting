'use client'

import { useState, useTransition, useEffect, useMemo, useRef, createContext, useContext } from 'react'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import {
  createStoreVendorGroup, deleteItemMapping, updateItemMapping, saveItemMapping, reorderItemMappings, setItemDocOverride, reorderStoreVendorGroups, setStoreVendorGroupMode,
} from '@/app/actions/item-mappings'
import { setManagerStore } from '@/app/actions/store-select'
import { useRouter } from 'next/navigation'
import { Trash2, Edit2, Check, X, Plus, Tag, ChevronLeft, ChevronUp, ChevronDown, GripVertical } from 'lucide-react'
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
import {
  isMiscVendorGroup,
  MISC_VENDOR_GROUP,
  normalizeVendorGroupName,
  RECEIPT_VENDOR_GROUP_EXCLUDED_NAMES,
} from '@/lib/linked-receipt-category'
import { isVendorOnlyMapping } from '@/lib/vendor-only-mapping'

interface Mapping {
  id: string; item_name: string; excel_column: string; item_category: string; store_id?: string | null; vendor_group?: string | null; doc_type_override?: string | null; is_refund?: boolean; is_tax_addon?: boolean; tax_scope?: 'category' | 'item' | null; tax_target_item?: string | null; sort_order?: number; vg_sort_order?: number
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
  storeMappingCounts = {},
  linkedCategoryNamesByStore = {},
  vendorChildNamesByStore = {},
}: {
  mappings: Mapping[]
  stores: { id: string; name: string }[]
  vendorGroups?: { id: string; name: string; sort_order: number; doc_type?: string | null }[]
  selectedStoreId: string
  storeMappingCounts?: Record<string, number>
  linkedCategoryNamesByStore?: Record<string, string[]>
  vendorChildNamesByStore?: Record<string, string[]>
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
  const [newDocType, setNewDocType] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showAddVg, setShowAddVg] = useState(false)
  const [sortMode, setSortMode] = useState(false)
  const [batchStoreIds, setBatchStoreIds] = useState<string[]>([])
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [inlineAddVg, setInlineAddVg] = useState<string | null>(null)
  const [inlineAddName, setInlineAddName] = useState('')
  const [inlineAddCat, setInlineAddCat] = useState('食材')
  const [inlineAddDocType, setInlineAddDocType] = useState('')
  const [newVgName, setNewVgName] = useState('')
  const [newVgMode, setNewVgMode] = useState<'vendor' | 'direct'>('vendor')
  const [newVgCategory, setNewVgCategory] = useState('雜項')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const storeTabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [pendingStoreId, setPendingStoreId] = useState<string | null>(null)

  // 用 state 保存 vendorGroups，允許 optimistic update
  const [vgsState, setVgsState] = useState(vendorGroups)
  // 剛新增、尚無品項的空類別（不在 displayMappings 裡），用來讓 UI 立即顯示空分類
  const [pendingVgsByStore, setPendingVgsByStore] = useState<Record<string, string[]>>({})
  const [pendingDirectVgsByStore, setPendingDirectVgsByStore] = useState<Record<string, string[]>>({})

  // Sync from server after direct entry or router.refresh()
  useEffect(() => {
    setMappings(initial)
  }, [initial])
  useEffect(() => { setVgsState(vendorGroups) }, [vendorGroups])

  function resetStoreScopedUi() {
    setEditId(null)
    setEditCol('')
    setEditCat('')
    setEditVendorGroup('')
    setNewName('')
    setNewCol('')
    setNewCat('食材')
    setNewVendorGroup('')
    setNewDocType('')
    setShowAdd(false)
    setShowAddVg(false)
    setSortMode(false)
    setBatchStoreIds([])
    setSelectMode(false)
    setSelectedIds(new Set())
    setInlineAddVg(null)
    setInlineAddName('')
    setInlineAddCat('食材')
    setInlineAddDocType('')
    setNewVgName('')
    setNewVgMode('vendor')
    setNewVgCategory('雜項')
  }

  useEffect(() => {
    setPendingStoreId(current => (current === initStoreId ? null : current))
    if (initStoreId === activeStoreId) return
    setActiveStoreId(initStoreId)
    resetStoreScopedUi()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initStoreId])

  useEffect(() => {
    const tab = storeTabRefs.current[pendingStoreId ?? activeStoreId]
    if (!tab) return
    requestAnimationFrame(() => {
      tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    })
  }, [activeStoreId, pendingStoreId, stores.length])

  function replaceStoreUrl(storeId: string) {
    window.history.replaceState(null, '', `/hq/item-mappings?storeId=${storeId}`)
  }

  function selectStore(storeId: string) {
    if (storeId === activeStoreId || storeId === pendingStoreId) return
    replaceStoreUrl(storeId)
    setManagerStore(storeId).catch(() => {})
    startTransition(() => {
      setActiveStoreId(storeId)
      setPendingStoreId(null)
      resetStoreScopedUi()
    })
  }

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
    const activeVg = normalizeVendorGroupName(activeItem.vendor_group)
    // 判斷 over 是別的 item 還是 vg group header
    const overIsVg = String(over.id).startsWith('vg-')
    const overVg = overIsVg
      ? String(over.id).slice(3)
      : normalizeVendorGroupName(displayMappings.find(m => m.id === over.id)?.vendor_group)

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

  // 各店完全獨立：一次整理目前店家的顯示資料，避免 80+ 列在每次互動時反覆掃描。
  const { displayMappings, grouped, groupOrder, groupDocMap, groupCategoryMap, taxItemOptionsByGroup } = useMemo(() => {
    const activeMappings = mappings
      .filter(mapping => mapping.store_id === activeStoreId)
      .sort((a, b) => (a.sort_order ?? 999999) - (b.sort_order ?? 999999))
    const visibleMappings = activeMappings.filter(mapping => !isVendorOnlyMapping(mapping))
    const allMappingsByGroup = activeMappings.reduce<Record<string, Mapping[]>>((acc, mapping) => {
      const vendorGroup = normalizeVendorGroupName(mapping.vendor_group)
      if (!acc[vendorGroup]) acc[vendorGroup] = []
      acc[vendorGroup].push(mapping)
      return acc
    }, {})
    const nextGrouped = activeMappings.reduce<Record<string, Mapping[]>>((acc, mapping) => {
      const vendorGroup = normalizeVendorGroupName(mapping.vendor_group)
      if (!acc[vendorGroup]) acc[vendorGroup] = []
      if (!isVendorOnlyMapping(mapping)) acc[vendorGroup].push(mapping)
      return acc
    }, {})
    for (const vendorGroup of pendingVgsByStore[activeStoreId] ?? []) {
      if (!nextGrouped[vendorGroup]) nextGrouped[vendorGroup] = []
    }
    for (const vendorGroup of vendorChildNamesByStore[activeStoreId] ?? []) {
      if (!nextGrouped[vendorGroup]) nextGrouped[vendorGroup] = []
    }
    for (const vendorGroup of linkedCategoryNamesByStore[activeStoreId] ?? []) {
      if (!nextGrouped[vendorGroup]) nextGrouped[vendorGroup] = []
    }

    const groupSortMap = new Map<string, number>()
    const nextGroupDocMap = new Map<string, string | null>()
    const nextGroupCategoryMap = new Map<string, string | null>()
    const nextTaxItemOptions = new Map<string, string[]>()
    for (const mapping of activeMappings) {
      const vendorGroup = normalizeVendorGroupName(mapping.vendor_group)
      const currentSort = groupSortMap.get(vendorGroup)
      const nextSort = mapping.vg_sort_order ?? 99999
      groupSortMap.set(vendorGroup, currentSort == null ? nextSort : Math.min(currentSort, nextSort))
      if (!mapping.is_tax_addon && !isVendorOnlyMapping(mapping)) {
        const options = nextTaxItemOptions.get(vendorGroup) ?? []
        options.push(mapping.item_name)
        nextTaxItemOptions.set(vendorGroup, options)
      }
    }
    for (const vendorGroup of Object.keys(nextGrouped)) {
      const groupItems = allMappingsByGroup[vendorGroup] ?? []
      const docs = new Set(groupItems.map(mapping => mapping.doc_type_override ?? '').filter(Boolean))
      const allItemsUseSameDoc = groupItems.length > 0
        && docs.size === 1
        && groupItems.every(mapping => !!mapping.doc_type_override)
      nextGroupDocMap.set(vendorGroup, allItemsUseSameDoc ? [...docs][0] : null)
      const categories = new Set(groupItems
        .filter(mapping => !mapping.is_tax_addon)
        .map(mapping => mapping.item_category)
        .filter(Boolean))
      nextGroupCategoryMap.set(vendorGroup, categories.size === 1 ? [...categories][0] : null)
    }
    const nextGroupOrder = Object.keys(nextGrouped).sort((a, b) => {
      const rank = (group: string) => isMiscVendorGroup(group) ? 2 : DOC_TYPES.has(group) ? 1 : 0
      const rankA = rank(a), rankB = rank(b)
      if (rankA !== rankB) return rankA - rankB
      const sortA = groupSortMap.get(a) ?? 99999
      const sortB = groupSortMap.get(b) ?? 99999
      if (sortA !== sortB) return sortA - sortB
      return a.localeCompare(b, 'zh-Hant')
    })
    return {
      displayMappings: visibleMappings,
      grouped: nextGrouped,
      groupOrder: nextGroupOrder,
      groupDocMap: nextGroupDocMap,
      groupCategoryMap: nextGroupCategoryMap,
      taxItemOptionsByGroup: nextTaxItemOptions,
    }
  }, [activeStoreId, linkedCategoryNamesByStore, mappings, pendingVgsByStore, vendorChildNamesByStore])

  const isStorePage = true
  const docTypeOptions = useMemo(() => Array.from(new Set([
    ...BUILTIN_DOC_TYPES,
    ...vgsState.map(v => v.doc_type).filter((v): v is string => !!v),
    ...mappings.map(m => m.doc_type_override).filter((v): v is string => !!v),
  ])), [mappings, vgsState])
  const directGroupNames = useMemo(() => new Set([
    ...(linkedCategoryNamesByStore[activeStoreId] ?? []),
    ...(pendingDirectVgsByStore[activeStoreId] ?? []),
  ]), [activeStoreId, linkedCategoryNamesByStore, pendingDirectVgsByStore])
  const excludedVendorGroupNames = useMemo(() => new Set<string>(RECEIPT_VENDOR_GROUP_EXCLUDED_NAMES), [])
  const vendorChildGroups = useMemo(() => groupOrder.filter(group => (
    !isMiscVendorGroup(group)
    && !DOC_TYPES.has(group)
    && !excludedVendorGroupNames.has(group)
    && !directGroupNames.has(group)
  )), [directGroupNames, excludedVendorGroupNames, groupOrder])
  const vendorChildGroupSet = useMemo(() => new Set(vendorChildGroups), [vendorChildGroups])

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
    if (!newName.trim() || batchStoreIds.length === 0) return
    const excelCol = newCol.trim() || newName.trim()
    startTransition(async () => {
      const targets = Array.from(new Set(batchStoreIds))
      // 逐店建立，避免第一次新增自訂品項時多個請求同時建立 system_items 造成競態。
      const results: { storeId: string; storeName: string; result: any }[] = []
      for (const sid of targets) {
        const storeName = stores.find(store => store.id === sid)?.name ?? '未知店家'
        const result = await saveItemMapping(newName.trim(), excelCol, newCat, sid, newVendorGroup.trim() || undefined)
        results.push({ storeId: sid, storeName, result })
      }

      const errors = results.filter(entry => !!entry.result?.error)
      const alreadyExists = results.filter(entry => !!entry.result?.alreadyExists)
      const added = results.filter(entry => !entry.result?.error && !entry.result?.alreadyExists)

      // 單據類型只寫入確實新增完成或原本已存在的店，避免失敗店留下孤立設定。
      if (newDocType.trim()) {
        for (const entry of results.filter(entry => !entry.result?.error)) {
          await setItemDocOverride(newName.trim(), entry.storeId, newDocType.trim())
        }
      }
      // Optimistic：若 auto-create 了新 vg，立即加入 vgsState
      for (const { result } of results) {
        const newVg = result?.newVg as { id: string; name: string; sort_order: number } | null | undefined
        if (newVg) {
          setVgsState(prev => prev.some(v => v.id === newVg.id) ? prev : [...prev, { ...newVg, doc_type: null }])
        }
      }

      if (errors.length > 0) {
        toast.error(`未新增 ${errors.length} 間：${errors.map(entry => `${entry.storeName}（${entry.result.error}）`).join('；')}`)
      }
      const summary = [
        added.length > 0 ? `新增 ${added.length} 間` : '',
        alreadyExists.length > 0 ? `原本已有 ${alreadyExists.length} 間` : '',
      ].filter(Boolean).join('，')
      if (summary) toast.success(summary)

      setShowAdd(false); setNewName(''); setNewCol(''); setNewCat('食材'); setNewVendorGroup(''); setNewDocType(''); setBatchStoreIds([])
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

  // UI 直接顯示完整 item_name（不剝 vg 前綴），避免「你看到什麼 vs 實際名字」的混淆
  // xlsx 匯出時另有 displayHeader 邏輯剝離前綴（保持 xlsx layout 整齊）
  function displayName(m: Mapping): string {
    return m.item_name
  }

  function handleAddVendorGroup() {
    const name = newVgName.trim()
    if (!name) return
    startTransition(async () => {
      const maxSort = Math.max(0, ...vgsState.map(v => v.sort_order ?? 0))
      const sort = maxSort + 10
      const r = await createStoreVendorGroup(activeStoreId, name, sort, newVgMode, newVgCategory)
      if ('error' in r && r.error) {
        toast.error(r.error)
        return
      }
      // Optimistic：立即把新 vg 加入 local state，UI 立刻有排序 / 單據下拉 / rename
      if ('id' in r && r.id) {
        setVgsState(prev => prev.some(v => v.name === name) ? prev : [...prev, { id: r.id!, name, sort_order: r.sort_order ?? sort, doc_type: null }])
      }
      // 讓這個「還沒品項」的空類別在該店立即顯示，使用者才能在底下加品項
      setPendingVgsByStore(prev => {
        const names = prev[activeStoreId] ?? []
        return names.includes(name)
          ? prev
          : { ...prev, [activeStoreId]: [...names, name] }
      })
      if (newVgMode === 'direct') {
        setPendingDirectVgsByStore(prev => ({
          ...prev,
          [activeStoreId]: [...new Set([...(prev[activeStoreId] ?? []), name])],
        }))
        toast.success(`已新增獨立類別「${name}」，可至收據管理啟用`)
      } else {
        toast.success(`已新增廠商「${name}」，並同步到收據管理的「廠商」`)
      }
      setShowAddVg(false)
      setNewVgName('')
      setNewVgCategory('雜項')
      // 若同名品項由舊類別搬成獨立廠商，立即刷新以移除舊位置的重複顯示。
      router.refresh()
    })
  }

  function moveVendorGroup(vgName: string, direction: 'up' | 'down') {
    const idx = groupOrder.indexOf(vgName)
    if (idx < 0) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= groupOrder.length) return
    const reordered = [...groupOrder]
    ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
    setMappings(prev => prev.map(m => {
      if (m.store_id !== activeStoreId) return m
      const group = normalizeVendorGroupName(m.vendor_group)
      const orderIdx = reordered.indexOf(group)
      return orderIdx >= 0 ? { ...m, vg_sort_order: (orderIdx + 1) * 10 } : m
    }))
    reorderStoreVendorGroups(activeStoreId, reordered)
      .then(r => {
        if (r && 'error' in r) toast.error('分類排序失敗：' + r.error)
      })
      .catch(e => {
        toast.error('分類排序失敗：' + (e instanceof Error ? e.message : String(e)))
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
    <div className="flex min-h-[100dvh] flex-col" style={{ background: '#fafafa' }}>

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
              <h2 className="text-base font-bold" style={{ color: '#18181b' }}>新增廠商或獨立類別</h2>
              <button onClick={() => setShowAddVg(false)} className="p-1.5 rounded-lg"
                style={{ color: '#a1a1aa', background: '#f4f4f5', border: 'none', cursor: 'pointer' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setNewVgMode('vendor')}
                className="rounded-xl px-3 py-2.5 text-left"
                style={newVgMode === 'vendor'
                  ? { background: '#FEF3C7', border: '1.5px solid #F59E0B', color: '#92400E' }
                  : { background: '#fafafa', border: '1px solid #e4e4e7', color: '#71717a' }}>
                <span className="block text-sm font-bold">廠商</span>
                <span className="mt-0.5 block text-[10px] leading-4">菜商、雜貨、免洗</span>
              </button>
              <button type="button" onClick={() => setNewVgMode('direct')}
                className="rounded-xl px-3 py-2.5 text-left"
                style={newVgMode === 'direct'
                  ? { background: '#E0F2FE', border: '1.5px solid #0284C7', color: '#075985' }
                  : { background: '#fafafa', border: '1px solid #e4e4e7', color: '#71717a' }}>
                <span className="block text-sm font-bold">獨立類別</span>
                <span className="mt-0.5 block text-[10px] leading-4">日常用品、貨車保養</span>
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>{newVgMode === 'vendor' ? '廠商名稱' : '類別名稱'}</label>
              <input value={newVgName} onChange={e => setNewVgName(e.target.value)} autoFocus
                placeholder={newVgMode === 'vendor' ? '例：菜商 / 雜貨 / 免洗' : '例：日常用品 / 貨車相關保養'}
                style={INPUT_STYLE}
                onKeyDown={e => {
                  // 中文 IME 組字期間 Enter 是選字用，不能觸發提交
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault()
                    handleAddVendorGroup()
                  }
                }} />
              <p className="text-[11px] mt-1.5" style={{ color: '#047857' }}>
                {newVgMode === 'vendor'
                  ? '新增後會收進收據管理的「廠商」底下，品項與名稱由這裡同步。'
                  : '新增後可在收據管理選擇啟用，啟用後會成為獨立大類別。'}
              </p>
            </div>
            {newVgMode === 'vendor' && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>金額歸類</label>
                <select value={newVgCategory} onChange={e => setNewVgCategory(e.target.value)} style={SELECT_ADD_STYLE}>
                  <option value="食材">食材</option>
                  <option value="耗材">耗材</option>
                  <option value="雜項">雜項</option>
                </select>
                <p className="text-[11px] mt-1.5" style={{ color: '#71717a' }}>
                  即使不建立品項，也會依此分類計入報表。
                </p>
              </div>
            )}
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

      {/* Header */}
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
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button onClick={() => { setSortMode(v => !v); setSelectMode(false) }}
                className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors sm:w-auto"
                style={sortMode
                  ? { background: '#F59E0B', color: 'white', boxShadow: '0 2px 8px rgba(245,158,11,0.3)' }
                  : { background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b' }}
                title={sortMode ? '完成排序' : '進入排序模式（避免誤觸）'}>
                {sortMode ? <><Check className="h-3.5 w-3.5" /> 完成</> : <><ChevronUp className="h-3.5 w-3.5" /> 排序</>}
              </button>
              <button onClick={() => { setSelectMode(v => !v); setSortMode(false); if (selectMode) setSelectedIds(new Set()) }}
                className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors sm:w-auto"
                style={selectMode
                  ? { background: '#dc2626', color: 'white', boxShadow: '0 2px 8px rgba(220,38,38,0.3)' }
                  : { background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b' }}
                title={selectMode ? '取消選取' : '進入選取模式（可批次刪除）'}>
                {selectMode ? <><X className="h-3.5 w-3.5" /> 取消</> : <><Check className="h-3.5 w-3.5" /> 選取</>}
              </button>
              <CopyToStoreButton fromStoreId={activeStoreId} stores={stores} />
              <button onClick={() => { setNewVgMode('vendor'); setNewVgCategory('雜項'); setShowAddVg(true) }}
                className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold sm:w-auto"
                style={{ background: 'white', border: '1.5px solid #E0F2FE', color: '#0369A1' }}>
                <Tag className="h-3.5 w-3.5" /> 新增廠商／類別
              </button>
              <button onClick={() => {
                const opening = !showAdd
                setShowAdd(opening)
                setNewName('')
                setNewCol('')
                setNewCat('食材')
                setNewDocType('')
                setBatchStoreIds(opening ? [activeStoreId] : [])
              }}
                className="flex w-full items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold sm:w-auto"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
                <Plus className="h-4 w-4" /> 新增品項
              </button>
            </div>
          </div>

          {/* Store tabs（全域已廢除，一律該店專屬） */}
          {stores.length > 0 && (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {stores.map(s => {
                const count = storeMappingCounts[s.id] ?? mappings.filter(m => m.store_id === s.id).length
                const isActive = activeStoreId === s.id
                const isSwitchingTo = pendingStoreId === s.id
                return (
                  <button key={s.id}
                    ref={el => { storeTabRefs.current[s.id] = el }}
                    onClick={() => selectStore(s.id)}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                    style={isActive
                      ? { background: '#F59E0B', color: 'white' }
                      : isSwitchingTo
                      ? { background: '#FFFBEB', color: '#92400E', boxShadow: 'inset 0 0 0 1.5px #F59E0B' }
                      : { background: '#f4f4f5', color: '#52525b' }}>
                    {s.name} ({count}){isSwitchingTo ? '…' : ''}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-2 md:px-4 py-3 md:py-5 space-y-4 md:space-y-5 pb-28 w-full" id="mappings-scroll">

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
              新增品項對應（可套用到多間店面）
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
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>單據類型（可空白）</label>
                <select style={SELECT_ADD_STYLE} value={newDocType} onChange={e => setNewDocType(e.target.value)}>
                  <option value="">不指定</option>
                  {docTypeOptions.map(doc => <option key={doc} value={doc}>{doc}</option>)}
                </select>
              </div>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#334155' }}>一起套用到其他店面</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>同一個品項會分別建立到勾選的店面，不會覆蓋其他品項。</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => setBatchStoreIds(stores.map(s => s.id))}
                    className="text-[11px] font-semibold px-2 py-1 rounded-lg"
                    style={{ background: 'white', border: '1px solid #cbd5e1', color: '#475569' }}>全選</button>
                  <button type="button" onClick={() => setBatchStoreIds([activeStoreId])}
                    className="text-[11px] font-semibold px-2 py-1 rounded-lg"
                    style={{ background: 'white', border: '1px solid #cbd5e1', color: '#475569' }}>只選目前店</button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto pr-1">
                {stores.map(store => {
                  const checked = batchStoreIds.includes(store.id)
                  return (
                    <label key={store.id} className="flex items-center gap-2 min-h-10 px-2.5 rounded-lg cursor-pointer"
                      style={{ background: checked ? '#fffbeb' : 'white', border: `1px solid ${checked ? '#fbbf24' : '#e2e8f0'}` }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setBatchStoreIds(prev => checked ? prev.filter(id => id !== store.id) : [...prev, store.id])}
                        className="h-4 w-4 shrink-0" style={{ accentColor: '#F59E0B' }} />
                      <span className="text-xs font-medium truncate" style={{ color: checked ? '#92400E' : '#475569' }}>{store.name}</span>
                    </label>
                  )
                })}
              </div>
              {batchStoreIds.length === 0 && <p className="text-[11px] mt-2" style={{ color: '#be123c' }}>請至少選擇一間店面</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!newName.trim() || batchStoreIds.length === 0 || isPending}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', opacity: !newName.trim() || batchStoreIds.length === 0 || isPending ? 0.5 : 1 }}>
                {isPending ? '儲存中…' : `儲存到 ${batchStoreIds.length} 間店`}
              </button>
              <button onClick={() => { setShowAdd(false); setBatchStoreIds([]) }}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
                取消
              </button>
            </div>
          </div>
        )}

        {/* Empty state for store tab */}
        {isStorePage && groupOrder.length === 0 && !showAdd ? (
          <div className="text-center py-16">
            <p className="text-sm font-medium" style={{ color: '#a1a1aa' }}>此店尚無自訂品項對應</p>
            <p className="text-xs mt-1" style={{ color: '#d4d4d8' }}>請新增品項，或從其他店手動複製一次性設定</p>
          </div>
        ) : null}

        <div className="rounded-2xl p-4" style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A' }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg px-2.5 py-1 text-sm font-bold" style={{ background: '#F59E0B', color: 'white' }}>廠商</span>
                <span className="text-xs font-semibold" style={{ color: '#92400E' }}>{vendorChildGroups.length} 個廠商分類</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-5" style={{ color: '#78716c' }}>
                菜商、雜貨、免洗等都整理在此層，收據管理會同步顯示在「廠商」底下。
              </p>
            </div>
            <button type="button" onClick={() => { setNewVgMode('vendor'); setNewVgName(''); setShowAddVg(true) }}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold"
              style={{ background: 'white', border: '1.5px solid #F59E0B', color: '#92400E' }}>
              <Plus className="h-4 w-4" />新增廠商
            </button>
          </div>
          {vendorChildGroups.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {vendorChildGroups.map(name => (
                <span key={name} className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'white', border: '1px solid #FDE68A', color: '#92400E' }}>
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Mapping list — 以 vendor_group 為主分類 */}
        <DndContext sensors={sortMode ? sensors : []}
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
          const isVendorChild = vendorChildGroupSet.has(vg)
          const vgSt = isMiscVendorGroup(vg) ? VG_STYLE_UNCAT : DOC_TYPES.has(vg) ? VG_STYLE_DOC : VG_STYLE
          const isVgFirst = vgIdx === 0
          const isVgLast = vgIdx === groupOrder.length - 1
          // 每店獨立：雜項是舊空值／未分類的統一保留分類，不提供改名或刪除。
          const hasVgRecord = !isMiscVendorGroup(vg)
          return (
            <div key={vg} style={sortMode
              ? (isVendorChild ? { borderLeft: '3px solid #FDE68A', paddingLeft: 8 } : undefined)
              : {
                  contentVisibility: 'auto',
                  containIntrinsicSize: `auto ${Math.max(96, items.length * 58 + 56)}px`,
                  ...(isVendorChild ? { borderLeft: '3px solid #FDE68A', paddingLeft: 8 } : {}),
                }}>
              <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
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
                {sortMode && isMiscVendorGroup(vg) && (
                  <span className="text-[11px] font-medium" style={{ color: '#a1a1aa' }}>固定最後</span>
                )}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: vgSt.bg, color: vgSt.color }}>
                  {isVendorChild ? `廠商 / ${vg}` : vg}
                </span>
                <span className="text-xs" style={{ color: '#a1a1aa' }}>{items.length} 項</span>
                {/* 雜項常混合多種單據，只保留品項列自己的單據設定。 */}
                {!isMiscVendorGroup(vg) && (
                  <VgDocTypeSelector storeId={activeStoreId} vgName={vg} currentDoc={groupDocMap.get(vg) ?? null} />
                )}
                {isVendorChild && (
                  <VgItemCategorySelector
                    storeId={activeStoreId}
                    vgName={vg}
                    currentCategory={groupCategoryMap.get(vg) ?? '雜項'}
                    onDone={() => router.refresh()}
                  />
                )}
                {/* Rename / 刪除 */}
                {hasVgRecord && (
                  <VgActions
                    vgName={vg}
                    storeId={activeStoreId || null}
                    itemCount={items.length}
                    currentMode={isVendorChild ? 'vendor' : 'direct'}
                    allowModeChange={!DOC_TYPES.has(vg)}
                    onDone={() => router.refresh()}
                  />
                )}
                {/* 分類內快速新增品項（inline，就地展開輸入框） */}
                <button onClick={() => {
                  if (inlineAddVg === vg) { setInlineAddVg(null); return }
                  setInlineAddVg(vg); setInlineAddName(''); setInlineAddCat('食材'); setInlineAddDocType(groupDocMap.get(vg) ?? '')
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
                <div className="grid grid-cols-1 md:grid-cols-[1fr_130px_150px_auto_auto] items-end gap-2 mb-2 px-2 py-2 rounded-lg" style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A' }}>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: '#92400E' }}>品項名稱</label>
                    <input autoFocus value={inlineAddName} onChange={e => setInlineAddName(e.target.value)}
                      placeholder="例：辣椒"
                      onKeyDown={e => { if (e.key === 'Escape') { setInlineAddVg(null); setInlineAddName('') } }}
                      style={{ width: '100%', height: 34, padding: '0 8px', border: '1.5px solid #F59E0B', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: '#92400E' }}>類別</label>
                    <select value={inlineAddCat} onChange={e => setInlineAddCat(e.target.value)}
                      style={{ width: '100%', height: 34, padding: '0 8px', border: '1.5px solid #F59E0B', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: 'white', outline: 'none' }}>
                      <option>食材</option><option>耗材</option><option>雜項</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: '#92400E' }}>單據類型</label>
                    <select value={inlineAddDocType} onChange={e => setInlineAddDocType(e.target.value)}
                      style={{ width: '100%', height: 34, padding: '0 8px', border: '1.5px solid #F59E0B', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: 'white', outline: 'none' }}>
                      <option value="">不指定</option>
                      {docTypeOptions.map(doc => <option key={doc} value={doc}>{doc}</option>)}
                    </select>
                  </div>
                  <button disabled={!inlineAddName.trim() || isPending}
                    onClick={() => {
                      const name = inlineAddName.trim()
                      if (!name) return
                      startTransition(async () => {
                        const targetVg = isMiscVendorGroup(vg) ? MISC_VENDOR_GROUP : vg
                        const storeParam = activeStoreId || undefined
                        const r = await saveItemMapping(name, name, inlineAddCat, storeParam, targetVg)
                        if (r && 'error' in r) { toast.error('新增失敗：' + r.error); return }
                        if (inlineAddDocType.trim()) {
                          const docResult = await setItemDocOverride(name, storeParam ?? null, inlineAddDocType.trim())
                          if (docResult && 'error' in docResult) { toast.error('單據類型儲存失敗：' + docResult.error); return }
                        }
                        // Optimistic：若 auto-create 新 vg → 加入 vgsState
                        const newVg = (r as any)?.newVg
                        if (newVg) setVgsState(prev => prev.some(v => v.id === newVg.id) ? prev : [...prev, { ...newVg, doc_type: null }])
                        toast.success(`已加「${name}」到「${vg}」`)
                        setInlineAddName('')
                        router.refresh()
                      })
                    }}
                    className="text-xs font-semibold px-3 py-2 rounded-lg text-white"
                    style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', cursor: 'pointer', opacity: (!inlineAddName.trim() || isPending) ? 0.5 : 1 }}>
                    儲存
                  </button>
                  <button onClick={() => { setInlineAddVg(null); setInlineAddName('') }}
                    className="text-xs font-semibold px-2 py-2 rounded-lg"
                    style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b', cursor: 'pointer' }}>
                    取消
                  </button>
                </div>
              )}
              <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <SortableContext items={items.map(m => m.id)} strategy={verticalListSortingStrategy} disabled={!sortMode}>
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
                      <ItemMappingRow
                        key={m.id}
                        m={m}
                        isLast={idx === items.length - 1}
                        isStorePage={isStorePage}
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
                        itemOptions={taxItemOptionsByGroup.get(vg) ?? []}
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

type ItemRowProps = {
  m: Mapping; isLast: boolean; isStorePage: boolean
  selectMode: boolean; isSelected: boolean; onToggleSelect: () => void
  storesUsingIds: string[]; allStores: { id: string; name: string }[]
  itemOptions: string[]
  editId: string | null; editCol: string; editCat: string; editVendorGroup: string
  setEditCol: (v: string) => void; setEditCat: (v: string) => void; setEditVendorGroup: (v: string) => void
  startEdit: (m: Mapping) => void; handleUpdate: (id: string) => void; setEditId: (v: string | null) => void
  handleDelete: (id: string) => void; displayName: (m: Mapping) => string
}

/** 一般瀏覽完全不掛 dnd-kit；只有使用者按下「排序」才建立拖曳節點。 */
function ItemMappingRow({ sortMode, ...props }: ItemRowProps & { sortMode: boolean }) {
  return sortMode ? <SortableItemRow {...props} /> : <ItemRowContent {...props} />
}

function SortableItemRow(props: ItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.m.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderBottom: props.isLast ? 'none' : '1px solid #f4f4f5',
    background: isDragging ? '#fef3c7' : undefined,
  }
  const dragHandle = (
    <button {...attributes} {...listeners}
      className="shrink-0"
      style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, cursor: 'grab', color: '#92400e', padding: '4px', touchAction: 'none' }}
      title="拖曳排序"
      aria-label="拖曳排序">
      <GripVertical className="h-4 w-4" />
    </button>
  )
  return <ItemRowContent {...props} rowRef={setNodeRef} rowStyle={style} dragHandle={dragHandle} />
}

function ItemRowContent({
  m, isLast, isStorePage, selectMode, isSelected, onToggleSelect, storesUsingIds, allStores, itemOptions, editId, editCol, editCat, editVendorGroup,
  setEditCol, setEditCat, setEditVendorGroup, startEdit, handleUpdate, setEditId, handleDelete, displayName,
  rowRef, rowStyle, dragHandle,
}: ItemRowProps & {
  rowRef?: (node: HTMLElement | null) => void
  rowStyle?: React.CSSProperties
  dragHandle?: React.ReactNode
}) {
  const [showStores, setShowStores] = useState(false)
  const catSt = CAT_STYLE[m.item_category] ?? CAT_STYLE['雜項']
  const style: React.CSSProperties = rowStyle ?? { borderBottom: isLast ? 'none' : '1px solid #f4f4f5' }
  return (
    <div ref={rowRef} style={style} className="flex flex-wrap items-center gap-1.5 md:gap-2 px-2 md:px-3 py-2 md:py-2.5">
      {/* 選取模式：checkbox */}
      {selectMode && (
        <input type="checkbox" checked={isSelected} onChange={onToggleSelect}
          className="shrink-0 cursor-pointer" style={{ width: 18, height: 18, accentColor: '#dc2626' }} />
      )}
      {dragHandle}
      <span className="min-w-0 flex-1 basis-full text-sm font-semibold flex flex-wrap items-center gap-1.5 sm:basis-auto" style={{ color: '#18181b' }}>
        <InlineItemNameEditor mappingId={m.id} currentName={displayName(m)} fullName={m.item_name} excelColumn={m.excel_column} />
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
        <div className="w-full sm:w-auto">
          <ItemDocOverrideSelector
            itemName={m.item_name}
            storeId={m.store_id ?? null}
            currentOverride={m.doc_type_override ?? null}
            className="w-full sm:w-auto"
          />
        </div>
      )}
      {editId === m.id ? (
        <div className="w-full sm:w-auto flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
          <input list="excel-col-list" className="w-full sm:w-auto min-w-0 flex-1 sm:flex-none min-h-11 sm:min-h-0" style={{ ...SELECT_STYLE, height: undefined }}
            value={editCol} onChange={e => setEditCol(e.target.value)}
            placeholder="Excel 欄位" />
          <select className="w-full sm:w-auto min-h-11 sm:min-h-0" style={{ ...SELECT_STYLE, height: undefined }} value={editCat} onChange={e => setEditCat(e.target.value)}>
            <option>食材</option><option>耗材</option><option>雜項</option>
          </select>
          <input placeholder="分類（廠商或發票）" value={editVendorGroup} onChange={e => setEditVendorGroup(e.target.value)}
            className="w-full sm:w-[110px] min-h-11 sm:min-h-0"
            style={{ height: undefined, padding: '0 8px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '12px', background: 'white', outline: 'none', fontFamily: 'inherit' }} />
          <button onClick={() => handleUpdate(m.id)} className="min-h-11 min-w-11 flex items-center justify-center rounded-lg" style={{ color: '#047857' }} aria-label="儲存修改">
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => setEditId(null)} className="min-h-11 min-w-11 flex items-center justify-center rounded-lg" style={{ color: '#a1a1aa' }} aria-label="取消修改">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: catSt.bg, color: catSt.color }}>{m.item_category}</span>
          <RefundToggle mappingId={m.id} isRefund={!!m.is_refund} />
          <TaxAddonToggle
            mappingId={m.id}
            enabled={!!m.is_tax_addon}
            scope={m.tax_scope ?? 'category'}
            targetItem={m.tax_target_item ?? null}
            itemOptions={itemOptions}
          />
          <span className="hidden md:inline text-sm tabular-nums" style={{ color: '#71717a' }}>{m.excel_column}</span>
          <button onClick={() => startEdit(m)} className="min-h-10 min-w-10 flex items-center justify-center rounded-lg" style={{ color: '#d4d4d8' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F59E0B')}
            onMouseLeave={e => (e.currentTarget.style.color = '#d4d4d8')}>
            <Edit2 className="h-4 w-4" />
          </button>
          <button onClick={() => handleDelete(m.id)} className="min-h-10 min-w-10 flex items-center justify-center rounded-lg" style={{ color: '#d4d4d8' }}
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
function InlineItemNameEditor({ mappingId, currentName, fullName, excelColumn }: { mappingId: string; currentName: string; fullName: string; excelColumn: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(fullName)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  useEffect(() => { setValue(fullName) }, [fullName])

  async function save() {
    const trimmedValue = value.trim()
    const nameChanged = trimmedValue !== fullName
    const excelDiffersFromName = excelColumn !== trimmedValue
    if (!nameChanged && !excelDiffersFromName) { setEditing(false); return }
    const syncHistorical = nameChanged
      ? confirm(
          `要把既有帳目中的品項名稱一起改掉嗎？\n\n` +
          `舊名稱：${fullName}\n` +
          `新名稱：${trimmedValue}\n\n` +
          `按「確定」：同步覆蓋既有收據/叫貨明細，讓舊帳目也對到新名稱。\n` +
          `按「取消」：只改品項管理名稱，舊帳目保留舊名稱。`
        )
      : false
    const syncExcelColumn = excelDiffersFromName
      ? confirm(
          `Excel 對應欄位目前是「${excelColumn}」，也要一起改成「${trimmedValue}」嗎？\n\n` +
          `按「確定」：品項名稱與 Excel 欄位一起改。\n` +
          `按「取消」：Excel 欄位維持「${excelColumn}」。`
        )
      : true
    if (!nameChanged && !syncExcelColumn) { setEditing(false); return }
    setSaving(true)
    try {
      const { renameItem } = await import('@/app/actions/item-mappings')
      const r = await renameItem(mappingId, trimmedValue, syncHistorical, syncExcelColumn)
      if (r && 'error' in r) { toast.error(r.error); return }
      toast.success(syncHistorical ? '已改名，並同步既有帳目' : '已儲存')
      setEditing(false)
      router.refresh()
    } finally { setSaving(false) }
  }
  if (editing) {
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-1">
        <input autoFocus value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            // 不用 Enter 儲存，避免 IME 選字時誤觸；只保留 Esc 取消
            if (e.key === 'Escape') { setValue(fullName); setEditing(false) }
          }}
          disabled={saving}
          style={{ width: 'clamp(120px, 30vw, 280px)', minWidth: 0, padding: '2px 6px', border: '1.5px solid #F59E0B', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: '#18181b' }} />
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

/** 標記為稅外加自動品項；啟用後不再出現在店長端品項下拉。 */
function TaxAddonToggle({
  mappingId,
  enabled,
  scope: initialScope,
  targetItem: initialTargetItem,
  itemOptions,
}: {
  mappingId: string
  enabled: boolean
  scope: 'category' | 'item'
  targetItem: string | null
  itemOptions: string[]
}) {
  const [checked, setChecked] = useState(enabled)
  const [scope, setScope] = useState<'category' | 'item'>(initialScope)
  const [targetItem, setTargetItem] = useState(initialTargetItem ?? '')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  useEffect(() => setChecked(enabled), [enabled])
  useEffect(() => {
    setScope(initialScope)
    setTargetItem(initialTargetItem ?? '')
  }, [initialScope, initialTargetItem])

  function toggle() {
    const next = !checked
    setChecked(next)
    startTransition(async () => {
      const { setItemTaxAddonFlag } = await import('@/app/actions/item-mappings')
      const result = await setItemTaxAddonFlag(mappingId, next)
      if (result.error) {
        setChecked(!next)
        toast.error(result.error)
      } else {
        toast.success(next
          ? '已設為稅外加品項：名稱含「-稅金」時依原品項套用，否則依整個分類套用'
          : '已取消稅外加品項')
        router.refresh()
      }
    })
  }

  function updateScope(nextScope: 'category' | 'item') {
    const nextTarget = nextScope === 'item' ? (targetItem || itemOptions[0] || '') : ''
    if (nextScope === 'item' && !nextTarget) {
      toast.error('此分類沒有可指定的原始品項')
      return
    }
    setScope(nextScope)
    setTargetItem(nextTarget)
    startTransition(async () => {
      const { setItemTaxAddonScope } = await import('@/app/actions/item-mappings')
      const result = await setItemTaxAddonScope(mappingId, nextScope, nextTarget || null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(nextScope === 'item' ? `稅金只套用「${nextTarget}」` : '稅金套用整個分類')
      router.refresh()
    })
  }

  function updateTarget(nextTarget: string) {
    if (!nextTarget) return
    setTargetItem(nextTarget)
    startTransition(async () => {
      const { setItemTaxAddonScope } = await import('@/app/actions/item-mappings')
      const result = await setItemTaxAddonScope(mappingId, 'item', nextTarget)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`稅金只套用「${nextTarget}」`)
      router.refresh()
    })
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 shrink-0">
      <button type="button" onClick={toggle} disabled={pending}
        className="text-xs px-2 py-1 rounded-full shrink-0 font-semibold"
        style={{
          background: checked ? '#fff7ed' : 'white',
          color: checked ? '#c2410c' : '#a1a1aa',
          border: `1.5px solid ${checked ? '#fb923c' : '#e4e4e7'}`,
          opacity: pending ? 0.6 : 1,
        }}
        title={checked ? '此品項由店長端稅外加欄位自動寫入' : '啟用後可選擇套用整個分類或指定品項'}>
        {checked ? '✓ 稅外加' : '稅外加'}
      </button>
      {checked && (
        <select
          value={scope}
          onChange={e => updateScope(e.target.value as 'category' | 'item')}
          disabled={pending}
          className="text-[11px] rounded-md px-1.5 py-1"
          style={{ border: '1px solid #fed7aa', color: '#9a3412', background: '#fff7ed', maxWidth: 112 }}
          title="選擇稅金套用範圍">
          <option value="category">整個分類</option>
          <option value="item">指定品項</option>
        </select>
      )}
      {checked && scope === 'item' && (
        <select
          value={targetItem}
          onChange={e => updateTarget(e.target.value)}
          disabled={pending || itemOptions.length === 0}
          className="text-[11px] rounded-md px-1.5 py-1"
          style={{ border: '1px solid #fed7aa', color: '#9a3412', background: '#fff7ed', maxWidth: 120 }}
          title="指定稅金對應的原始品項">
          {itemOptions.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      )}
    </span>
  )
}

/** vg 修改名稱 / 刪除 */
function VgActions({
  vgName,
  storeId,
  itemCount,
  currentMode,
  allowModeChange,
  onDone,
}: {
  vgName: string
  storeId: string | null
  itemCount: number
  currentMode: 'vendor' | 'direct'
  allowModeChange: boolean
  onDone: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState(vgName)
  const [mode, setMode] = useState<'vendor' | 'direct'>(currentMode)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const targetName = newName.trim()
    if (!targetName) return
    if (targetName === vgName && (mode === currentMode || !storeId || !allowModeChange)) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      if (targetName !== vgName) {
        const { renameVendorGroup } = await import('@/app/actions/item-mappings')
        const renameResult = await renameVendorGroup(vgName, targetName, storeId ?? undefined)
        if ('error' in renameResult) { toast.error(String(renameResult.error)); return }
      }
      if (storeId && allowModeChange && mode !== currentMode) {
        const modeResult = await setStoreVendorGroupMode(storeId, targetName, mode)
        if ('error' in modeResult) { toast.error(String(modeResult.error)); return }
      }
      toast.success(mode !== currentMode ? '分類方式已更新，品項完整保留' : '已改名')
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
      <div className="flex flex-wrap items-center gap-1">
        <input value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            // 中文 IME 組字期間 Enter 是選字用，不能觸發提交
            if (e.key === 'Escape') setEditing(false)
          }}
          autoFocus
          style={{ height: 22, padding: '0 6px', fontSize: 11, borderRadius: 4, border: '1.5px solid #F59E0B', outline: 'none' }} />
        {storeId && allowModeChange && (
          <select value={mode} onChange={event => setMode(event.target.value as 'vendor' | 'direct')}
            aria-label="分類方式"
            style={{ height: 24, padding: '0 5px', fontSize: 11, borderRadius: 4, border: '1.5px solid #F59E0B', background: 'white' }}>
            <option value="vendor">廠商子類別</option>
            <option value="direct">獨立收據類別</option>
          </select>
        )}
        <button onClick={handleSave} disabled={saving}
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
      <button onClick={() => { setNewName(vgName); setMode(currentMode); setEditing(true) }}
        title="編輯名稱與分類方式"
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
function ItemDocOverrideSelector({ itemName, storeId, currentOverride, extraOptions = [], className = '' }: {
  itemName: string; storeId: string | null; currentOverride: string | null; extraOptions?: string[]; className?: string
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
    <select value={doc} onChange={e => handleChange(e.target.value)} disabled={saving} className={className}
      title={`「${itemName}」的單據 override（覆蓋廠商群組預設）`}
      style={{
        height: 22, padding: '0 4px', fontSize: 10, borderRadius: 4,
        border: `1px solid ${docColor(doc).bd}`,
        background: docColor(doc).bg, color: docColor(doc).fg,
        fontFamily: 'inherit', outline: 'none', fontWeight: doc ? 600 : 400, flexShrink: 0,
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
    <div className="w-full sm:w-auto" style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors sm:w-auto"
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

/** 廠商即使沒有明細品項，也能指定整筆金額要歸入食材／耗材／雜項。 */
function VgItemCategorySelector({
  storeId,
  vgName,
  currentCategory,
  onDone,
}: {
  storeId: string
  vgName: string
  currentCategory: string
  onDone?: () => void
}) {
  const [category, setCategory] = useState(currentCategory || '雜項')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setCategory(currentCategory || '雜項') }, [currentCategory])

  async function save(next: string) {
    setCategory(next)
    setSaving(true)
    try {
      const { setStoreVendorGroupItemCategory } = await import('@/app/actions/item-mappings')
      const result = await setStoreVendorGroupItemCategory(storeId, vgName, next)
      if ('error' in result) {
        toast.error(String(result.error))
        return
      }
      toast.success(`「${vgName}」已歸類為${next}`)
      onDone?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <select value={category} onChange={event => save(event.target.value)} disabled={saving}
      title={`「${vgName}」的報表金額分類`}
      style={{
        height: 22, padding: '0 4px', fontSize: 11, borderRadius: 4,
        border: `1px solid ${CAT_STYLE[category]?.color ?? '#d4d4d8'}`,
        background: CAT_STYLE[category]?.bg ?? 'white',
        color: CAT_STYLE[category]?.color ?? '#52525b',
        fontFamily: 'inherit', outline: 'none', fontWeight: 600,
      }}>
      <option value="食材">食材</option>
      <option value="耗材">耗材</option>
      <option value="雜項">雜項</option>
    </select>
  )
}

/** 廠商群組的單據類型（doc_type）快速編輯：每店獨立寫入該店分類底下的 mapping */
function VgDocTypeSelector({ storeId, vgName, currentDoc }: { storeId: string; vgName: string; currentDoc: string | null }) {
  const [doc, setDoc] = useState(currentDoc ?? '')
  const [saving, setSaving] = useState(false)
  // refresh 後同步 server 傳回的新值
  useEffect(() => { setDoc(currentDoc ?? '') }, [currentDoc])

  async function save(next: string) {
    setDoc(next)
    setSaving(true)
    try {
      const { setStoreVendorGroupDocType } = await import('@/app/actions/item-mappings')
      const r = await setStoreVendorGroupDocType(storeId, vgName, next || null)
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
      title={`「${vgName}」在本店的預設單據類型（會顯示在 Excel Row 2）`}
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
