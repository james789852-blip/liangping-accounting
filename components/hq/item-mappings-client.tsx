'use client'

import { useState, useTransition, useEffect, useMemo, useRef } from 'react'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import {
  archiveItemMapping, createStoreVendorGroup, deleteItemMapping, reactivateItemMapping, renameItem, updateItemMapping, saveItemMapping, reorderItemMappings, setItemDocOverride, reorderStoreVendorGroups, setStoreVendorGroupMode, setItemRefundFlag, setItemSignMode, setItemTaxAddonFlag, setItemTaxAddonScope,
} from '@/app/actions/item-mappings'
import { setManagerStore } from '@/app/actions/store-select'
import { useRouter } from 'next/navigation'
import { Trash2, Edit2, Check, X, Plus, Tag, ChevronLeft, ChevronUp, ChevronDown, PowerOff, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import HelpBox from './help-box'
import {
  isMiscVendorGroup,
  MISC_VENDOR_GROUP,
  normalizeVendorGroupName,
  RECEIPT_VENDOR_GROUP_EXCLUDED_NAMES,
} from '@/lib/linked-receipt-category'
import { isVendorOnlyMapping } from '@/lib/vendor-only-mapping'
import { isNegativeItem } from '@/lib/negative-items'
import type { ItemMappingSignMode } from '@/lib/item-mapping-availability'

interface Mapping {
  id: string; item_name: string; excel_column: string; item_category: string; store_id?: string | null; store_type?: string | null; vendor_group?: string | null; doc_type_override?: string | null; is_refund?: boolean; is_negative?: boolean; sign_mode?: ItemMappingSignMode; is_explicit_item?: boolean; is_tax_addon?: boolean; tax_scope?: 'category' | 'item' | null; tax_target_item?: string | null; sort_order?: number; vg_sort_order?: number; disabled_at?: string | null; archived?: boolean
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
  const [editName, setEditName] = useState('')
  const [editCol, setEditCol] = useState('')
  const [editCat, setEditCat] = useState('')
  const [editVendorGroup, setEditVendorGroup] = useState('')
  const [editDocType, setEditDocType] = useState('')
  const [editRefund, setEditRefund] = useState(false)
  const [editSignMode, setEditSignMode] = useState<ItemMappingSignMode>('positive')
  const [editTaxAddon, setEditTaxAddon] = useState(false)
  const [editTaxScope, setEditTaxScope] = useState<'category' | 'item'>('category')
  const [editTaxTarget, setEditTaxTarget] = useState('')
  const [newName, setNewName] = useState('')
  const [newCol, setNewCol] = useState('')
  const [newCat, setNewCat] = useState('食材')
  const [newVendorGroup, setNewVendorGroup] = useState('')
  const [newDocType, setNewDocType] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showAddVg, setShowAddVg] = useState(false)
  const [sortModeVg, setSortModeVg] = useState<string | null>(null)
  const [batchStoreIds, setBatchStoreIds] = useState<string[]>([])
  const [selectModeVg, setSelectModeVg] = useState<string | null>(null)
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
    setEditName('')
    setEditCol('')
    setEditCat('')
    setEditVendorGroup('')
    setEditDocType('')
    setEditRefund(false)
    setEditSignMode('positive')
    setEditTaxAddon(false)
    setEditTaxScope('category')
    setEditTaxTarget('')
    setNewName('')
    setNewCol('')
    setNewCat('食材')
    setNewVendorGroup('')
    setNewDocType('')
    setShowAdd(false)
    setShowAddVg(false)
    setSortModeVg(null)
    setBatchStoreIds([])
    setSelectModeVg(null)
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

  // 各店完全獨立：一次整理目前店家的顯示資料，避免 80+ 列在每次互動時反覆掃描。
  const { disabledMappings, grouped, groupOrder, groupDocMap, groupCategoryMap, taxItemOptionsByGroup } = useMemo(() => {
    const activeMappings = mappings
      .filter(mapping => mapping.store_id === activeStoreId && !mapping.disabled_at && !mapping.archived)
      .sort((a, b) => (a.sort_order ?? 999999) - (b.sort_order ?? 999999))
    const nextDisabledMappings = mappings
      .filter(mapping => mapping.store_id === activeStoreId && !!mapping.disabled_at && !mapping.archived && !isVendorOnlyMapping(mapping))
      .sort((a, b) => String(b.disabled_at).localeCompare(String(a.disabled_at)))
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
      disabledMappings: nextDisabledMappings,
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

  function mergeSavedMappings(savedMappings: Mapping[]) {
    if (savedMappings.length === 0) return
    setMappings(prev => {
      const next = [...prev]
      for (const saved of savedMappings) {
        const index = next.findIndex(mapping => mapping.id === saved.id)
        if (index === -1) next.push(saved)
        else next[index] = { ...next[index], ...saved }
      }
      return next
    })
  }

  function startEdit(m: Mapping) {
    setEditId(m.id)
    setEditName(m.item_name)
    setEditCol(m.excel_column)
    setEditCat(m.item_category)
    setEditVendorGroup(m.vendor_group ?? '')
    setEditDocType(m.doc_type_override ?? '')
    setEditRefund(!!m.is_refund)
    setEditSignMode(isNegativeItem(m.item_name) ? 'negative' : (m.sign_mode ?? (m.is_negative ? 'negative' : 'positive')))
    setEditTaxAddon(!!m.is_tax_addon)
    setEditTaxScope(m.tax_scope ?? 'category')
    setEditTaxTarget(m.tax_target_item ?? '')
  }

  function handleUpdate(id: string) {
    const current = mappings.find(mapping => mapping.id === id)
    const nextName = editName.trim()
    if (!current || !nextName) {
      toast.error('品項名稱不可空白')
      return
    }
    const nameChanged = nextName !== current.item_name
    const nextVendorGroup = editVendorGroup.trim() || null
    const vendorGroupChanged = nextVendorGroup !== (current.vendor_group ?? null)
    const syncHistorical = nameChanged
      ? confirm(
          `要把既有帳目中的品項名稱一起改掉嗎？\n\n` +
          `舊名稱：${current.item_name}\n` +
          `新名稱：${nextName}\n\n` +
          `按「確定」：同步更新既有帳目。\n` +
          `按「取消」：只修改品項管理名稱，既有帳目保留舊名稱。`
        )
      : false

    startTransition(async () => {
      // 同時改分類與名稱時，先用舊名稱同步 store_items 的分類關聯。
      if (vendorGroupChanged) {
        const mappingResult = await updateItemMapping(id, editCol, editCat, nextVendorGroup)
        if (mappingResult && 'error' in mappingResult) { toast.error('儲存失敗：' + mappingResult.error); return }
      }
      if (nameChanged) {
        const renameResult = await renameItem(id, nextName, syncHistorical, false)
        if (renameResult && 'error' in renameResult) { toast.error('名稱修改失敗：' + renameResult.error); return }
      }
      if (!vendorGroupChanged) {
        const mappingResult = await updateItemMapping(id, editCol, editCat)
        if (mappingResult && 'error' in mappingResult) { toast.error('儲存失敗：' + mappingResult.error); return }
      }
      if (editDocType !== (current.doc_type_override ?? '')) {
        const result = await setItemDocOverride(nextName, current.store_id ?? null, editDocType || null)
        if (result && 'error' in result) { toast.error('單據類型儲存失敗：' + result.error); return }
      }
      if (editRefund !== !!current.is_refund) {
        const result = await setItemRefundFlag(id, editRefund)
        if (result && 'error' in result) { toast.error('退稅設定儲存失敗：' + result.error); return }
      }
      const nextSignMode = isNegativeItem(current.item_name) ? 'negative' : editSignMode
      const currentSignMode = current.sign_mode ?? (current.is_negative ? 'negative' : 'positive')
      if (current.store_type !== '央廚' && nextSignMode !== currentSignMode) {
        const result = await setItemSignMode(id, nextSignMode)
        if (result && 'error' in result) { toast.error('正負數設定儲存失敗：' + result.error); return }
      }
      if (editTaxAddon !== !!current.is_tax_addon) {
        const result = await setItemTaxAddonFlag(id, editTaxAddon)
        if (result && 'error' in result) { toast.error('稅外加設定儲存失敗：' + result.error); return }
      }
      if (editTaxAddon && (editTaxScope !== (current.tax_scope ?? 'category') || editTaxTarget !== (current.tax_target_item ?? ''))) {
        const taxTarget = editTaxScope === 'item' ? editTaxTarget : null
        if (editTaxScope === 'item' && !taxTarget) { toast.error('請選擇稅外加對應品項'); return }
        const result = await setItemTaxAddonScope(id, editTaxScope, taxTarget)
        if (result && 'error' in result) { toast.error('稅外加範圍儲存失敗：' + result.error); return }
      }
      setMappings(prev => prev.map(mapping => mapping.id === id ? {
        ...mapping,
        item_name: nextName,
        excel_column: editCol,
        item_category: editCat,
        vendor_group: nextVendorGroup,
        doc_type_override: editDocType || null,
        is_refund: editRefund,
        sign_mode: nextSignMode,
        is_negative: nextSignMode === 'negative',
        is_tax_addon: editTaxAddon,
        tax_scope: editTaxScope,
        tax_target_item: editTaxScope === 'item' ? editTaxTarget : null,
      } : mapping))
      setEditId(null)
      toast.success(syncHistorical ? '已儲存，並同步既有帳目名稱' : '品項資料已儲存')
    })
  }

  function handleDelete(id: string) {
    if (!confirm('確定要刪除這個品項嗎？\n\n• 品項會立即從管理清單移除\n• 過去帳目的內容與金額會完整保留\n• 本月與歷史 Excel／試算表不受影響\n• 之後重新新增同名品項時仍可再次啟用')) return
    startTransition(async () => {
      const disableResult = await deleteItemMapping(id)
      if (disableResult && 'error' in disableResult) { toast.error(disableResult.error); return }
      const archiveResult = await archiveItemMapping(id)
      if (archiveResult && 'error' in archiveResult) { toast.error(archiveResult.error); return }
      setMappings(prev => prev.map(mapping => mapping.id === id ? { ...mapping, disabled_at: new Date().toISOString(), archived: true } : mapping))
      toast.success('品項已刪除；歷史帳目與報表完整保留')
    })
  }

  function handleReactivate(id: string) {
    startTransition(async () => {
      const result = await reactivateItemMapping(id)
      if (result && 'error' in result) { toast.error(result.error); return }
      setMappings(prev => prev.map(m => m.id === id ? { ...m, disabled_at: null } : m))
      toast.success('品項已重新啟用')
    })
  }

  function handleArchive(id: string) {
    if (!confirm('確定要刪除這個已停用品項嗎？\n\n• 品項會從管理清單移除\n• 過去帳目的品項內容與金額會完整保留\n• 本月與歷史 Excel／試算表不受影響\n• 資料庫中的品項身分不會被實體刪除\n• 之後重新新增同名、同分類品項時可再次啟用')) return
    startTransition(async () => {
      const result = await archiveItemMapping(id)
      if (result && 'error' in result) { toast.error(result.error); return }
      setMappings(prev => prev.map(mapping => mapping.id === id ? { ...mapping, archived: true } : mapping))
      toast.success('已從管理清單刪除；過去帳目內容與金額完整保留')
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
      mergeSavedMappings(results.flatMap(({ result }) => {
        const mapping = result?.mapping as Mapping | null | undefined
        if (!mapping) return []
        return [{
          ...mapping,
          doc_type_override: newDocType.trim() || mapping.doc_type_override,
          disabled_at: null,
          archived: false,
          is_explicit_item: result?.convertedPlaceholder ? true : mapping.is_explicit_item,
        }]
      }))
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
    })
  }

  function moveItem(vg: string, idx: number, direction: 'up' | 'down') {
    const items = grouped[vg]
    if (!items) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= items.length) return
    const reordered = [...items]
    ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
    const orderById = new Map(reordered.map((mapping, orderIdx) => [mapping.id, (orderIdx + 1) * 10]))
    // optimistic update：直接改 sort_order，畫面排序會立即反映，不必等整頁刷新。
    setMappings(prev => prev.map(mapping => {
      const sortOrder = orderById.get(mapping.id)
      return sortOrder == null ? mapping : { ...mapping, sort_order: sortOrder }
    }))
    reorderItemMappings(reordered.map(item => item.id))
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
    if (!confirm(`確定要安全停用 ${ids.length} 個品項嗎？\n\n新帳目會立刻停止顯示；本月與過去月份報表完整保留，下個月起才移除欄位。`)) return
    startTransition(async () => {
      const { batchDeleteItemMappings } = await import('@/app/actions/item-mappings')
      const r = await batchDeleteItemMappings(ids)
      if (r && 'error' in r) { toast.error(r.error); return }
      toast.success(`已安全停用 ${(r as any).disabled ?? ids.length} 個品項，歷史帳目不受影響`)
      setSelectedIds(new Set())
      setSelectModeVg(null)
      router.refresh()
    })
  }

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ background: '#fafafa' }}>

      {/* 浮動選取工具列 */}
      {selectModeVg && selectedIds.size > 0 && (
        <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] lg:bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg"
          style={{ background: 'white', border: '1.5px solid #fecaca', boxShadow: '0 8px 24px rgba(220,38,38,0.15)' }}>
          <span className="text-sm font-semibold" style={{ color: '#18181b' }}>已選 {selectedIds.size} 個品項</span>
          <button onClick={() => setSelectedIds(new Set())}
            className="text-xs font-semibold px-2 py-1 rounded-lg"
            style={{ background: '#fafafa', border: '1px solid #e4e4e7', color: '#52525b', cursor: 'pointer' }}>清除</button>
          <button onClick={handleBatchDelete} disabled={isPending}
            className="text-xs font-semibold px-3 py-1 rounded-lg text-white flex items-center gap-1"
            style={{ background: '#dc2626', cursor: 'pointer', opacity: isPending ? 0.5 : 1 }}>
            <PowerOff className="h-3 w-3" /> 安全停用選中
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
        {groupOrder.map((vg, vgIdx) => {
          const items = grouped[vg]
          const isVendorChild = vendorChildGroupSet.has(vg)
          const vgSt = isMiscVendorGroup(vg) ? VG_STYLE_UNCAT : DOC_TYPES.has(vg) ? VG_STYLE_DOC : VG_STYLE
          const isVgFirst = vgIdx === 0
          const isVgLast = vgIdx === groupOrder.length - 1
          const isSortingVg = sortModeVg === vg
          const isSelectingVg = selectModeVg === vg
          // 每店獨立：雜項是舊空值／未分類的統一保留分類，不提供改名或刪除。
          const hasVgRecord = !isMiscVendorGroup(vg)
          return (
            <div key={vg} style={isSortingVg || isSelectingVg
              ? (isVendorChild ? { borderLeft: '3px solid #FDE68A', paddingLeft: 8 } : undefined)
              : {
                  contentVisibility: 'auto',
                  containIntrinsicSize: `auto ${Math.max(96, items.length * 58 + 56)}px`,
                  ...(isVendorChild ? { borderLeft: '3px solid #FDE68A', paddingLeft: 8 } : {}),
                }}>
              <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
                {isSortingVg && hasVgRecord && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveVendorGroup(vg, 'up')} disabled={isVgFirst || isPending}
                      className="flex min-h-9 min-w-9 items-center justify-center rounded-lg"
                      style={{ background: '#fef3c7', border: '1px solid #fbbf24', cursor: isVgFirst ? 'default' : 'pointer', color: isVgFirst ? '#d4d4d8' : '#92400e', opacity: isPending ? 0.5 : 1 }} title="分類上移" aria-label={`${vg}分類上移`}>
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => moveVendorGroup(vg, 'down')} disabled={isVgLast || isPending}
                      className="flex min-h-9 min-w-9 items-center justify-center rounded-lg"
                      style={{ background: '#fef3c7', border: '1px solid #fbbf24', cursor: isVgLast ? 'default' : 'pointer', color: isVgLast ? '#d4d4d8' : '#92400e', opacity: isPending ? 0.5 : 1 }} title="分類下移" aria-label={`${vg}分類下移`}>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {isSortingVg && isMiscVendorGroup(vg) && (
                  <span className="text-[11px] font-medium" style={{ color: '#a1a1aa' }}>固定最後</span>
                )}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: vgSt.bg, color: vgSt.color }}>
                  {isVendorChild ? `廠商 / ${vg}` : vg}
                </span>
                <span className="text-xs" style={{ color: '#a1a1aa' }}>{items.length} 項</span>
                {/* 分類設定一律先按編輯，避免瀏覽時誤觸下拉選單。 */}
                {hasVgRecord && (
                  <VgActions
                    vgName={vg}
                    storeId={activeStoreId || null}
                    itemCount={items.length}
                    currentMode={isVendorChild ? 'vendor' : 'direct'}
                    allowModeChange={!DOC_TYPES.has(vg)}
                    currentDoc={isMiscVendorGroup(vg) ? null : (groupDocMap.get(vg) ?? null)}
                    currentCategory={isVendorChild ? (groupCategoryMap.get(vg) ?? '雜項') : null}
                    onDone={() => router.refresh()}
                  />
                )}
                <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                  <button type="button" onClick={() => {
                    setSortModeVg(current => current === vg ? null : vg)
                    setSelectModeVg(null)
                    setSelectedIds(new Set())
                  }}
                    className="flex min-h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold"
                    style={isSortingVg
                      ? { background: '#F59E0B', color: 'white', border: '1px solid #F59E0B' }
                      : { background: 'white', color: '#52525b', border: '1px solid #e4e4e7' }}
                    title={isSortingVg ? `完成「${vg}」排序` : `排序「${vg}」內的品項`}>
                    {isSortingVg ? <Check className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                    {isSortingVg ? '完成' : '排序'}
                  </button>
                  <button type="button" onClick={() => {
                    const closing = selectModeVg === vg
                    setSelectModeVg(closing ? null : vg)
                    setSortModeVg(null)
                    setSelectedIds(new Set())
                  }}
                    className="flex min-h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold"
                    style={isSelectingVg
                      ? { background: '#dc2626', color: 'white', border: '1px solid #dc2626' }
                      : { background: 'white', color: '#52525b', border: '1px solid #e4e4e7' }}
                    title={isSelectingVg ? `取消選取「${vg}」品項` : `選取「${vg}」內的品項`}>
                    {isSelectingVg ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                    {isSelectingVg ? '取消' : '選取'}
                  </button>
                  {/* 分類內快速新增品項（inline，就地展開輸入框） */}
                  <button onClick={() => {
                    if (inlineAddVg === vg) { setInlineAddVg(null); return }
                    setInlineAddVg(vg); setInlineAddName(''); setInlineAddCat('食材'); setInlineAddDocType(groupDocMap.get(vg) ?? '')
                  }}
                    className="flex min-h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold"
                    style={inlineAddVg === vg
                      ? { background: '#F59E0B', color: 'white', border: '1px solid #F59E0B', cursor: 'pointer' }
                      : { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', cursor: 'pointer' }}
                    title={`新增品項到「${vg}」`}>
                    <Plus className="h-3 w-3" /> 加品項
                  </button>
                </div>
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
                        const savedMapping = (r as { mapping?: Mapping; convertedPlaceholder?: boolean })?.mapping
                        if (savedMapping) {
                          mergeSavedMappings([{
                            ...savedMapping,
                            doc_type_override: inlineAddDocType.trim() || savedMapping.doc_type_override,
                            disabled_at: null,
                            archived: false,
                            is_explicit_item: (r as { convertedPlaceholder?: boolean })?.convertedPlaceholder
                              ? true
                              : savedMapping.is_explicit_item,
                          }])
                        }
                        // Optimistic：若 auto-create 新 vg → 加入 vgsState
                        const newVg = (r as any)?.newVg
                        if (newVg) setVgsState(prev => prev.some(v => v.id === newVg.id) ? prev : [...prev, { ...newVg, doc_type: null }])
                        toast.success(`已加「${name}」到「${vg}」`)
                        setInlineAddVg(null)
                        setInlineAddName('')
                        setInlineAddCat('食材')
                        setInlineAddDocType('')
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
                        sortMode={isSortingVg}
                        selectMode={isSelectingVg}
                        onMoveUp={() => moveItem(vg, idx, 'up')}
                        onMoveDown={() => moveItem(vg, idx, 'down')}
                        canMoveUp={idx > 0}
                        canMoveDown={idx < items.length - 1}
                        sortingPending={isPending}
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
                        editName={editName}
                        editCol={editCol}
                        editCat={editCat}
                        editVendorGroup={editVendorGroup}
                        editDocType={editDocType}
                        editRefund={editRefund}
                        editSignMode={editSignMode}
                        editTaxAddon={editTaxAddon}
                        editTaxScope={editTaxScope}
                        editTaxTarget={editTaxTarget}
                        setEditName={setEditName}
                        setEditCol={setEditCol}
                        setEditCat={setEditCat}
                        setEditVendorGroup={setEditVendorGroup}
                        setEditDocType={setEditDocType}
                        setEditRefund={setEditRefund}
                        setEditSignMode={setEditSignMode}
                        setEditTaxAddon={setEditTaxAddon}
                        setEditTaxScope={setEditTaxScope}
                        setEditTaxTarget={setEditTaxTarget}
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
              </div>
            </div>
          )
        })}

        {disabledMappings.length > 0 && (
          <section className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e4e4e7', background: 'white' }}>
            <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: '#f4f4f5' }}>
              <div>
                <h2 className="text-sm font-bold" style={{ color: '#52525b' }}>已安全停用品項</h2>
                <p className="mt-0.5 text-[11px]" style={{ color: '#71717a' }}>
                  新帳目不再顯示；本月與過去月份報表仍保留原欄位與金額。
                </p>
              </div>
              <span className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold" style={{ background: 'white', color: '#71717a' }}>
                {disabledMappings.length} 項
              </span>
            </div>
            {disabledMappings.map((mapping, index) => (
              <div key={mapping.id} className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: index === 0 ? 'none' : '1px solid #f4f4f5' }}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold" style={{ color: '#52525b' }}>{displayName(mapping)}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>
                      {normalizeVendorGroupName(mapping.vendor_group)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px]" style={{ color: '#a1a1aa' }}>
                    停用時間：{mapping.disabled_at ? new Date(mapping.disabled_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '—'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => handleReactivate(mapping.id)} disabled={isPending}
                    className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold"
                    style={{ border: '1px solid #86efac', background: '#f0fdf4', color: '#047857', opacity: isPending ? 0.5 : 1 }}>
                    <RotateCcw className="h-3.5 w-3.5" /> 重新啟用
                  </button>
                  <button type="button" onClick={() => handleArchive(mapping.id)} disabled={isPending}
                    className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold"
                    style={{ border: '1px solid #fecaca', background: '#fff1f2', color: '#be123c', opacity: isPending ? 0.5 : 1 }}>
                    <Trash2 className="h-3.5 w-3.5" /> 刪除（保留歷史）
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}

type ItemRowProps = {
  m: Mapping; isLast: boolean; isStorePage: boolean
  sortMode: boolean
  onMoveUp: () => void; onMoveDown: () => void
  canMoveUp: boolean; canMoveDown: boolean; sortingPending: boolean
  selectMode: boolean; isSelected: boolean; onToggleSelect: () => void
  storesUsingIds: string[]; allStores: { id: string; name: string }[]
  itemOptions: string[]
  editId: string | null; editName: string; editCol: string; editCat: string; editVendorGroup: string
  editDocType: string; editRefund: boolean; editSignMode: ItemMappingSignMode
  editTaxAddon: boolean; editTaxScope: 'category' | 'item'; editTaxTarget: string
  setEditName: (v: string) => void; setEditCol: (v: string) => void; setEditCat: (v: string) => void; setEditVendorGroup: (v: string) => void
  setEditDocType: (v: string) => void; setEditRefund: (v: boolean) => void; setEditSignMode: (v: ItemMappingSignMode) => void
  setEditTaxAddon: (v: boolean) => void; setEditTaxScope: (v: 'category' | 'item') => void; setEditTaxTarget: (v: string) => void
  startEdit: (m: Mapping) => void; handleUpdate: (id: string) => void; setEditId: (v: string | null) => void
  handleDelete: (id: string) => void; displayName: (m: Mapping) => string
}

function ItemMappingRow(props: ItemRowProps) {
  return <ItemRowContent {...props} />
}

function ItemRowContent({
  m, isLast, isStorePage, sortMode, onMoveUp, onMoveDown, canMoveUp, canMoveDown, sortingPending,
  selectMode, isSelected, onToggleSelect, storesUsingIds, allStores, itemOptions, editId, editName, editCol, editCat, editVendorGroup,
  editDocType, editRefund, editSignMode, editTaxAddon, editTaxScope, editTaxTarget,
  setEditName, setEditCol, setEditCat, setEditVendorGroup, setEditDocType, setEditRefund, setEditSignMode,
  setEditTaxAddon, setEditTaxScope, setEditTaxTarget, startEdit, handleUpdate, setEditId, handleDelete, displayName,
}: ItemRowProps) {
  const [showStores, setShowStores] = useState(false)
  const catSt = CAT_STYLE[m.item_category] ?? CAT_STYLE['雜項']
  const style: React.CSSProperties = { borderBottom: isLast ? 'none' : '1px solid #f4f4f5' }
  return (
    <div style={style} className={`flex flex-wrap gap-1.5 md:gap-2 px-2 md:px-3 py-2 md:py-2.5 ${sortMode ? 'items-start' : 'items-center'}`}>
      {/* 選取模式：checkbox */}
      {selectMode && (
        <input type="checkbox" checked={isSelected} onChange={onToggleSelect}
          className="shrink-0 cursor-pointer" style={{ width: 18, height: 18, accentColor: '#dc2626' }} />
      )}
      {sortMode && (
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onMoveUp} disabled={!canMoveUp || sortingPending}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg"
            style={{ background: '#fffbeb', border: '1px solid #fbbf24', color: canMoveUp ? '#92400e' : '#d4d4d8', opacity: sortingPending ? 0.5 : 1 }}
            title="品項上移" aria-label={`${displayName(m)}上移`}>
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={!canMoveDown || sortingPending}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg"
            style={{ background: '#fffbeb', border: '1px solid #fbbf24', color: canMoveDown ? '#92400e' : '#d4d4d8', opacity: sortingPending ? 0.5 : 1 }}
            title="品項下移" aria-label={`${displayName(m)}下移`}>
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className={sortMode ? 'min-w-0 flex-1 space-y-2' : 'contents'}>
        <div className={sortMode ? 'flex min-w-0 items-center gap-2' : 'contents'}>
          <span className={`min-w-0 flex-1 text-sm font-semibold flex flex-wrap items-center gap-1.5 ${sortMode ? 'sm:whitespace-nowrap' : selectMode ? 'basis-0' : 'basis-full sm:basis-auto'}`} style={{ color: '#18181b' }}>
            {displayName(m)}
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
            <span className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold"
              style={{
                background: docColor(m.doc_type_override ?? '').bg,
                color: docColor(m.doc_type_override ?? '').fg,
                border: `1px solid ${docColor(m.doc_type_override ?? '').bd}`,
              }}>
              {m.doc_type_override || '單據預設'}
            </span>
          )}
        </div>
        <div className={sortMode ? 'flex min-w-0 flex-wrap items-center gap-1.5 md:gap-2' : 'contents'}>
          {editId === m.id ? (
            <div className="w-full rounded-2xl p-4 shadow-sm sm:p-5" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
              <div className="mb-4 flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#fde68a' }}>
                <div>
                  <div className="text-sm font-bold" style={{ color: '#78350f' }}>編輯品項設定</div>
                  <div className="mt-0.5 text-xs" style={{ color: '#a16207' }}>所有欄位只會在按下儲存後套用</div>
                </div>
                <span className="mt-1 self-start rounded-full px-2.5 py-1 text-[11px] font-semibold sm:mt-0" style={{ color: '#92400e', background: '#fef3c7' }}>
                  {displayName(m)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="block text-xs font-bold" style={{ color: '#92400e' }}>品項名稱</span>
                  <input value={editName} onChange={e => setEditName(e.target.value)} className="h-12 w-full min-w-0" style={{ ...INPUT_STYLE, height: undefined }} />
                </label>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="block text-xs font-bold" style={{ color: '#92400e' }}>Excel 對應名稱</span>
                  <input list="excel-col-list" value={editCol} onChange={e => setEditCol(e.target.value)} className="h-12 w-full min-w-0" style={{ ...INPUT_STYLE, height: undefined }} />
                </label>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="block text-xs font-bold" style={{ color: '#92400e' }}>品項類別</span>
                  <select className="h-12 w-full" style={{ ...SELECT_ADD_STYLE, height: undefined }} value={editCat} onChange={e => setEditCat(e.target.value)}>
                    <option>食材</option><option>耗材</option><option>雜項</option>
                  </select>
                </label>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="block text-xs font-bold" style={{ color: '#92400e' }}>廠商／分類</span>
                  <input value={editVendorGroup} onChange={e => setEditVendorGroup(e.target.value)} className="h-12 w-full min-w-0" style={{ ...INPUT_STYLE, height: undefined }} />
                </label>
              </div>

              <div className="mb-2 mt-5 text-xs font-bold" style={{ color: '#92400e' }}>帳務設定</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="flex min-h-[124px] min-w-0 flex-col rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid #fde68a' }}>
                  <span className="block text-xs font-bold" style={{ color: '#92400e' }}>單據類型</span>
                  <div className="mt-1 text-[10px]" style={{ color: '#a16207' }}>選擇這個品項使用的單據</div>
                  <select value={editDocType} onChange={event => {
                    if (event.target.value === '__custom__') {
                      const custom = prompt('輸入自訂單據類型名稱（例：巷日開）:')?.trim()
                      if (custom) setEditDocType(custom)
                      return
                    }
                    setEditDocType(event.target.value)
                  }} className="mt-auto h-11 w-full min-w-0 rounded-lg px-3 text-xs font-semibold"
                    style={{ border: `1px solid ${docColor(editDocType).bd}`, background: docColor(editDocType).bg, color: docColor(editDocType).fg }}>
                    <option value="">單據預設</option>
                    {Array.from(new Set([...BUILTIN_DOC_TYPES, ...(editDocType && !BUILTIN_DOC_TYPES.includes(editDocType) ? [editDocType] : [])])).map(doc => (
                      <option key={doc} value={doc}>{doc}</option>
                    ))}
                    <option value="__custom__">➕ 新增自訂…</option>
                  </select>
                </label>
                <div className="flex min-h-[124px] min-w-0 flex-col rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid #fde68a' }}>
                  <span className="block text-xs font-bold" style={{ color: '#92400e' }}>退稅設定</span>
                  <div className="mt-1 text-[10px]" style={{ color: '#a16207' }}>是否納入退稅金額</div>
                  <button type="button" onClick={() => setEditRefund(!editRefund)}
                    className="mt-auto h-11 w-full rounded-lg px-3 text-xs font-semibold"
                    style={editRefund
                      ? { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }
                      : { background: 'white', color: '#71717a', border: '1px solid #e4e4e7' }}>
                    {editRefund ? '✓ 納入退稅' : '不納入退稅'}
                  </button>
                </div>
                {m.store_type !== '央廚' && (
                  <label className="flex min-h-[124px] min-w-0 flex-col rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid #fde68a' }}>
                    <span className="block text-xs font-bold" style={{ color: '#92400e' }}>金額正負</span>
                    <div className="mt-1 text-[10px]" style={{ color: '#a16207' }}>只影響之後帳目，歷史帳目不變</div>
                    <select value={editSignMode} onChange={event => setEditSignMode(event.target.value as ItemMappingSignMode)}
                      disabled={isNegativeItem(m.item_name)} className="mt-auto h-11 w-full rounded-lg px-3 text-xs font-semibold"
                      style={{ border: '1px solid #e4e4e7', background: 'white', color: '#52525b' }}>
                      <option value="positive">固定正數</option>
                      <option value="negative">固定負數</option>
                      <option value="flexible">每筆正負</option>
                    </select>
                  </label>
                )}
                <div className="flex min-h-[124px] min-w-0 flex-col rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid #fde68a' }}>
                  <span className="block text-xs font-bold" style={{ color: '#92400e' }}>稅外加設定</span>
                  <div className="mt-1 text-[10px]" style={{ color: '#a16207' }}>設定稅金的計算範圍</div>
                  <div className="mt-auto grid grid-cols-1 gap-2 2xl:grid-cols-2">
                    <button type="button" onClick={() => setEditTaxAddon(!editTaxAddon)}
                      className={`h-11 w-full rounded-lg px-3 text-xs font-semibold ${editTaxAddon ? '' : '2xl:col-span-2'}`}
                      style={editTaxAddon
                        ? { background: '#fff7ed', color: '#c2410c', border: '1px solid #fb923c' }
                        : { background: 'white', color: '#71717a', border: '1px solid #e4e4e7' }}>
                      {editTaxAddon ? '✓ 稅外加' : '非稅外加'}
                    </button>
                    {editTaxAddon && (
                      <select value={editTaxScope} onChange={event => {
                        const scope = event.target.value as 'category' | 'item'
                        setEditTaxScope(scope)
                        if (scope === 'item' && !editTaxTarget) setEditTaxTarget(itemOptions[0] ?? '')
                      }} className="h-11 w-full min-w-0 rounded-lg px-2 text-xs" style={{ border: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412' }}>
                        <option value="category">整個分類</option>
                        <option value="item">指定品項</option>
                      </select>
                    )}
                    {editTaxAddon && editTaxScope === 'item' && (
                      <select value={editTaxTarget} onChange={event => setEditTaxTarget(event.target.value)}
                        className="h-11 w-full min-w-0 rounded-lg px-2 text-xs 2xl:col-span-2" style={{ border: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412' }}>
                        <option value="">選擇品項</option>
                        {itemOptions.filter(item => item !== m.item_name).map(item => <option key={item} value={item}>{item}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end" style={{ borderColor: '#fde68a' }}>
                <button onClick={() => setEditId(null)} className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-semibold sm:w-auto sm:min-w-[112px]"
                  style={{ color: '#52525b', background: 'white', border: '1px solid #e4e4e7' }}>
                  <X className="h-4 w-4" /> 取消
                </button>
                <button onClick={() => handleUpdate(m.id)} disabled={!editName.trim() || sortingPending}
                  className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-semibold text-white shadow-sm sm:w-auto sm:min-w-[128px]"
                  style={{ background: '#f59e0b', opacity: (!editName.trim() || sortingPending) ? 0.5 : 1 }}>
                  <Check className="h-4 w-4" /> 儲存
                </button>
              </div>
            </div>
          ) : (
            <>
              <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0"
                style={{ background: catSt.bg, color: catSt.color }}>{m.item_category}</span>
              {m.is_refund && <span className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold" style={{ background: '#dcfce7', color: '#166534' }}>退稅</span>}
              <span className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold" style={{ background: '#f4f4f5', color: '#52525b' }}>
                {isNegativeItem(m.item_name) || m.sign_mode === 'negative' ? '固定負數' : m.sign_mode === 'flexible' ? '每筆正負' : '固定正數'}
              </span>
              {m.is_tax_addon && <span className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold" style={{ background: '#fff7ed', color: '#c2410c' }}>稅外加</span>}
              <span className="hidden md:inline text-sm tabular-nums" style={{ color: '#71717a' }}>Excel：{m.excel_column}</span>
              <button onClick={() => startEdit(m)} className="flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold"
                style={{ color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a' }}
                title="編輯品項所有設定" aria-label="編輯品項所有設定">
                <Edit2 className="h-4 w-4" /> 編輯
              </button>
              <button onClick={() => handleDelete(m.id)} className="flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold"
                style={{ color: '#be123c', background: '#fff1f2', border: '1px solid #fecaca' }}
                title="刪除品項（安全保留歷史帳目與報表）" aria-label="刪除品項">
                <Trash2 className="h-4 w-4" /> 刪除
              </button>
            </>
          )}
        </div>
      </div>
    </div>
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

/** 分類設定統一由「編輯」進入，避免名稱、單據類型或報表類別被誤觸。 */
function VgActions({
  vgName,
  storeId,
  itemCount,
  currentMode,
  allowModeChange,
  currentDoc,
  currentCategory,
  onDone,
}: {
  vgName: string
  storeId: string | null
  itemCount: number
  currentMode: 'vendor' | 'direct'
  allowModeChange: boolean
  currentDoc: string | null
  currentCategory: string | null
  onDone: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState(vgName)
  const [mode, setMode] = useState<'vendor' | 'direct'>(currentMode)
  const [doc, setDoc] = useState(currentDoc ?? '')
  const [category, setCategory] = useState(currentCategory ?? '雜項')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editing) return
    setNewName(vgName)
    setMode(currentMode)
    setDoc(currentDoc ?? '')
    setCategory(currentCategory ?? '雜項')
  }, [editing, vgName, currentMode, currentDoc, currentCategory])

  function startEditing() {
    setNewName(vgName)
    setMode(currentMode)
    setDoc(currentDoc ?? '')
    setCategory(currentCategory ?? '雜項')
    setEditing(true)
  }

  function cancelEditing() {
    setNewName(vgName)
    setMode(currentMode)
    setDoc(currentDoc ?? '')
    setCategory(currentCategory ?? '雜項')
    setEditing(false)
  }

  function changeDoc(value: string) {
    if (value === '__custom__') {
      const custom = prompt('輸入自訂單據類型名稱（例：巷日開）:')?.trim()
      if (custom) setDoc(custom)
      return
    }
    setDoc(value)
  }

  async function handleSave() {
    const targetName = newName.trim()
    if (!targetName) return
    const nameChanged = targetName !== vgName
    const modeChanged = !!storeId && allowModeChange && mode !== currentMode
    const docChanged = !!storeId && doc !== (currentDoc ?? '')
    const categoryChanged = !!storeId && mode === 'vendor' && (currentCategory === null || category !== currentCategory)
    if (!nameChanged && !modeChanged && !docChanged && !categoryChanged) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      if (nameChanged) {
        const { renameVendorGroup } = await import('@/app/actions/item-mappings')
        const renameResult = await renameVendorGroup(vgName, targetName, storeId ?? undefined)
        if ('error' in renameResult) { toast.error(String(renameResult.error)); return }
      }
      if (modeChanged && storeId) {
        const modeResult = await setStoreVendorGroupMode(storeId, targetName, mode)
        if ('error' in modeResult) { toast.error(String(modeResult.error)); return }
      }
      if (docChanged && storeId) {
        const { setStoreVendorGroupDocType } = await import('@/app/actions/item-mappings')
        const docResult = await setStoreVendorGroupDocType(storeId, targetName, doc || null)
        if ('error' in docResult) { toast.error(String(docResult.error)); return }
      }
      if (categoryChanged && storeId) {
        const { setStoreVendorGroupItemCategory } = await import('@/app/actions/item-mappings')
        const categoryResult = await setStoreVendorGroupItemCategory(storeId, targetName, category)
        if ('error' in categoryResult) { toast.error(String(categoryResult.error)); return }
      }
      toast.success('分類設定已儲存，歷史帳目不變')
      setEditing(false)
      onDone()
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    const scope = storeId ? '本店' : '所有店家'
    if (!confirm(`確定安全停用「${vgName}」廠商群組？（${scope}，共 ${itemCount} 個品項）\n\n新帳目會停止顯示；本月與過去月份的 Excel／試算表欄位及金額都會保留。`)) return
    setSaving(true)
    try {
      const { deleteVendorGroupWithItems } = await import('@/app/actions/item-mappings')
      const r = await deleteVendorGroupWithItems(vgName, storeId ?? undefined)
      if ('error' in r) { toast.error(String(r.error)); return }
      toast.success(`已安全停用 ${r.mappingsDisabled} 個品項，歷史帳目不受影響`)
      onDone()
    } finally { setSaving(false) }
  }

  if (editing) {
    const docOptions = Array.from(new Set([...BUILTIN_DOC_TYPES, ...(doc && !BUILTIN_DOC_TYPES.includes(doc) ? [doc] : [])]))
    return (
      <div className="order-last mt-2 w-full basis-full rounded-2xl p-4 shadow-sm sm:p-5" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
        <div className="mb-4 flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#fde68a' }}>
          <div>
            <div className="text-sm font-bold" style={{ color: '#78350f' }}>編輯分類設定</div>
            <div className="mt-0.5 text-xs" style={{ color: '#a16207' }}>名稱、分類方式與帳務設定會在儲存後一起套用</div>
          </div>
          <span className="mt-1 self-start rounded-full px-2.5 py-1 text-[11px] font-semibold sm:mt-0" style={{ color: '#92400e', background: '#fef3c7' }}>
            {vgName}・{itemCount} 項
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-xs font-bold" style={{ color: '#92400e' }}>分類名稱</span>
            <input value={newName} onChange={event => setNewName(event.target.value)}
              onKeyDown={event => { if (event.key === 'Escape') cancelEditing() }}
              autoFocus className="h-12 w-full min-w-0" style={{ ...INPUT_STYLE, height: undefined }} />
          </label>
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-xs font-bold" style={{ color: '#92400e' }}>分類方式</span>
            <select value={mode} onChange={event => {
              const nextMode = event.target.value as 'vendor' | 'direct'
              setMode(nextMode)
              if (nextMode === 'direct') setCategory('雜項')
            }}
              disabled={!storeId || !allowModeChange} aria-label="分類方式"
              className="h-12 w-full" style={{ ...SELECT_ADD_STYLE, height: undefined, opacity: (!storeId || !allowModeChange) ? 0.65 : 1 }}>
              <option value="vendor">廠商子類別</option>
              <option value="direct">獨立收據類別</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-xs font-bold" style={{ color: '#92400e' }}>單據類型</span>
            <select value={doc} onChange={event => changeDoc(event.target.value)} disabled={!storeId}
              className="h-12 w-full" style={{ ...SELECT_ADD_STYLE, height: undefined }}>
              <option value="">不指定</option>
              {docOptions.map(option => <option key={option} value={option}>{option}</option>)}
              <option value="__custom__">➕ 新增自訂…</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-xs font-bold" style={{ color: '#92400e' }}>報表金額分類</span>
            <select value={category} onChange={event => setCategory(event.target.value)}
              disabled={!storeId || mode !== 'vendor'}
              className="h-12 w-full" style={{ ...SELECT_ADD_STYLE, height: undefined, opacity: (!storeId || mode !== 'vendor') ? 0.65 : 1 }}>
              {mode !== 'vendor' && <option value="雜項">依各品項設定</option>}
              {mode === 'vendor' && <><option value="食材">食材</option><option value="耗材">耗材</option><option value="雜項">雜項</option></>}
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end" style={{ borderColor: '#fde68a' }}>
          <button type="button" onClick={cancelEditing} disabled={saving}
            className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-semibold sm:w-auto sm:min-w-[112px]"
            style={{ color: '#52525b', background: 'white', border: '1px solid #e4e4e7' }}>
            <X className="h-4 w-4" />取消
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !newName.trim()}
            className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-semibold text-white shadow-sm sm:w-auto sm:min-w-[128px]"
            style={{ background: '#f59e0b', opacity: (saving || !newName.trim()) ? 0.5 : 1 }}>
            <Check className="h-4 w-4" />{saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    )
  }

  const categoryStyle = currentCategory ? (CAT_STYLE[currentCategory] ?? CAT_STYLE['雜項']) : null
  return (
    <>
      <span className="rounded-md px-2 py-1 text-[11px] font-semibold"
        style={{ background: currentDoc ? docColor(currentDoc).bg : 'white', color: docColor(currentDoc ?? '').fg, border: `1px solid ${docColor(currentDoc ?? '').bd}` }}>
        單據：{currentDoc || '未指定'}
      </span>
      {categoryStyle && (
        <span className="rounded-md px-2 py-1 text-[11px] font-semibold"
          style={{ background: categoryStyle.bg, color: categoryStyle.color, border: `1px solid ${categoryStyle.color}33` }}>
          分類：{currentCategory}
        </span>
      )}
      <button type="button" onClick={startEditing}
        className="flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold"
        title="編輯分類所有設定" aria-label={`編輯「${vgName}」分類設定`}
        style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
        <Edit2 className="h-3.5 w-3.5" />編輯
      </button>
      <button type="button" onClick={handleDelete} disabled={saving}
        className="flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold"
        title="安全停用整個群組"
        style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c' }}>
        <Trash2 className="h-3.5 w-3.5" />刪除
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
