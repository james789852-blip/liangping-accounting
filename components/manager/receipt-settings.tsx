'use client'

import { useState, useTransition, useEffect } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, ChevronUp, Loader2, Pencil, Check, X, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { CategoryWithVendors } from '@/app/actions/receipt-settings'
import {
  deleteCategory, updateCategoryName,
  addVendor, updateVendor, deleteVendor,
  linkReceiptCategoryFromItems, reorderCategories, reorderVendors,
} from '@/app/actions/receipt-settings'
import {
  DndContext, closestCorners, rectIntersection, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'

interface Props {
  storeId: string
  initialCategories: CategoryWithVendors[]
  linkedCategoryNames?: string[]
  linkableItemGroups?: string[]
}

export default function ReceiptSettings({ storeId, initialCategories, linkedCategoryNames = [], linkableItemGroups = [] }: Props) {
  const [categories, setCategories] = useState<CategoryWithVendors[]>(initialCategories)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const router = useRouter()

  useEffect(() => { setCategories(initialCategories) }, [initialCategories])

  const [selectedLinkedGroup, setSelectedLinkedGroup] = useState('')
  const [linkPending, startLinkTransition] = useTransition()

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function handleLinkItemGroup() {
    if (!selectedLinkedGroup) { toast.error('請先選擇品項管理類別'); return }
    startLinkTransition(async () => {
      const result = await linkReceiptCategoryFromItems(storeId, selectedLinkedGroup)
      if ('error' in result) { toast.error(String(result.error)); return }
      toast.success(`已新增「${selectedLinkedGroup}」，後續由品項管理同步`)
      setSelectedLinkedGroup('')
      router.refresh()
    })
  }

  async function handleDeleteCategory(cat: CategoryWithVendors) {
    const linked = linkedCategoryNames.includes(cat.name)
    const message = linked
      ? `確定要將「${cat.name}」從收據管理移除？\n\n品項管理的類別與品項不會刪除，之後仍可從上方下拉選單重新加入。`
      : `確定刪除「${cat.name}」？底下所有廠商與細項也會一併刪除。`
    if (!confirm(message)) return
    const r = await deleteCategory(cat.id)
    if (r.error) { toast.error(r.error); return }
    toast.success(linked ? '已從收據管理移除，品項管理資料已保留' : '已刪除')
    router.refresh()
  }

  function moveCategory(idx: number, dir: 'up' | 'down') {
    const newIdx = dir === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= categories.length) return
    const arr = [...categories]
    ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
    setCategories(arr)  // optimistic
    reorderCategories(arr.map(c => c.id))
      .then(r => { if (r && 'error' in r) toast.error('排序失敗：' + (r as any).error) })
      .catch(e => toast.error('排序失敗：' + (e instanceof Error ? e.message : String(e))))
  }

  return (
    <div className="space-y-3">
      {categories.map((cat, idx) => (
        <CategoryCard
          key={cat.id}
          cat={cat}
          storeId={storeId}
          expanded={!!expanded[cat.id]}
          isFirst={idx === 0}
          isLast={idx === categories.length - 1}
          onMoveUp={() => moveCategory(idx, 'up')}
          onMoveDown={() => moveCategory(idx, 'down')}
          onToggle={() => toggleExpand(cat.id)}
          onDelete={() => handleDeleteCategory(cat)}
          onRefresh={() => router.refresh()}
          linked={linkedCategoryNames.includes(cat.name)}
        />
      ))}

      {categories.length === 0 && (
        <div className="text-center py-10" style={{ color: '#a1a1aa', fontSize: '14px' }}>
          尚未設定任何類別，請先至品項管理建立廠商或獨立類別
        </div>
      )}

      <div className="space-y-2">
          <div className="rounded-2xl p-3" style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0' }}>
            <p className="mb-2 text-xs font-bold" style={{ color: '#047857' }}>從品項管理新增同步類別</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select value={selectedLinkedGroup} onChange={event => setSelectedLinkedGroup(event.target.value)}
                className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm"
                style={{ background: 'white', border: '1px solid #a7f3d0', color: '#18181b' }}>
                <option value="">選擇尚未加入的品項類別…</option>
                {linkableItemGroups.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <button type="button" onClick={handleLinkItemGroup} disabled={!selectedLinkedGroup || linkPending}
                className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: '#059669', border: 'none' }}>
                {linkPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                新增並同步
              </button>
            </div>
            {linkableItemGroups.length === 0 && (
              <p className="mt-2 text-[11px]" style={{ color: '#047857' }}>
                目前沒有尚未同步的類別，可先到 <Link href={`/hq/item-mappings?storeId=${storeId}`} className="font-bold underline">品項管理新增</Link>。
              </p>
            )}
            {linkedCategoryNames.length > 0 && (
              <p className="mt-2 text-[11px]" style={{ color: '#047857' }}>
                已同步的類別會顯示在下方，不會重複出現在此選單。
              </p>
            )}
          </div>
      </div>
    </div>
  )
}

function CategoryCard({ cat, storeId, expanded, isFirst, isLast, onMoveUp, onMoveDown, onToggle, onDelete, onRefresh, linked }: {
  cat: CategoryWithVendors; storeId: string; expanded: boolean
  isFirst: boolean; isLast: boolean; onMoveUp: () => void; onMoveDown: () => void
  onToggle: () => void; onDelete: () => void; onRefresh: () => void; linked: boolean
}) {
  const vendorLinked = linked && cat.linkedMode === 'vendors'
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(cat.name)
  const [renamePending, startRename] = useTransition()
  const [addingVendor, setAddingVendor] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')
  const [vendorPending, startVendor] = useTransition()

  function handleRename() {
    if (!nameVal.trim() || nameVal.trim() === cat.name) { setEditingName(false); setNameVal(cat.name); return }
    startRename(async () => {
      const r = await updateCategoryName(cat.id, nameVal.trim())
      if (r.error) { toast.error(r.error); setNameVal(cat.name); return }
      toast.success('已更新類別名稱')
      setEditingName(false)
      onRefresh()
    })
  }

  function handleAddVendor() {
    if (!newVendorName.trim()) { toast.error('請輸入廠商名稱'); return }
    startVendor(async () => {
      const r = await addVendor(storeId, cat.id, newVendorName.trim())
      if (r.error) { toast.error(r.error); return }
      toast.success(`已新增「${newVendorName.trim()}」`)
      setNewVendorName('')
      setAddingVendor(false)
      onRefresh()
    })
  }

  async function handleDeleteVendor(vendorId: string, vendorName: string) {
    if (!confirm(`確定刪除廠商「${vendorName}」？`)) return
    const r = await deleteVendor(vendorId)
    if (r.error) { toast.error(r.error); return }
    toast.success(`已刪除「${vendorName}」`)
    // 不 refresh：local optimistic 已從 UI 移除，避免整頁 refetch 導致排序被 reset
  }

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      {/* 類別 header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* 上下箭頭排序（類別數少，箭頭精準） */}
        <div className="flex flex-col shrink-0" style={{ width: 18, background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, padding: 2 }}>
          <button onClick={onMoveUp} disabled={isFirst} title="上移"
            style={{ background: 'none', border: 'none', cursor: isFirst ? 'default' : 'pointer', color: isFirst ? '#e4e4e7' : '#92400e', padding: 0, lineHeight: 0.7 }}>
            <ChevronUp className="h-3 w-3" />
          </button>
          <button onClick={onMoveDown} disabled={isLast} title="下移"
            style={{ background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer', color: isLast ? '#e4e4e7' : '#92400e', padding: 0, lineHeight: 0.7 }}>
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 text-left" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: '#F59E0B' }} /> : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: '#a1a1aa' }} />}
          {editingName ? (
            <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setEditingName(false); setNameVal(cat.name) } }}
              onClick={e => e.stopPropagation()}
              style={{ flex: 1, fontSize: '15px', fontWeight: 600, padding: '4px 8px', border: '1.5px solid #F59E0B', borderRadius: '8px', fontFamily: 'inherit', outline: 'none', color: '#18181b' }} />
          ) : (
            <span className="font-semibold" style={{ fontSize: '15px', color: '#18181b' }}>{cat.name}</span>
          )}
        </button>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: linked ? '#ecfdf5' : '#f4f4f5', color: linked ? '#047857' : '#71717a' }}>
          {cat.vendors.length} {vendorLinked ? '個廠商分類' : linked ? '項品項' : '間廠商'}
        </span>
        {editingName ? (
          <>
            <button onClick={handleRename} disabled={renamePending}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F59E0B', padding: '4px' }}>
              {renamePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button onClick={() => { setEditingName(false); setNameVal(cat.name) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '4px' }}>
              <X className="h-4 w-4" />
            </button>
          </>
        ) : linked ? (
          <>
            <span className="text-[11px] font-bold" style={{ color: '#047857' }}>{vendorLinked ? '廠商分類同步' : '品項管理同步'}</span>
            <button onClick={onDelete}
              title="從收據管理移除（不會刪除品項管理資料）"
              aria-label={`從收據管理移除「${cat.name}」`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '4px' }}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => { setEditingName(true); if (!expanded) onToggle() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '4px' }}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '4px' }}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* 展開：廠商列表 */}
      {expanded && (
        <div style={{ borderTop: '1px solid #f4f4f5', padding: '12px 16px', background: '#fafafa' }}>
          {linked ? (
            <>
              <div className="mb-3 rounded-xl px-3 py-2 text-xs leading-5" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                {vendorLinked
                  ? '下列廠商分類來自品項管理；新增菜商、雜貨、免洗等廠商，請至品項管理操作，這裡會自動同步。'
                  : '此類別已與品項管理連動；新增、改名、排序或刪除請至品項管理操作，這裡會自動同步。'}
              </div>
              <div className="space-y-2 mb-3">
                {cat.vendors.map((vendor, index) => (
                  <div key={vendor.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2" style={{ border: '1px solid #e4e4e7' }}>
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>{index + 1}</span>
                    <span className="flex-1 text-sm" style={{ color: '#18181b' }}>{vendor.name}</span>
                    <span className="text-[10px] font-bold" style={{ color: '#047857' }}>{vendorLinked ? '廠商' : '已同步'}</span>
                  </div>
                ))}
              </div>
              <Link href={`/hq/item-mappings?storeId=${storeId}`} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>
                <Pencil className="h-3.5 w-3.5" />前往品項管理
              </Link>
            </>
          ) : <>
          {cat.vendors.length === 0 && !addingVendor && (
            <p style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '10px' }}>尚無廠商，點下方新增</p>
          )}
          <div className="space-y-2 mb-3">
            <VendorsDndList vendors={cat.vendors} onDeleteVendor={handleDeleteVendor} onRefresh={onRefresh} />
          </div>

          {addingVendor ? (
            <div className="flex gap-2">
              <input autoFocus placeholder="廠商名稱"
                style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #F59E0B', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}
                value={newVendorName} onChange={e => setNewVendorName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setAddingVendor(false); setNewVendorName('') } }} />
              <button onClick={handleAddVendor} disabled={vendorPending || !newVendorName.trim()}
                style={{ padding: '6px 12px', background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: vendorPending || !newVendorName.trim() ? 'not-allowed' : 'pointer', opacity: vendorPending || !newVendorName.trim() ? 0.5 : 1, fontFamily: 'inherit' }}>
                {vendorPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '新增'}
              </button>
              <button onClick={() => { setAddingVendor(false); setNewVendorName('') }}
                style={{ padding: '6px 10px', background: '#f4f4f5', border: 'none', borderRadius: '8px', color: '#52525b', cursor: 'pointer', fontFamily: 'inherit' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => setAddingVendor(true)}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ background: 'none', border: 'none', color: '#F59E0B', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}>
              <Plus className="h-3.5 w-3.5" />新增廠商
            </button>
          )}
          </>}
        </div>
      )}
    </div>
  )
}

function VendorsDndList({ vendors, onDeleteVendor, onRefresh }: {
  vendors: { id: string; name: string }[]
  onDeleteVendor: (id: string, name: string) => void
  onRefresh: () => void
}) {
  // 用 local state optimistic：完全不 sync from prop，避免 parent re-render 覆蓋順序
  // 新增廠商時由父層直接 push 進 local（下方 addLocal 函數）
  const [localVendors, setLocalVendors] = useState(vendors)
  // sync 邏輯：保留 local 順序、但同步 prop 內 name 變化（例如改名後）；新 id 附加、消失 id 移除
  useEffect(() => {
    setLocalVendors(prev => {
      const prevIds = new Set(prev.map(v => v.id))
      const propIds = new Set(vendors.map(v => v.id))
      const propById = new Map(vendors.map(v => [v.id, v]))
      const kept = prev.filter(v => propIds.has(v.id)).map(v => propById.get(v.id) ?? v)  // 用最新 name
      const added = vendors.filter(v => !prevIds.has(v.id))
      const changed = kept.some((v, i) => v !== prev[i]) || added.length > 0 || kept.length !== prev.length
      return changed ? [...kept, ...added] : prev
    })
  }, [vendors])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  )
  function handleDrag(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = localVendors.findIndex(v => v.id === active.id)
    const newIdx = localVendors.findIndex(v => v.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(localVendors, oldIdx, newIdx)
    setLocalVendors(reordered)  // optimistic
    reorderVendors(reordered.map(v => v.id))
      .then(r => { if (r && 'error' in r) toast.error('排序失敗：' + (r as any).error) })
      .catch(e => toast.error('排序失敗：' + (e instanceof Error ? e.message : String(e))))
  }
  // Wrapper：先 optimistic 從 local 移除，再呼叫 parent delete；成功後不 refetch（避免順序 reset）
  function localDelete(id: string, name: string) {
    setLocalVendors(prev => prev.filter(v => v.id !== id))
    onDeleteVendor(id, name)
  }
  return (
    <DndContext sensors={sensors}
      collisionDetection={(args) => {
        const inter = rectIntersection(args)
        return inter.length > 0 ? inter : closestCorners(args)
      }}
      onDragEnd={handleDrag}>
      <SortableContext items={localVendors.map(v => v.id)} strategy={verticalListSortingStrategy}>
        {localVendors.map(v => (
          <SortableVendorRow key={v.id} vendor={v} onDelete={() => localDelete(v.id, v.name)} onRename={onRefresh} />
        ))}
      </SortableContext>
    </DndContext>
  )
}

function SortableVendorRow(props: {
  vendor: { id: string; name: string }
  onDelete: () => void
  onRename: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.vendor.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <VendorRow {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

function VendorRow({ vendor, onDelete, onRename, dragHandleProps }: {
  vendor: { id: string; name: string }
  onDelete: () => void
  onRename: () => void
  dragHandleProps?: any
}) {
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(vendor.name)
  const [pending, startTransition] = useTransition()

  function handleSave() {
    if (!nameVal.trim() || nameVal.trim() === vendor.name) { setEditing(false); setNameVal(vendor.name); return }
    startTransition(async () => {
      const r = await updateVendor(vendor.id, nameVal.trim())
      if (r.error) { toast.error(r.error); setNameVal(vendor.name); return }
      toast.success('已更新廠商名稱')
      setEditing(false)
      onRename()
    })
  }

  if (editing) {
    return (
      <div className="rounded-xl" style={{ background: 'white', border: '1.5px solid #F59E0B' }}>
        <div className="flex items-center px-3 py-2 gap-2">
          <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setNameVal(vendor.name) } }}
            style={{ flex: 1, fontSize: '14px', fontFamily: 'inherit', border: 'none', outline: 'none', color: '#18181b', background: 'transparent' }} />
          <button onClick={handleSave} disabled={pending}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F59E0B', padding: '2px', flexShrink: 0 }}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => { setEditing(false); setNameVal(vendor.name) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '2px', flexShrink: 0 }}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl" style={{ background: 'white', border: '1px solid #e4e4e7' }}>
      <div className="flex items-center px-3 py-2 gap-2">
        {dragHandleProps && (
          <button {...dragHandleProps} title="拖曳排序"
            style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, padding: 3, cursor: 'grab', color: '#92400e', touchAction: 'none' }}>
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <span style={{ flex: 1, fontSize: '14px', color: '#18181b' }}>{vendor.name}</span>
        <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '2px', flexShrink: 0 }}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '2px', flexShrink: 0 }}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
