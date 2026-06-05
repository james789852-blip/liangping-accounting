'use client'

import { useState, useTransition, useEffect } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Loader2, Pencil, Check, X, ListPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { CategoryWithVendors, VendorItemTemplate } from '@/app/actions/receipt-settings'
import {
  addCategoryWithVendors, deleteCategory, updateCategoryName,
  addVendor, deleteVendor, addVendorItemTemplate, updateVendorItemTemplate, deleteVendorItemTemplate,
} from '@/app/actions/receipt-settings'

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

  return (
    <div className="space-y-3">
      {categories.map(cat => (
        <CategoryCard
          key={cat.id}
          cat={cat}
          storeId={storeId}
          expanded={!!expanded[cat.id]}
          onToggle={() => toggleExpand(cat.id)}
          onDelete={() => handleDeleteCategory(cat)}
          onRefresh={() => router.refresh()}
        />
      ))}

      {categories.length === 0 && !addingCat && (
        <div className="text-center py-10" style={{ color: '#a1a1aa', fontSize: '14px' }}>
          尚未設定任何類別，請新增第一個類別
        </div>
      )}

      {addingCat ? (
        <div className="bg-white rounded-2xl p-4 space-y-4" style={{ border: '2px solid #c7d2fe' }}>
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
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #c7d2fe', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b', boxSizing: 'border-box' }}
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
              style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit' }}>
              <Plus className="h-3.5 w-3.5" />新增廠商欄位
            </button>
          </div>
          <button onClick={handleAddCategory} disabled={catPending || !newCatName.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', opacity: catPending || !newCatName.trim() ? 0.5 : 1, border: 'none', fontFamily: 'inherit', cursor: catPending || !newCatName.trim() ? 'not-allowed' : 'pointer' }}>
            {catPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            建立類別
          </button>
        </div>
      ) : (
        <button onClick={() => setAddingCat(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all hover:opacity-80"
          style={{ background: 'white', border: '2px dashed #c7d2fe', color: '#4338ca' }}>
          <Plus className="h-4 w-4" />新增類別
        </button>
      )}
    </div>
  )
}

function CategoryCard({ cat, storeId, expanded, onToggle, onDelete, onRefresh }: {
  cat: CategoryWithVendors; storeId: string; expanded: boolean
  onToggle: () => void; onDelete: () => void; onRefresh: () => void
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

  const totalTemplates = cat.vendors.reduce((s, v) => s + v.item_templates.length, 0)

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      {/* 類別 header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 text-left" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: '#6366f1' }} /> : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: '#a1a1aa' }} />}
          {editingName ? (
            <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setEditingName(false); setNameVal(cat.name) } }}
              onClick={e => e.stopPropagation()}
              style={{ flex: 1, fontSize: '15px', fontWeight: 600, padding: '4px 8px', border: '1.5px solid #6366f1', borderRadius: '8px', fontFamily: 'inherit', outline: 'none', color: '#18181b' }} />
          ) : (
            <span className="font-semibold" style={{ fontSize: '15px', color: '#18181b' }}>{cat.name}</span>
          )}
        </button>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f4f4f5', color: '#71717a' }}>{cat.vendors.length} 間廠商</span>
        {totalTemplates > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#eef2ff', color: '#4338ca' }}>{totalTemplates} 細項</span>
        )}
        {editingName ? (
          <>
            <button onClick={handleRename} disabled={renamePending}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: '4px' }}>
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
            {cat.vendors.map(v => (
              <VendorRow
                key={v.id}
                vendor={v}
                onDelete={() => handleDeleteVendor(v.id, v.name)}
                onRefresh={onRefresh}
              />
            ))}
          </div>

          {addingVendor ? (
            <div className="flex gap-2">
              <input autoFocus placeholder="廠商名稱"
                style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #6366f1', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b' }}
                value={newVendorName} onChange={e => setNewVendorName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddVendor(); if (e.key === 'Escape') { setAddingVendor(false); setNewVendorName('') } }} />
              <button onClick={handleAddVendor} disabled={vendorPending || !newVendorName.trim()}
                style={{ padding: '6px 12px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: vendorPending || !newVendorName.trim() ? 'not-allowed' : 'pointer', opacity: vendorPending || !newVendorName.trim() ? 0.5 : 1, fontFamily: 'inherit' }}>
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
              style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}>
              <Plus className="h-3.5 w-3.5" />新增廠商
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function VendorRow({ vendor, onDelete, onRefresh }: {
  vendor: { id: string; name: string; item_templates: VendorItemTemplate[] }
  onDelete: () => void
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [addingTemplate, setAddingTemplate] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [newUnitPrice, setNewUnitPrice] = useState('')
  const [templatePending, startTemplate] = useTransition()

  function handleAddTemplate() {
    if (!newItemName.trim()) { toast.error('請輸入品項名稱'); return }
    startTemplate(async () => {
      const r = await addVendorItemTemplate(vendor.id, newItemName.trim(), newUnit.trim(), parseFloat(newUnitPrice) || 0)
      if (r.error) { toast.error(r.error); return }
      toast.success(`已新增「${newItemName.trim()}」`)
      setNewItemName('')
      setNewUnit('')
      setNewUnitPrice('')
      setAddingTemplate(false)
      onRefresh()
    })
  }

  async function handleDeleteTemplate(templateId: string, name: string) {
    const r = await deleteVendorItemTemplate(templateId)
    if (r.error) { toast.error(r.error); return }
    toast.success(`已刪除「${name}」`)
    onRefresh()
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: '1px solid #e4e4e7' }}>
      {/* 廠商 header */}
      <div className="flex items-center px-3 py-2 gap-2">
        <button onClick={() => setExpanded(!expanded)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: expanded ? '#6366f1' : '#a1a1aa', flexShrink: 0 }}>
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <span style={{ flex: 1, fontSize: '14px', color: '#18181b' }}>{vendor.name}</span>
        {vendor.item_templates.length > 0 && (
          <span style={{ fontSize: '11px', color: '#6366f1', background: '#eef2ff', padding: '2px 8px', borderRadius: '10px' }}>
            {vendor.item_templates.length} 細項
          </span>
        )}
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '2px', flexShrink: 0 }}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 細項列表 */}
      {expanded && (
        <div style={{ borderTop: '1px solid #f4f4f5', padding: '10px 12px', background: '#fafafa' }}>
          {vendor.item_templates.length === 0 && !addingTemplate && (
            <p style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '8px' }}>尚無細項，點下方新增</p>
          )}
          <div className="space-y-1.5 mb-2">
            {vendor.item_templates.map(t => (
              <TemplateRow
                key={t.id}
                template={t}
                onDelete={() => handleDeleteTemplate(t.id, t.item_name)}
                onRefresh={onRefresh}
              />
            ))}
          </div>

          {addingTemplate ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input autoFocus placeholder="品項名稱（例：空心菜）"
                style={{ flex: '2 1 120px', padding: '7px 10px', border: '1.5px solid #6366f1', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b', minWidth: 0 }}
                value={newItemName} onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setAddingTemplate(false) }} />
              <input placeholder="單位（斤）"
                style={{ flex: '0 0 60px', padding: '7px 8px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b', textAlign: 'center' }}
                value={newUnit} onChange={e => setNewUnit(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setAddingTemplate(false) }} />
              <input type="number" placeholder="單價"
                style={{ flex: '0 0 72px', padding: '7px 8px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: 'white', outline: 'none', color: '#18181b', textAlign: 'right' }}
                value={newUnitPrice} onChange={e => setNewUnitPrice(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setAddingTemplate(false) }} />
              <button onClick={handleAddTemplate} disabled={templatePending || !newItemName.trim()}
                style={{ padding: '6px 10px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: templatePending || !newItemName.trim() ? 'not-allowed' : 'pointer', opacity: templatePending || !newItemName.trim() ? 0.5 : 1, fontFamily: 'inherit', flexShrink: 0 }}>
                {templatePending ? <Loader2 className="h-3 w-3 animate-spin" /> : '新增'}
              </button>
              <button onClick={() => { setAddingTemplate(false); setNewItemName(''); setNewUnit(''); setNewUnitPrice('') }}
                style={{ padding: '6px 8px', background: '#f4f4f5', border: 'none', borderRadius: '8px', color: '#52525b', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => setAddingTemplate(true)}
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit' }}>
              <ListPlus className="h-3.5 w-3.5" />新增細項
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function TemplateRow({ template, onDelete, onRefresh }: {
  template: VendorItemTemplate
  onDelete: () => void
  onRefresh: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(template.item_name)
  const [unitVal, setUnitVal] = useState(template.unit)
  const [unitPriceVal, setUnitPriceVal] = useState(String(template.unit_price ?? 0))
  const [pending, startPending] = useTransition()

  function handleSave() {
    if (!nameVal.trim()) { toast.error('請輸入品項名稱'); return }
    startPending(async () => {
      const r = await updateVendorItemTemplate(template.id, nameVal.trim(), unitVal.trim(), parseFloat(unitPriceVal) || 0)
      if (r.error) { toast.error(r.error); return }
      toast.success('已更新')
      setEditing(false)
      onRefresh()
    })
  }

  function handleCancel() {
    setNameVal(template.item_name)
    setUnitVal(template.unit)
    setUnitPriceVal(String(template.unit_price ?? 0))
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: '5px', alignItems: 'center', background: 'white', border: '1.5px solid #6366f1', borderRadius: '8px', padding: '6px 8px' }}>
        <input autoFocus
          style={{ flex: 2, padding: '4px 6px', border: '1px solid #e4e4e7', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', color: '#18181b', minWidth: 0 }}
          value={nameVal} onChange={e => setNameVal(e.target.value)} />
        <input placeholder="單位"
          style={{ width: '48px', padding: '4px 6px', border: '1px solid #e4e4e7', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', textAlign: 'center', color: '#18181b' }}
          value={unitVal} onChange={e => setUnitVal(e.target.value)} />
        <input type="number" placeholder="單價"
          style={{ width: '64px', padding: '4px 6px', border: '1px solid #e4e4e7', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', textAlign: 'right', color: '#18181b' }}
          value={unitPriceVal} onChange={e => setUnitPriceVal(e.target.value)} />
        <button onClick={handleSave} disabled={pending || !nameVal.trim()}
          style={{ padding: '4px 8px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: pending || !nameVal.trim() ? 'not-allowed' : 'pointer', opacity: pending || !nameVal.trim() ? 0.5 : 1, fontFamily: 'inherit', flexShrink: 0 }}>
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </button>
        <button onClick={handleCancel}
          style={{ padding: '4px 6px', background: '#f4f4f5', border: 'none', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}>
          <X className="h-3 w-3" style={{ color: '#71717a' }} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
      style={{ background: 'white', border: '1px solid #f4f4f5' }}>
      <span style={{ flex: 1, fontSize: '13px', color: '#18181b' }}>{template.item_name}</span>
      {template.unit && (
        <span style={{ fontSize: '12px', color: '#71717a', background: '#f4f4f5', padding: '1px 8px', borderRadius: '8px' }}>{template.unit}</span>
      )}
      {(template.unit_price ?? 0) > 0 && (
        <span style={{ fontSize: '12px', color: '#059669', background: '#ecfdf5', padding: '1px 8px', borderRadius: '8px' }}>${template.unit_price}</span>
      )}
      <button onClick={() => setEditing(true)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '2px', flexShrink: 0 }}>
        <Pencil className="h-3 w-3" />
      </button>
      <button onClick={onDelete}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '2px', flexShrink: 0 }}>
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
}
