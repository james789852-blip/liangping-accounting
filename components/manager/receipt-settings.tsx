'use client'

import { useState, useTransition, useEffect } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Loader2, Pencil, Check, X, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { CategoryWithVendors } from '@/app/actions/receipt-settings'
import {
  addCategoryWithVendors, deleteCategory, updateCategoryName,
  addVendor, updateVendor, deleteVendor,
  reorderCategories, reorderVendors,
} from '@/app/actions/receipt-settings'
import {
  DndContext, closestCorners, rectIntersection, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Props {
  storeId: string
  initialCategories: CategoryWithVendors[]
}

export default function ReceiptSettings({ storeId, initialCategories }: Props) {
  const [categories, setCategories] = useState<CategoryWithVendors[]>(initialCategories)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const router = useRouter()

  useEffect(() => { setCategories(initialCategories) }, [initialCategories])

  const [newCatName, setNewCatName] = useState('')
  const [newVendors, setNewVendors] = useState<string[]>([''])
  const [addingCat, setAddingCat] = useState(false)
  const [catPending, startCatTransition] = useTransition()

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function handleAddCategory() {
    if (!newCatName.trim()) { toast.error('請輸入類別名稱'); return }
    startCatTransition(async () => {
      const r = await addCategoryWithVendors(storeId, newCatName.trim(), newVendors)
      if (r.error) { toast.error(r.error); return }
      toast.success(`已新增「${newCatName.trim()}」`)
      setNewCatName('')
      setNewVendors([''])
      setAddingCat(false)
      router.refresh()
    })
  }

  function updateVendorField(i: number, val: string) {
    setNewVendors(prev => prev.map((v, idx) => idx === i ? val : v))
  }
  function addVendorField() { setNewVendors(prev => [...prev, '']) }
  function removeVendorField(i: number) {
    setNewVendors(prev => prev.length === 1 ? [''] : prev.filter((_, idx) => idx !== i))
  }

  async function handleDeleteCategory(cat: CategoryWithVendors) {
    if (!confirm(`確定刪除「${cat.name}」？底下所有廠商與細項也會一併刪除。`)) return
    const r = await deleteCategory(cat.id)
    if (r.error) { toast.error(r.error); return }
    toast.success('已刪除')
    router.refresh()
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleCategoryDrag(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = categories.findIndex(c => c.id === active.id)
    const newIdx = categories.findIndex(c => c.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(categories, oldIdx, newIdx)
    setCategories(reordered)
    reorderCategories(reordered.map(c => c.id))
      .then(r => { if (r && 'error' in r) toast.error('排序失敗：' + (r as any).error) })
      .catch(e => toast.error('排序失敗：' + (e instanceof Error ? e.message : String(e))))
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors}
        collisionDetection={(args) => {
          const intersections = rectIntersection(args)
          return intersections.length > 0 ? intersections : closestCorners(args)
        }}
        onDragEnd={handleCategoryDrag}>
      <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
      {categories.map(cat => (
        <SortableCategoryCard
          key={cat.id}
          cat={cat}
          storeId={storeId}
          expanded={!!expanded[cat.id]}
          onToggle={() => toggleExpand(cat.id)}
          onDelete={() => handleDeleteCategory(cat)}
          onRefresh={() => router.refresh()}
        />
      ))}
      </SortableContext>
      </DndContext>

      {categories.length === 0 && !addingCat && (
        <div className="text-center py-10" style={{ color: '#a1a1aa', fontSize: '14px' }}>
          尚未設定任何類別，請新增第一個類別
        </div>
      )}

      {addingCat ? (
        <div className="bg-white rounded-2xl p-4 space-y-4" style={{ border: '2px solid #FDE68A' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: '#18181b' }}>新增類別</p>
            <button onClick={() => { setAddingCat(false); setNewCatName(''); setNewVendors(['']) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '2px' }}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1.5">
            <p style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>類別名稱 *</p>
            <input autoFocus placeholder="例：菜商"
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #FDE68A', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b', boxSizing: 'border-box' }}
              value={newCatName} onChange={e => setNewCatName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <p style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600 }}>廠商名稱（可空）</p>
            <div className="space-y-2">
              {newVendors.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <input placeholder={`廠商 ${i + 1}`}
                    style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}
                    value={v} onChange={e => updateVendorField(i, e.target.value)} />
                  <button type="button" onClick={() => removeVendorField(i)}
                    style={{ padding: '6px 8px', background: '#fef2f2', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#fca5a5' }}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addVendorField}
              className="flex items-center gap-1.5 text-sm"
              style={{ background: 'none', border: 'none', color: '#F59E0B', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit' }}>
              <Plus className="h-3.5 w-3.5" />新增廠商欄位
            </button>
          </div>
          <button onClick={handleAddCategory} disabled={catPending || !newCatName.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', opacity: catPending || !newCatName.trim() ? 0.5 : 1, border: 'none', fontFamily: 'inherit', cursor: catPending || !newCatName.trim() ? 'not-allowed' : 'pointer' }}>
            {catPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            建立類別
          </button>
        </div>
      ) : (
        <button onClick={() => setAddingCat(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all hover:opacity-80"
          style={{ background: 'white', border: '2px dashed #FDE68A', color: '#92400E' }}>
          <Plus className="h-4 w-4" />新增類別
        </button>
      )}
    </div>
  )
}

function SortableCategoryCard(props: {
  cat: CategoryWithVendors; storeId: string; expanded: boolean
  onToggle: () => void; onDelete: () => void; onRefresh: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.cat.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <CategoryCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

function CategoryCard({ cat, storeId, expanded, onToggle, onDelete, onRefresh, dragHandleProps }: {
  cat: CategoryWithVendors; storeId: string; expanded: boolean
  onToggle: () => void; onDelete: () => void; onRefresh: () => void
  dragHandleProps?: any
}) {
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
    const r = await deleteVendor(vendorId)
    if (r.error) { toast.error(r.error); return }
    toast.success(`已刪除「${vendorName}」`)
    onRefresh()
  }

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      {/* 類別 header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* 拖曳 handle */}
        {dragHandleProps && (
          <button {...dragHandleProps} title="拖曳排序"
            style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, padding: 4, cursor: 'grab', color: '#92400e', touchAction: 'none' }}>
            <GripVertical className="h-4 w-4" />
          </button>
        )}
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
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f4f4f5', color: '#71717a' }}>{cat.vendors.length} 間廠商</span>
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  )
  function handleDrag(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = vendors.findIndex(v => v.id === active.id)
    const newIdx = vendors.findIndex(v => v.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(vendors, oldIdx, newIdx)
    reorderVendors(reordered.map(v => v.id))
      .then(r => { if (r && 'error' in r) toast.error('排序失敗：' + (r as any).error); onRefresh() })
      .catch(e => toast.error('排序失敗：' + (e instanceof Error ? e.message : String(e))))
  }
  return (
    <DndContext sensors={sensors}
      collisionDetection={(args) => {
        const inter = rectIntersection(args)
        return inter.length > 0 ? inter : closestCorners(args)
      }}
      onDragEnd={handleDrag}>
      <SortableContext items={vendors.map(v => v.id)} strategy={verticalListSortingStrategy}>
        {vendors.map(v => (
          <SortableVendorRow key={v.id} vendor={v} onDelete={() => onDeleteVendor(v.id, v.name)} onRename={onRefresh} />
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
