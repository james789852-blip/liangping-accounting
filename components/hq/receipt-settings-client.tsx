'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Plus, Loader2, Pencil, Check, X } from 'lucide-react'
import ReceiptSettings from '@/components/manager/receipt-settings'
import { setManagerStore } from '@/app/actions/store-select'
import type { CategoryWithVendors } from '@/app/actions/receipt-settings'
import {
  createCKVendorGroup, updateCKVendorGroup, deleteCKVendorGroup,
  type CKVendorGroup,
} from '@/app/actions/ck-vendor-groups'
import HelpBox from './help-box'

interface Store { id: string; name: string }

export default function ReceiptSettingsClient({
  type, stores, currentStoreId, initialCategories, initialCKGroups,
}: {
  type: 'store' | 'ck'
  stores: Store[]
  currentStoreId: string
  initialCategories: CategoryWithVendors[]
  initialCKGroups: CKVendorGroup[]
}) {
  const router = useRouter()

  function changeType(nextType: 'store' | 'ck') {
    router.push(`/hq/receipt-settings?type=${nextType}`)
  }
  function changeStore(storeId: string) {
    setManagerStore(storeId).catch(() => {})
    router.push(`/hq/receipt-settings?type=${type}&storeId=${storeId}`)
  }

  return (
    <div className="space-y-4">
      {/* 類型 tab */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => changeType('store')} style={tabBtn(type === 'store')}>店面</button>
        <button onClick={() => changeType('ck')} style={tabBtn(type === 'ck')}>央廚</button>
      </div>

      {/* 店家 selector */}
      <select value={currentStoreId} onChange={e => changeStore(e.target.value)}
        style={{
          width: '100%', height: 44, padding: '0 14px', border: '1.5px solid #e4e4e7',
          borderRadius: 10, fontSize: 14, outline: 'none', background: 'white', fontFamily: 'inherit',
        }}>
        {stores.length === 0 && <option value="">{type === 'ck' ? '無央廚' : '無店家'}</option>}
        {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      {currentStoreId && (
        <ReceiptSettings storeId={currentStoreId} initialCategories={initialCategories} />
      )}
    </div>
  )
}

/* ─────────── 央廚廠商群組編輯 ─────────── */
function CKVendorGroupsEditor({ ckStoreId, initialGroups }: { ckStoreId: string; initialGroups: CKVendorGroup[] }) {
  const router = useRouter()
  const [groups, setGroups] = useState<CKVendorGroup[]>(initialGroups)
  const [newName, setNewName] = useState('')
  const [newDoc, setNewDoc] = useState('發票')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDoc, setEditDoc] = useState('')

  async function handleAdd() {
    if (!newName.trim()) { toast.error('廠商名稱不能空'); return }
    setAdding(true)
    const r = await createCKVendorGroup(ckStoreId, newName.trim(), newDoc || undefined)
    setAdding(false)
    if ('error' in r) { toast.error(r.error); return }
    toast.success('已新增')
    setNewName(''); setNewDoc('發票')
    router.refresh()
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) { toast.error('名稱不能空'); return }
    const r = await updateCKVendorGroup(id, { name: editName.trim(), doc_type: editDoc || null })
    if ('error' in r) { toast.error(r.error); return }
    toast.success('已更新')
    setEditingId(null)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除這個廠商群組？')) return
    const r = await deleteCKVendorGroup(id)
    if ('error' in r) { toast.error(r.error); return }
    toast.success('已刪除')
    setGroups(prev => prev.filter(g => g.id !== id))
  }

  function startEdit(g: CKVendorGroup) {
    setEditingId(g.id); setEditName(g.name); setEditDoc(g.doc_type ?? '')
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl p-4 space-y-2" style={{ border: '1px solid #f4f4f5' }}>
        <p className="text-xs font-semibold" style={{ color: '#52525b' }}>已設定廠商群組（{groups.length}）</p>
        {groups.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: '#a1a1aa' }}>尚未設定廠商，先在下方新增</p>
        )}
        <ul className="space-y-1.5">
          {groups.map(g => (
            <li key={g.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#fafafa' }}>
              {editingId === g.id ? (
                <>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    className="flex-1 text-sm px-2 py-1 rounded-lg border outline-none"
                    style={{ border: '1.5px solid #F59E0B', background: 'white' }} autoFocus />
                  <select value={editDoc} onChange={e => setEditDoc(e.target.value)}
                    className="text-xs px-2 py-1 rounded-lg border outline-none"
                    style={{ border: '1.5px solid #e4e4e7', background: 'white' }}>
                    <option value="">（不設）</option>
                    <option value="發票">發票</option>
                    <option value="收據">收據</option>
                    <option value="估價單">估價單</option>
                    <option value="公司開">公司開</option>
                    <option value="梁鑫開">梁鑫開</option>
                  </select>
                  <button onClick={() => handleSaveEdit(g.id)} style={{ color: '#047857', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditingId(null)} style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{g.name}</span>
                  {g.doc_type && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: '#dbeafe', color: '#1e40af' }}>{g.doc_type}</span>
                  )}
                  <button onClick={() => startEdit(g)} style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(g.id)} style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-2xl p-4 space-y-2" style={{ border: '1px solid #f4f4f5' }}>
        <p className="text-xs font-semibold" style={{ color: '#52525b' }}>新增廠商群組</p>
        <div className="grid grid-cols-3 gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="廠商名稱（如：雞肉商）"
            className="col-span-2 text-sm px-3 py-2 rounded-xl outline-none"
            style={{ border: '1.5px solid #e4e4e7', background: 'white' }} />
          <select value={newDoc} onChange={e => setNewDoc(e.target.value)}
            className="text-sm px-3 py-2 rounded-xl outline-none"
            style={{ border: '1.5px solid #e4e4e7', background: 'white', fontFamily: 'inherit' }}>
            <option value="">單據</option>
            <option value="發票">發票</option>
            <option value="收據">收據</option>
            <option value="估價單">估價單</option>
            <option value="公司開">公司開</option>
            <option value="梁鑫開">梁鑫開</option>
          </select>
        </div>
        <button onClick={handleAdd} disabled={adding}
          className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl"
          style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: 'white', border: 'none', cursor: 'pointer', opacity: adding ? 0.6 : 1 }}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          新增廠商
        </button>
      </div>
    </div>
  )
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  height: 40, borderRadius: 10,
  border: active ? '1.5px solid #F59E0B' : '1.5px solid #e4e4e7',
  background: active ? '#FEF3C7' : 'white',
  color: active ? '#B45309' : '#52525b',
  fontWeight: active ? 700 : 500,
  fontSize: 14, cursor: 'pointer',
})
