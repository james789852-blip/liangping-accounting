'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Plus, Loader2, Pencil, Check, X } from 'lucide-react'
import ReceiptSettings from '@/components/manager/receipt-settings'
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
    router.push(`/hq/receipt-settings?type=${type}&storeId=${storeId}`)
  }

  return (
    <div className="space-y-4">
      {/* 類型 tab */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => changeType('store')} style={tabBtn(type === 'store')}>店面</button>
        <button onClick={() => changeType('ck')} style={tabBtn(type === 'ck')}>央廚</button>
      </div>

      {/* 教學區塊 */}
      {type === 'store' ? (
        <HelpBox title="📖 店面收據廠商設定教學">
          <div className="rounded-lg p-3" style={{ background: 'white' }}>
            <p className="font-bold mb-1.5">💡 這頁是做什麼的？</p>
            <p>設定店長在錄入收據時，「大類」+「廠商」下拉選單會出現的選項。</p>
          </div>

          <div className="rounded-lg p-3 mt-2" style={{ background: 'white' }}>
            <p className="font-bold mb-1.5">🎯 三大類（不能改，系統預設）</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li><b>叫貨廠商</b>：向廠商叫貨（雞肉商 / 菜商 / 雜貨 / 免洗...）</li>
              <li><b>固定成本</b>：每月固定支出（房租 / 電費 / 瓦斯...）</li>
              <li><b>其他</b>：零星購買 / 稅金退款</li>
            </ul>
          </div>

          <div className="rounded-lg p-3 mt-2" style={{ background: '#fee2e2', color: '#991b1b' }}>
            <p className="font-bold">⚠️ 這裡設定的**不影響 Excel 欄位順序或名稱**！</p>
            <p className="mt-1">若要調整 Excel 匯出的欄位，請到「<b>品項對應管理</b>」設定。</p>
          </div>

          <div className="rounded-lg p-3 mt-2" style={{ background: '#e0f2fe' }}>
            <p className="font-bold mb-1">📝 建議操作步驟</p>
            <ol className="space-y-0.5 list-decimal list-inside">
              <li>展開「叫貨廠商」→ 加入該店常用廠商（跟品項對應管理的廠商群組名稱一致）</li>
              <li>「固定成本」列出每月會付的項目</li>
              <li>「其他」通常保留預設就好</li>
              <li>店長錄入收據時，這些名字會出現在下拉選單中</li>
            </ol>
          </div>
        </HelpBox>
      ) : (
        <HelpBox title="📖 央廚廠商群組設定教學">
          <div className="rounded-lg p-3" style={{ background: 'white' }}>
            <p className="font-bold mb-1.5">💡 這頁是做什麼的？</p>
            <p>設定該央廚常用的廠商清單。央廚每日輸入 expense 時，會從這裡自動帶「廠商群組」+「預設單據類型」。</p>
          </div>

          <div className="rounded-lg p-3 mt-2" style={{ background: 'white' }}>
            <p className="font-bold mb-1.5">🎯 對應央廚 Excel 匯出</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li><b>廠商群組</b>（vendor_group）→ 央廚 Excel <b>Row 1</b>（例：雞肉商 / 菜商 / 雜貨 / 翁師傅 / 退稅）</li>
              <li><b>單據類型</b>（doc_type）→ 央廚 Excel <b>Row 2</b>（發票 / 收據 / 估價單 / 公司開）</li>
            </ul>
          </div>

          <div className="rounded-lg p-3 mt-2" style={{ background: '#e0f2fe' }}>
            <p className="font-bold mb-1">📝 建議操作步驟</p>
            <ol className="space-y-0.5 list-decimal list-inside">
              <li>對照原本 Excel Row 1 的廠商，逐一「新增廠商」加進系統</li>
              <li>每個廠商設定「預設單據類型」（例：翁師傅 → 估價單、菜商 → 公司開）</li>
              <li>央廚每日輸入 expense 時，選了廠商後系統會**自動填單據類型**</li>
              <li>Excel 匯出時 Row 1 / Row 2 自動照這裡的順序 + 名稱產出</li>
            </ol>
          </div>

          <div className="rounded-lg p-3 mt-2" style={{ background: '#fef3c7', color: '#92400e' }}>
            <p className="font-bold">💡 小提示</p>
            <p className="mt-1">這裡是「建議清單」— 每筆央廚 expense 實際存的是自己帶的 vendor_group 字串。若要改某筆 expense 的廠商，回到央廚每日輸入頁面編輯。</p>
          </div>
        </HelpBox>
      )}

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
