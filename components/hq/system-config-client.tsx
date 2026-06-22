'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  createVendorGroup, updateVendorGroup, deleteVendorGroup, reorderVendorGroups,
  createSystemItem, updateSystemItem, deleteSystemItem, reorderSystemItems,
} from '@/app/actions/system-config'
import {
  Plus, Trash2, Pencil, Check, X, ChevronUp, ChevronDown, GripVertical,
  Tag, Box, ChefHat, FileText, Percent, HelpCircle,
} from 'lucide-react'

// ────────── 型別 ──────────
interface VG {
  id: string; name: string; kind: 'vendor' | 'doc_type' | 'tax' | 'ck' | 'uncategorized'
  sort_order: number; active: boolean; description?: string
}
interface SI {
  id: string; name: string; category: '食材' | '耗材' | '雜項'
  vendor_group_id: string | null; default_enabled: boolean; sort_order: number; active: boolean
}

// ────────── 樣式常數 ──────────
const KIND_INFO: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  ck:            { label: '央廚配送',  icon: ChefHat,    color: '#92400E', bg: '#FEF3C7' },
  vendor:        { label: '叫貨廠商',  icon: Tag,        color: '#0369A1', bg: '#E0F2FE' },
  doc_type:      { label: '文件類型',  icon: FileText,   color: '#7C3AED', bg: '#F3E8FF' },
  tax:           { label: '退稅 / 稅金', icon: Percent,  color: '#BE123C', bg: '#FFE4E6' },
  uncategorized: { label: '未分類',    icon: HelpCircle, color: '#71717A', bg: '#F4F4F5' },
}
const CATEGORY_STYLE: Record<string, { bg: string; color: string }> = {
  '食材': { bg: '#d1fae5', color: '#047857' },
  '耗材': { bg: '#FFFBEB', color: '#92400E' },
  '雜項': { bg: '#f4f4f5', color: '#71717a' },
}

// ────────── Main ──────────
export default function SystemConfigClient({
  initialVendorGroups, initialItems, usageCount,
}: {
  initialVendorGroups: VG[]; initialItems: SI[]; usageCount: Record<string, number>
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'items' | 'groups'>('items')
  const [vgs, setVgs] = useState(initialVendorGroups)
  const [items, setItems] = useState(initialItems)
  const [isPending, startTransition] = useTransition()

  const vgMap = useMemo(() => Object.fromEntries(vgs.map(v => [v.id, v])), [vgs])

  // 由 system_items 依 vendor_group 分組
  const itemsByGroup = useMemo(() => {
    const map: Record<string, SI[]> = {}
    for (const v of vgs) map[v.id] = []
    map['__no_group__'] = []
    for (const i of items) {
      const key = i.vendor_group_id ?? '__no_group__'
      if (!map[key]) map[key] = []
      map[key].push(i)
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.sort_order - b.sort_order)
    return map
  }, [items, vgs])

  // ────── handlers (Items) ──────
  function moveItemUp(itemId: string, groupKey: string) {
    const arr = itemsByGroup[groupKey] ?? []
    const idx = arr.findIndex(i => i.id === itemId)
    if (idx <= 0) return
    const newOrder = [...arr]
    ;[newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]]
    startTransition(async () => {
      const r = await reorderSystemItems(newOrder.map(x => x.id))
      if ('error' in r && r.error) toast.error(r.error)
      else { router.refresh(); toast.success('已調整順序') }
    })
  }
  function moveItemDown(itemId: string, groupKey: string) {
    const arr = itemsByGroup[groupKey] ?? []
    const idx = arr.findIndex(i => i.id === itemId)
    if (idx < 0 || idx >= arr.length - 1) return
    const newOrder = [...arr]
    ;[newOrder[idx + 1], newOrder[idx]] = [newOrder[idx], newOrder[idx + 1]]
    startTransition(async () => {
      const r = await reorderSystemItems(newOrder.map(x => x.id))
      if ('error' in r && r.error) toast.error(r.error)
      else { router.refresh(); toast.success('已調整順序') }
    })
  }

  function handleDeleteItem(id: string, name: string) {
    if (!confirm(`確定刪除品項「${name}」？\n若已有店家在使用會改為停用。`)) return
    startTransition(async () => {
      const r = await deleteSystemItem(id)
      if ('error' in r && r.error) toast.error(r.error)
      else {
        toast.success((r as any).message ?? '已刪除')
        router.refresh()
      }
    })
  }

  function handleToggleDefault(item: SI) {
    startTransition(async () => {
      const r = await updateSystemItem(item.id, { default_enabled: !item.default_enabled })
      if ('error' in r && r.error) toast.error(r.error)
      else { setItems(prev => prev.map(i => i.id === item.id ? { ...i, default_enabled: !i.default_enabled } : i)) }
    })
  }

  function handleDeleteVG(id: string, name: string) {
    if (!confirm(`確定刪除分類「${name}」？`)) return
    startTransition(async () => {
      const r = await deleteVendorGroup(id)
      if ('error' in r && r.error) toast.error(r.error)
      else { toast.success('已刪除'); router.refresh() }
    })
  }

  // ────────── Render ──────────
  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-2 bg-white rounded-2xl p-1.5" style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <TabButton active={tab === 'items'} onClick={() => setTab('items')} icon={Box} label={`品項主表（${items.length}）`} />
        <TabButton active={tab === 'groups'} onClick={() => setTab('groups')} icon={Tag} label={`廠商分類（${vgs.length}）`} />
      </div>

      {/* ─────── Tab 1: 品項主表 ─────── */}
      {tab === 'items' && (
        <div className="space-y-4">
          <AddItemCard vendorGroups={vgs} onCreated={() => router.refresh()} />

          {vgs.filter(v => v.active).sort((a, b) => a.sort_order - b.sort_order).map(vg => {
            const groupItems = itemsByGroup[vg.id] ?? []
            const info = KIND_INFO[vg.kind] ?? KIND_INFO['uncategorized']
            const Icon = info.icon
            return (
              <div key={vg.id} className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid #f4f4f5' }}>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={{ background: info.bg, color: info.color }}>
                      <Icon className="h-3.5 w-3.5" />{info.label}
                    </span>
                    <h3 className="text-sm font-bold" style={{ color: '#18181b' }}>{vg.name}</h3>
                    <span className="text-xs" style={{ color: '#a1a1aa' }}>{groupItems.length} 項</span>
                  </div>
                </div>
                {groupItems.length === 0 ? (
                  <div className="px-5 py-6 text-center text-xs" style={{ color: '#a1a1aa' }}>尚無品項</div>
                ) : (
                  <div>
                    {groupItems.map((item, idx) => (
                      <ItemRow key={item.id}
                        item={item}
                        usage={usageCount[item.id] ?? 0}
                        isFirst={idx === 0}
                        isLast={idx === groupItems.length - 1}
                        vendorGroups={vgs}
                        disabled={isPending}
                        onMoveUp={() => moveItemUp(item.id, vg.id)}
                        onMoveDown={() => moveItemDown(item.id, vg.id)}
                        onToggleDefault={() => handleToggleDefault(item)}
                        onDelete={() => handleDeleteItem(item.id, item.name)}
                        onUpdated={() => router.refresh()}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* 沒有分類的品項 */}
          {(itemsByGroup['__no_group__']?.length ?? 0) > 0 && (
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #fcd34d', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div className="px-5 py-3.5" style={{ borderBottom: '1px solid #f4f4f5' }}>
                <h3 className="text-sm font-bold" style={{ color: '#92400e' }}>⚠ 未指定分類</h3>
              </div>
              {itemsByGroup['__no_group__'].map(item => (
                <ItemRow key={item.id} item={item} usage={usageCount[item.id] ?? 0}
                  isFirst isLast vendorGroups={vgs} disabled={isPending}
                  onMoveUp={() => {}} onMoveDown={() => {}}
                  onToggleDefault={() => handleToggleDefault(item)}
                  onDelete={() => handleDeleteItem(item.id, item.name)}
                  onUpdated={() => router.refresh()} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────── Tab 2: 廠商分類 ─────── */}
      {tab === 'groups' && (
        <div className="space-y-4">
          <AddVGCard onCreated={() => router.refresh()} />

          {(['ck', 'vendor', 'doc_type', 'tax', 'uncategorized'] as const).map(kind => {
            const vgsOfKind = vgs.filter(v => v.kind === kind).sort((a, b) => a.sort_order - b.sort_order)
            if (vgsOfKind.length === 0) return null
            const info = KIND_INFO[kind]
            const Icon = info.icon
            return (
              <div key={kind} className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div className="px-5 py-3.5 flex items-center gap-2" style={{ borderBottom: '1px solid #f4f4f5' }}>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ background: info.bg, color: info.color }}>
                    <Icon className="h-3.5 w-3.5" />{info.label}
                  </span>
                  <span className="text-xs" style={{ color: '#a1a1aa' }}>{vgsOfKind.length} 個分類</span>
                </div>
                {vgsOfKind.map((vg, idx) => (
                  <VGRow key={vg.id} vg={vg}
                    itemCount={(itemsByGroup[vg.id] ?? []).length}
                    isFirst={idx === 0}
                    isLast={idx === vgsOfKind.length - 1}
                    disabled={isPending}
                    onMoveUp={() => {
                      const next = [...vgsOfKind]
                      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                      startTransition(async () => {
                        await reorderVendorGroups(next.map(x => x.id))
                        router.refresh()
                      })
                    }}
                    onMoveDown={() => {
                      const next = [...vgsOfKind]
                      ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
                      startTransition(async () => {
                        await reorderVendorGroups(next.map(x => x.id))
                        router.refresh()
                      })
                    }}
                    onDelete={() => handleDeleteVG(vg.id, vg.name)}
                    onUpdated={() => router.refresh()} />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ────────── 子組件 ──────────
function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick}
      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
      style={{
        background: active ? 'linear-gradient(135deg,#F59E0B,#F97316)' : 'transparent',
        color: active ? 'white' : '#52525b',
        boxShadow: active ? '0 4px 12px rgba(245,158,11,0.3)' : 'none',
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      }}>
      <Icon className="h-4 w-4" />{label}
    </button>
  )
}

function AddItemCard({ vendorGroups, onCreated }: { vendorGroups: VG[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<'食材' | '耗材' | '雜項'>('食材')
  const [vgId, setVgId] = useState<string>('')
  const [defaultEnabled, setDefaultEnabled] = useState(true)
  const [isPending, startTransition] = useTransition()

  function reset() { setName(''); setCategory('食材'); setVgId(''); setDefaultEnabled(true); setOpen(false) }

  function submit() {
    if (!name.trim()) { toast.error('請填寫品項名稱'); return }
    if (!vgId) { toast.error('請選擇廠商分類'); return }
    startTransition(async () => {
      const r = await createSystemItem({ name, category, vendor_group_id: vgId, default_enabled: defaultEnabled })
      if ('error' in r && r.error) toast.error(r.error)
      else { toast.success(`已新增「${name}」`); reset(); onCreated() }
    })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold"
        style={{ background: 'white', border: '2px dashed #FEF3C7', color: '#92400E', cursor: 'pointer', fontFamily: 'inherit' }}>
        <Plus className="h-4 w-4" />新增全公司品項
      </button>
    )
  }
  return (
    <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1.5px solid #FEF3C7', boxShadow: '0 2px 8px rgba(245,158,11,0.12)' }}>
      <p className="text-sm font-semibold" style={{ color: '#92400E' }}>新增全公司品項</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>品項名稱</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="例如：高麗菜"
            style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>類別</label>
          <select value={category} onChange={e => setCategory(e.target.value as any)} style={inputStyle}>
            <option>食材</option><option>耗材</option><option>雜項</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>歸屬廠商分類</label>
          <select value={vgId} onChange={e => setVgId(e.target.value)} style={inputStyle}>
            <option value="">— 請選擇 —</option>
            {vendorGroups.filter(v => v.active).sort((a, b) => a.sort_order - b.sort_order).map(v => (
              <option key={v.id} value={v.id}>{KIND_INFO[v.kind]?.label ?? ''} · {v.name}</option>
            ))}
          </select>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm" style={{ color: '#52525b' }}>
          <input type="checkbox" checked={defaultEnabled} onChange={e => setDefaultEnabled(e.target.checked)} />
          預設所有店家啟用（取消勾選則需店家自行啟用）
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: isPending ? 0.6 : 1 }}>
          {isPending ? '儲存中…' : '儲存'}
        </button>
        <button onClick={reset}
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b', cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
      </div>
    </div>
  )
}

function ItemRow({
  item, usage, isFirst, isLast, vendorGroups, disabled,
  onMoveUp, onMoveDown, onToggleDefault, onDelete, onUpdated,
}: {
  item: SI; usage: number; isFirst: boolean; isLast: boolean
  vendorGroups: VG[]; disabled: boolean
  onMoveUp: () => void; onMoveDown: () => void; onToggleDefault: () => void; onDelete: () => void
  onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState(item.category)
  const [vgId, setVgId] = useState(item.vendor_group_id ?? '')
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const r = await updateSystemItem(item.id, { name, category, vendor_group_id: vgId || null })
      if ('error' in r && r.error) toast.error(r.error)
      else { setEditing(false); toast.success('已更新'); onUpdated() }
    })
  }
  const catSt = CATEGORY_STYLE[item.category] ?? CATEGORY_STYLE['雜項']

  if (editing) {
    return (
      <div className="px-4 py-3 space-y-2" style={{ borderBottom: '1px solid #f4f4f5', background: '#fffbeb' }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="品項名稱" />
          <select value={category} onChange={e => setCategory(e.target.value as any)} style={inputStyle}>
            <option>食材</option><option>耗材</option><option>雜項</option>
          </select>
          <select value={vgId} onChange={e => setVgId(e.target.value)} style={inputStyle}>
            {vendorGroups.filter(v => v.active).sort((a, b) => a.sort_order - b.sort_order).map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={isPending}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ background: '#10b981', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>儲存</button>
          <button onClick={() => { setEditing(false); setName(item.name); setCategory(item.category); setVgId(item.vendor_group_id ?? '') }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'white', border: '1px solid #e4e4e7', cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid #f4f4f5' }}>
      {/* 排序按鈕 */}
      <div className="flex flex-col" style={{ width: 24 }}>
        <button onClick={onMoveUp} disabled={isFirst || disabled}
          style={{ background: 'none', border: 'none', cursor: isFirst ? 'default' : 'pointer', color: isFirst ? '#e4e4e7' : '#a1a1aa', padding: 0, lineHeight: 0.8 }}>
          <ChevronUp className="h-3 w-3" />
        </button>
        <button onClick={onMoveDown} disabled={isLast || disabled}
          style={{ background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer', color: isLast ? '#e4e4e7' : '#a1a1aa', padding: 0, lineHeight: 0.8 }}>
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <span className="text-sm font-semibold flex-1" style={{ color: item.active ? '#18181b' : '#a1a1aa' }}>
        {item.name}{!item.active && <span className="text-xs ml-1" style={{ color: '#be123c' }}>(停用)</span>}
      </span>
      <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0" style={{ background: catSt.bg, color: catSt.color }}>
        {item.category}
      </span>
      {usage > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: '#E0F2FE', color: '#0369A1' }}>
          {usage} 店在用
        </span>
      )}
      {/* 預設啟用 toggle */}
      <button onClick={onToggleDefault} disabled={disabled}
        className="shrink-0 px-2 py-1 rounded-lg text-[11px] font-semibold"
        style={{
          background: item.default_enabled ? '#d1fae5' : '#f4f4f5',
          color: item.default_enabled ? '#047857' : '#a1a1aa',
          border: 'none', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>
        {item.default_enabled ? '✓ 預設啟用' : '預設停用'}
      </button>
      <button onClick={() => setEditing(true)} disabled={disabled}
        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 8, minWidth: 36, minHeight: 36 }}>
        <Pencil className="h-4 w-4" />
      </button>
      <button onClick={onDelete} disabled={disabled}
        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 8, minWidth: 36, minHeight: 36 }}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function AddVGCard({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<VG['kind']>('vendor')
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!name.trim()) { toast.error('請填寫名稱'); return }
    startTransition(async () => {
      const r = await createVendorGroup({ name, kind })
      if ('error' in r && r.error) toast.error(r.error)
      else { toast.success(`已新增「${name}」`); setName(''); setOpen(false); onCreated() }
    })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold"
        style={{ background: 'white', border: '2px dashed #FEF3C7', color: '#92400E', cursor: 'pointer', fontFamily: 'inherit' }}>
        <Plus className="h-4 w-4" />新增廠商分類
      </button>
    )
  }
  return (
    <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1.5px solid #FEF3C7', boxShadow: '0 2px 8px rgba(245,158,11,0.12)' }}>
      <p className="text-sm font-semibold" style={{ color: '#92400E' }}>新增廠商分類</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>分類名稱</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="例如：海鮮" style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>類型</label>
          <select value={kind} onChange={e => setKind(e.target.value as any)} style={inputStyle}>
            <option value="vendor">叫貨廠商</option>
            <option value="ck">央廚配送</option>
            <option value="doc_type">文件類型</option>
            <option value="tax">退稅/稅金</option>
            <option value="uncategorized">未分類</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: isPending ? 0.6 : 1 }}>
          {isPending ? '儲存中…' : '儲存'}
        </button>
        <button onClick={() => { setOpen(false); setName('') }}
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b', cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
      </div>
    </div>
  )
}

function VGRow({
  vg, itemCount, isFirst, isLast, disabled,
  onMoveUp, onMoveDown, onDelete, onUpdated,
}: {
  vg: VG; itemCount: number; isFirst: boolean; isLast: boolean; disabled: boolean
  onMoveUp: () => void; onMoveDown: () => void; onDelete: () => void; onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(vg.name)
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const r = await updateVendorGroup(vg.id, { name })
      if ('error' in r && r.error) toast.error(r.error)
      else { setEditing(false); toast.success('已更新'); onUpdated() }
    })
  }
  function toggleActive() {
    startTransition(async () => {
      const r = await updateVendorGroup(vg.id, { active: !vg.active })
      if ('error' in r && r.error) toast.error(r.error)
      else { toast.success(vg.active ? '已停用' : '已啟用'); onUpdated() }
    })
  }

  if (editing) {
    return (
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid #f4f4f5', background: '#fffbeb' }}>
        <input value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <button onClick={save} disabled={isPending}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
          style={{ background: '#10b981', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>儲存</button>
        <button onClick={() => { setEditing(false); setName(vg.name) }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: 'white', border: '1px solid #e4e4e7', cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
      </div>
    )
  }

  return (
    <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid #f4f4f5' }}>
      <div className="flex flex-col" style={{ width: 24 }}>
        <button onClick={onMoveUp} disabled={isFirst || disabled}
          style={{ background: 'none', border: 'none', cursor: isFirst ? 'default' : 'pointer', color: isFirst ? '#e4e4e7' : '#a1a1aa', padding: 0, lineHeight: 0.8 }}>
          <ChevronUp className="h-3 w-3" />
        </button>
        <button onClick={onMoveDown} disabled={isLast || disabled}
          style={{ background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer', color: isLast ? '#e4e4e7' : '#a1a1aa', padding: 0, lineHeight: 0.8 }}>
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <span className="text-sm font-semibold flex-1" style={{ color: vg.active ? '#18181b' : '#a1a1aa' }}>
        {vg.name}{!vg.active && <span className="text-xs ml-1" style={{ color: '#be123c' }}>(停用)</span>}
      </span>
      <span className="text-xs" style={{ color: '#a1a1aa' }}>{itemCount} 項</span>
      <button onClick={toggleActive} disabled={disabled}
        className="shrink-0 px-2 py-1 rounded-lg text-[11px] font-semibold"
        style={{ background: vg.active ? '#d1fae5' : '#f4f4f5', color: vg.active ? '#047857' : '#a1a1aa', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        {vg.active ? '啟用中' : '已停用'}
      </button>
      <button onClick={() => setEditing(true)} disabled={disabled}
        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 8, minWidth: 36, minHeight: 36 }}>
        <Pencil className="h-4 w-4" />
      </button>
      <button onClick={onDelete} disabled={disabled}
        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 8, minWidth: 36, minHeight: 36 }}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px', border: '1.5px solid #e4e4e7',
  borderRadius: 10, fontSize: 13, outline: 'none', background: 'white', fontFamily: 'inherit',
}
