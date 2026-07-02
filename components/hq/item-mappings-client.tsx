'use client'

import { useState, useTransition, useEffect } from 'react'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import {
  deleteItemMapping, updateItemMapping, saveItemMapping, copyGlobalMappingsToStore, reorderItemMappings,
} from '@/app/actions/item-mappings'
import { useRouter } from 'next/navigation'
import { Trash2, Edit2, Check, X, Plus, Tag, Copy, ChevronLeft, ChevronUp, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import HelpBox from './help-box'

interface Mapping {
  id: string; item_name: string; excel_column: string; item_category: string; store_id?: string | null; vendor_group?: string | null
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
  const [newVgName, setNewVgName] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Sync from server after router.refresh()
  useEffect(() => { setMappings(initial) }, [initial])

  const displayMappings = activeStoreId === ''
    ? mappings.filter(m => !m.store_id)
    : mappings.filter(m => m.store_id === activeStoreId)

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
    // Excel 欄位空 → 預設用品項名（90% 情況相同，新品項也可直接建立）
    const excelCol = newCol.trim() || newName.trim()
    const storeIdParam = activeStoreId || undefined
    startTransition(async () => {
      await saveItemMapping(newName.trim(), excelCol, newCat, storeIdParam, newVendorGroup.trim() || undefined)
      setMappings(prev => [...prev, {
        id: `tmp-${Date.now()}`,
        item_name: newName.trim(),
        excel_column: excelCol,
        item_category: newCat,
        vendor_group: newVendorGroup.trim() || null,
        store_id: storeIdParam ?? null,
      }])
      setShowAdd(false); setNewName(''); setNewCol(''); setNewCat('食材'); setNewVendorGroup('')
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
    reorderItemMappings(reorderedIds.map(i => i.id)).catch(e => {
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

  // 顯示用：若 item_name 以 vendor_group 開頭就剝離前綴（"翁師傅其他" → "其他"）
  function displayName(m: Mapping): string {
    const vg = m.vendor_group?.trim()
    if (vg && m.item_name.startsWith(vg) && m.item_name !== vg) {
      return m.item_name.slice(vg.length)
    }
    return m.item_name
  }

  // 以 vendor_group 為主分類（無則歸「未分類」），分組內依 item_name 排序
  const grouped = displayMappings.reduce<Record<string, Mapping[]>>((acc, m) => {
    const vg = (m.vendor_group?.trim() || '未分類')
    if (!acc[vg]) acc[vg] = []
    acc[vg].push(m)
    return acc
  }, {})

  // 排序：優先用 system_vendor_groups.sort_order（對齊各店 Excel 順序），
  //       不在 system_vendor_groups 內的分類往後排
  const vgSortMap = new Map(vendorGroups.map(v => [v.name, v.sort_order] as const))
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
      const r = await createVendorGroup({ name, kind: 'vendor', sort_order: 100 })
      if ('error' in r && r.error) {
        toast.error(r.error)
        return
      }
      toast.success(`已新增分類「${name}」`)
      setShowAddVg(false)
      setNewVgName('')
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
    const ids = reordered.map(name => vendorGroups.find(v => v.name === name)?.id).filter((x): x is string => !!x)
    if (ids.length === 0) return
    // optimistic：更新 local vgSortMap
    ids.forEach((id, i) => {
      const vg = vendorGroups.find(v => v.id === id)
      if (vg) vg.sort_order = (i + 1) * 10
    })
    // fire-and-forget server update
    import('@/app/actions/system-config').then(({ reorderVendorGroups }) => {
      reorderVendorGroups(ids).catch(e => {
        toast.error('分類排序失敗：' + (e instanceof Error ? e.message : String(e)))
      })
    })
    // 強制 re-render（vendorGroups 是 prop 修改但 React 不會察覺，所以手動觸發）
    setMappings(prev => [...prev])
  }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

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
                onKeyDown={e => { if (e.key === 'Enter') handleAddVendorGroup() }} />
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

      {/* Header */}
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-2xl mx-auto">
          <button onClick={() => router.back()}
            className="flex items-center gap-1 text-sm font-medium mb-3"
            style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <ChevronLeft className="h-4 w-4" />上一頁
          </button>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
                <Tag className="h-3.5 w-3.5" />
                品項對應
              </div>
              <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>品項對應管理</h1>
              <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
                {isStorePage ? '此店自訂對應（優先於全域預設）' : '全域預設對應（適用所有店）'}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {isStorePage && globalCount > 0 && (
                <button onClick={handleCopyGlobal} disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{ background: 'white', border: '1.5px solid #FEF3C7', color: '#92400E' }}>
                  <Copy className="h-3.5 w-3.5" /> 複製全域
                </button>
              )}
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

          {/* Store tabs */}
          {stores.length > 0 && (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => { setActiveStoreId(''); setShowAdd(false); setEditId(null) }}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={activeStoreId === ''
                  ? { background: '#F59E0B', color: 'white' }
                  : { background: '#f4f4f5', color: '#52525b' }}>
                全域預設 ({globalCount})
              </button>
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

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 pb-28">

        {/* 教學說明 */}
        <HelpBox title="📖 這頁怎麼用？（直接決定 Excel 匯出）" defaultOpen>
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
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!newName.trim() || isPending}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', opacity: !newName.trim() || isPending ? 0.5 : 1 }}>
                儲存
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
        {groupOrder.map((vg, vgIdx) => {
          const items = grouped[vg]
          const vgSt = vg === '未分類' ? VG_STYLE_UNCAT : DOC_TYPES.has(vg) ? VG_STYLE_DOC : VG_STYLE
          const isVgFirst = vgIdx === 0
          const isVgLast = vgIdx === groupOrder.length - 1
          const hasVgRecord = vgSortMap.has(vg)
          return (
            <div key={vg}>
              <div className="flex items-center gap-2 mb-2 px-1">
                {hasVgRecord && (
                  <div className="flex flex-col" style={{ width: 18 }}>
                    <button onClick={() => moveVendorGroup(vg, 'up')} disabled={isVgFirst || isPending}
                      style={{ background: 'none', border: 'none', cursor: isVgFirst ? 'default' : 'pointer', color: isVgFirst ? '#e4e4e7' : '#a1a1aa', padding: 0, lineHeight: 0.7 }}>
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button onClick={() => moveVendorGroup(vg, 'down')} disabled={isVgLast || isPending}
                      style={{ background: 'none', border: 'none', cursor: isVgLast ? 'default' : 'pointer', color: isVgLast ? '#e4e4e7' : '#a1a1aa', padding: 0, lineHeight: 0.7 }}>
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
                  const vgRec = vendorGroups.find(v => v.name === vg)
                  if (!vgRec) return null
                  return (
                    <VgDocTypeSelector vgId={vgRec.id} vgName={vg} currentDoc={vgRec.doc_type ?? null} />
                  )
                })()}
              </div>
              <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                {items.map((m, idx) => {
                  const catSt = CAT_STYLE[m.item_category] ?? CAT_STYLE['雜項']
                  const isFirst = idx === 0
                  const isLast = idx === items.length - 1
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5"
                      style={{ borderBottom: idx !== items.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                      <div className="flex flex-col shrink-0" style={{ width: 20 }}>
                        <button onClick={() => moveItem(vg, idx, 'up')} disabled={isFirst || isPending}
                          style={{ background: 'none', border: 'none', cursor: isFirst ? 'default' : 'pointer', color: isFirst ? '#e4e4e7' : '#a1a1aa', padding: 0, lineHeight: 0.8 }}>
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button onClick={() => moveItem(vg, idx, 'down')} disabled={isLast || isPending}
                          style={{ background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer', color: isLast ? '#e4e4e7' : '#a1a1aa', padding: 0, lineHeight: 0.8 }}>
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="flex-1 text-sm font-semibold" style={{ color: '#18181b' }}>{displayName(m)}</span>

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
                          <span className="text-sm tabular-nums" style={{ color: '#71717a' }}>{m.excel_column}</span>
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
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 廠商群組的單據類型（doc_type）快速編輯 */
function VgDocTypeSelector({ vgId, vgName, currentDoc }: { vgId: string; vgName: string; currentDoc: string | null }) {
  const [doc, setDoc] = useState(currentDoc ?? '')
  const [saving, setSaving] = useState(false)

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

  return (
    <select value={doc} onChange={e => save(e.target.value)} disabled={saving}
      title={`「${vgName}」的預設單據類型（會顯示在 Excel Row 2）`}
      style={{
        height: 22, padding: '0 4px', fontSize: 11, borderRadius: 4,
        border: '1px solid #DBEAFE', background: doc ? '#DBEAFE' : 'white',
        color: doc ? '#1E40AF' : '#a1a1aa', fontFamily: 'inherit', outline: 'none',
      }}>
      <option value="">單據類型…</option>
      <option value="發票">發票</option>
      <option value="收據">收據</option>
      <option value="估價單">估價單</option>
      <option value="公司開">公司開</option>
      <option value="梁鑫開">梁鑫開</option>
      <option value="府中開">府中開</option>
    </select>
  )
}
