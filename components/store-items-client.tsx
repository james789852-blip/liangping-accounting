'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  enableSystemItem, disableSystemItem, addCustomItem, updateCustomItem, deleteCustomItem, applyAllDefaults,
} from '@/app/actions/store-items'
import {
  Tag, ChefHat, FileText, Percent, HelpCircle,
  Plus, Trash2, Pencil, CheckCircle2, Circle, Sparkles,
} from 'lucide-react'

interface VG { id: string; name: string; kind: string; sort_order: number; active: boolean }
interface SI { id: string; name: string; category: string; vendor_group_id: string | null; default_enabled: boolean; sort_order: number; active: boolean }
interface StoreItem {
  id: string; store_id: string; system_item_id: string | null
  custom_name: string | null; custom_category: string | null; custom_vendor_group_id: string | null
  sort_order: number; enabled: boolean
}

const KIND_INFO: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  ck:            { label: '央廚配送', icon: ChefHat,    color: '#92400E', bg: '#FEF3C7' },
  vendor:        { label: '叫貨廠商', icon: Tag,        color: '#0369A1', bg: '#E0F2FE' },
  doc_type:      { label: '文件類型', icon: FileText,   color: '#7C3AED', bg: '#F3E8FF' },
  tax:           { label: '退稅 / 稅金', icon: Percent, color: '#BE123C', bg: '#FFE4E6' },
  uncategorized: { label: '未分類',   icon: HelpCircle, color: '#71717A', bg: '#F4F4F5' },
}
const CATEGORY_STYLE: Record<string, { bg: string; color: string }> = {
  '食材': { bg: '#d1fae5', color: '#047857' },
  '耗材': { bg: '#FFFBEB', color: '#92400E' },
  '雜項': { bg: '#f4f4f5', color: '#71717a' },
}

export default function StoreItemsClient({
  mode, stores, storeId, storeName, vendorGroups, systemItems, initialStoreItems,
}: {
  mode: 'hq' | 'manager'
  stores: { id: string; name: string }[]
  storeId: string
  storeName: string
  vendorGroups: VG[]
  systemItems: SI[]
  initialStoreItems: StoreItem[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // 把 store_items 轉成 Map：system_item_id → enabled
  const enabledMap = useMemo(() => {
    const map = new Map<string, { enabled: boolean }>()
    for (const si of initialStoreItems) {
      if (si.system_item_id) map.set(si.system_item_id, { enabled: si.enabled })
    }
    return map
  }, [initialStoreItems])

  // 取得某 system_item 在此店的狀態
  function isEnabled(item: SI): boolean {
    const explicit = enabledMap.get(item.id)
    if (explicit) return explicit.enabled
    return item.default_enabled  // 沒設定過時用 system 預設
  }

  // 店家自訂品項
  const customItems = useMemo(
    () => initialStoreItems.filter(si => si.system_item_id === null),
    [initialStoreItems],
  )
  const customByVG = useMemo(() => {
    const map: Record<string, StoreItem[]> = {}
    for (const c of customItems) {
      const key = c.custom_vendor_group_id ?? '__no_group__'
      if (!map[key]) map[key] = []
      map[key].push(c)
    }
    return map
  }, [customItems])

  // 系統品項按 vendor_group 分組
  const itemsByVG = useMemo(() => {
    const map: Record<string, SI[]> = {}
    for (const v of vendorGroups) map[v.id] = []
    map['__no_group__'] = []
    for (const i of systemItems) {
      const key = i.vendor_group_id ?? '__no_group__'
      if (!map[key]) map[key] = []
      map[key].push(i)
    }
    return map
  }, [systemItems, vendorGroups])

  // 統計
  const enabledCount = systemItems.filter(i => isEnabled(i)).length + customItems.filter(c => c.enabled).length
  const totalSystem = systemItems.length

  function toggleItem(item: SI) {
    const now = isEnabled(item)
    startTransition(async () => {
      const r = now ? await disableSystemItem(storeId, item.id) : await enableSystemItem(storeId, item.id)
      if ('error' in r && r.error) toast.error(r.error)
      else { router.refresh() }
    })
  }

  function applyDefaults() {
    if (!confirm('套用「全公司預設啟用」的所有品項到此店？已啟用的不會變動。')) return
    startTransition(async () => {
      const r = await applyAllDefaults(storeId)
      if ('error' in r && r.error) toast.error(r.error)
      else { toast.success(`已套用 ${(r as any).added ?? 0} 個品項`); router.refresh() }
    })
  }

  function changeStore(newId: string) {
    router.push(`/hq/store-items?storeId=${newId}`)
  }

  return (
    <div className="space-y-4">
      {/* 店家選擇 (HQ 才有) */}
      {mode === 'hq' && stores.length > 0 && (
        <div className="bg-white rounded-2xl p-3" style={{ border: '1px solid #f4f4f5' }}>
          <label className="block text-xs font-semibold mb-2" style={{ color: '#a1a1aa' }}>選擇店家</label>
          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {stores.map(s => (
              <button key={s.id} onClick={() => changeStore(s.id)}
                className="shrink-0 px-3.5 py-2 rounded-full text-sm font-semibold transition-all"
                style={s.id === storeId
                  ? { background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: 'white', boxShadow: '0 4px 12px rgba(245,158,11,0.3)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }
                  : { background: '#f4f4f5', color: '#52525b', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 統計 + 一鍵套用 */}
      <div className="bg-white rounded-2xl px-5 py-4 flex items-center justify-between" style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div>
          <p className="text-xs" style={{ color: '#a1a1aa' }}>{storeName} · 已啟用品項</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums" style={{ color: '#18181b' }}>
            {enabledCount} <span className="text-sm font-normal" style={{ color: '#a1a1aa' }}>/ {totalSystem + customItems.length}</span>
          </p>
        </div>
        <button onClick={applyDefaults} disabled={isPending}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'white', border: '1.5px solid #FEF3C7', color: '#92400E', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Sparkles className="h-3.5 w-3.5" />
          套用預設
        </button>
      </div>

      {/* 系統品項（依分類） */}
      {vendorGroups.filter(v => v.active).sort((a, b) => a.sort_order - b.sort_order).map(vg => {
        const sysList = itemsByVG[vg.id] ?? []
        const customList = customByVG[vg.id] ?? []
        if (sysList.length === 0 && customList.length === 0) return null
        const info = KIND_INFO[vg.kind] ?? KIND_INFO['uncategorized']
        const Icon = info.icon
        const enabledInGroup = sysList.filter(s => isEnabled(s)).length + customList.filter(c => c.enabled).length
        return (
          <div key={vg.id} className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid #f4f4f5' }}>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: info.bg, color: info.color }}>
                  <Icon className="h-3.5 w-3.5" />{info.label}
                </span>
                <h3 className="text-sm font-bold" style={{ color: '#18181b' }}>{vg.name}</h3>
                <span className="text-xs" style={{ color: '#a1a1aa' }}>{enabledInGroup} / {sysList.length + customList.length}</span>
              </div>
            </div>
            <div>
              {sysList.map(item => {
                const on = isEnabled(item)
                const catSt = CATEGORY_STYLE[item.category] ?? CATEGORY_STYLE['雜項']
                return (
                  <button key={item.id} type="button" onClick={() => toggleItem(item)} disabled={isPending}
                    className="w-full px-4 py-2.5 flex items-center gap-3 text-left"
                    style={{ borderBottom: '1px solid #f4f4f5', background: on ? '#fdfefe' : 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderTop: 'none' }}>
                    {on
                      ? <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: '#10b981' }} />
                      : <Circle className="h-5 w-5 shrink-0" style={{ color: '#d4d4d8' }} />
                    }
                    <span className="flex-1 text-sm" style={{ color: on ? '#18181b' : '#71717a', fontWeight: on ? 600 : 400 }}>{item.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: catSt.bg, color: catSt.color }}>
                      {item.category}
                    </span>
                    {item.default_enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: '#E0F2FE', color: '#0369A1' }}>
                        預設
                      </span>
                    )}
                  </button>
                )
              })}
              {customList.map(c => (
                <CustomItemRow key={c.id} item={c} storeId={storeId} vendorGroups={vendorGroups} disabled={isPending}
                  onUpdated={() => router.refresh()} />
              ))}
            </div>
          </div>
        )
      })}

      {/* 新增自訂品項 */}
      <AddCustomItemCard storeId={storeId} vendorGroups={vendorGroups} onCreated={() => router.refresh()} />
    </div>
  )
}

function AddCustomItemCard({ storeId, vendorGroups, onCreated }: { storeId: string; vendorGroups: VG[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<'食材' | '耗材' | '雜項'>('食材')
  const [vgId, setVgId] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!name.trim()) { toast.error('請填寫品項名稱'); return }
    if (!vgId) { toast.error('請選擇廠商分類'); return }
    startTransition(async () => {
      const r = await addCustomItem(storeId, { name, category, vendor_group_id: vgId })
      if ('error' in r && r.error) toast.error(r.error)
      else { toast.success(`已新增「${name}」`); setName(''); setVgId(''); setOpen(false); onCreated() }
    })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold"
        style={{ background: 'white', border: '2px dashed #FEF3C7', color: '#92400E', cursor: 'pointer', fontFamily: 'inherit' }}>
        <Plus className="h-4 w-4" />新增此店獨有品項
      </button>
    )
  }
  return (
    <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1.5px solid #FEF3C7', boxShadow: '0 2px 8px rgba(245,158,11,0.12)' }}>
      <p className="text-sm font-semibold" style={{ color: '#92400E' }}>新增此店獨有品項</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>品項名稱</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="例如：小白菜" style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>類別</label>
          <select value={category} onChange={e => setCategory(e.target.value as any)} style={inputStyle}>
            <option>食材</option><option>耗材</option><option>雜項</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#52525b' }}>歸屬分類</label>
          <select value={vgId} onChange={e => setVgId(e.target.value)} style={inputStyle}>
            <option value="">— 請選擇 —</option>
            {vendorGroups.filter(v => v.active).sort((a, b) => a.sort_order - b.sort_order).map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: isPending ? 0.6 : 1 }}>
          {isPending ? '儲存中…' : '儲存'}
        </button>
        <button onClick={() => { setOpen(false); setName(''); setVgId('') }}
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b', cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
      </div>
    </div>
  )
}

function CustomItemRow({ item, storeId, vendorGroups, disabled, onUpdated }: { item: StoreItem; storeId: string; vendorGroups: VG[]; disabled: boolean; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.custom_name ?? '')
  const [category, setCategory] = useState(item.custom_category as any)
  const [vgId, setVgId] = useState(item.custom_vendor_group_id ?? '')
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const r = await updateCustomItem(item.id, storeId, { name, category, vendor_group_id: vgId || null })
      if ('error' in r && r.error) toast.error(r.error)
      else { setEditing(false); toast.success('已更新'); onUpdated() }
    })
  }
  function remove() {
    if (!confirm(`刪除自訂品項「${item.custom_name}」？`)) return
    startTransition(async () => {
      const r = await deleteCustomItem(item.id, storeId)
      if ('error' in r && r.error) toast.error(r.error)
      else { toast.success('已刪除'); onUpdated() }
    })
  }

  const catSt = CATEGORY_STYLE[item.custom_category ?? '雜項'] ?? CATEGORY_STYLE['雜項']

  if (editing) {
    return (
      <div className="px-4 py-3 space-y-2" style={{ borderBottom: '1px solid #f4f4f5', background: '#fffbeb' }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="品項名稱" />
          <select value={category} onChange={e => setCategory(e.target.value as any)} style={inputStyle}>
            <option>食材</option><option>耗材</option><option>雜項</option>
          </select>
          <select value={vgId} onChange={e => setVgId(e.target.value)} style={inputStyle}>
            {vendorGroups.filter(v => v.active).map(v => (<option key={v.id} value={v.id}>{v.name}</option>))}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={isPending} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ background: '#10b981', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>儲存</button>
          <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'white', border: '1px solid #e4e4e7', cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-2.5 flex items-center gap-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
      <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: '#10b981' }} />
      <span className="flex-1 text-sm font-semibold" style={{ color: '#18181b' }}>{item.custom_name}</span>
      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: catSt.bg, color: catSt.color }}>{item.custom_category}</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: '#FEF3C7', color: '#92400E' }}>店家自訂</span>
      <button onClick={() => setEditing(true)} disabled={disabled} style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 8, minWidth: 36, minHeight: 36 }}>
        <Pencil className="h-4 w-4" />
      </button>
      <button onClick={remove} disabled={disabled} style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 8, minWidth: 36, minHeight: 36 }}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px', border: '1.5px solid #e4e4e7',
  borderRadius: 10, fontSize: 13, outline: 'none', background: 'white', fontFamily: 'inherit',
}
