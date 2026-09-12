'use client'

import { useState } from 'react'
import { createCKPrice, deleteCKPriceOverride, updateCKPrice, upsertCKPriceOverride } from '@/app/actions/ck-prices'
import { toast } from 'sonner'
import { Loader2, Pencil, Check, X, Plus, CalendarDays, Trash2, Store } from 'lucide-react'

interface CKItem {
  id: string
  item_name: string
  unit_price: number
  unit?: string
  updated_at: string
  updated_by_name?: string | null
  updated_by_role?: string | null
  active?: boolean
}

interface StoreOption { id: string; name: string }

interface DailyPriceOverride {
  id: string
  central_kitchen_price_id: string
  store_id: string
  business_date: string
  unit_price: number
  reason?: string | null
  store_name: string
  item_name: string
  default_unit_price: number
  updated_by_name?: string | null
  updated_at?: string
}

interface CKPriceEditorProps {
  items: CKItem[]
  stores?: StoreOption[]
  dailyOverrides?: DailyPriceOverride[]
  initialDate?: string
  priceHistory?: any[]
  canEdit: boolean
}

export default function CKPriceEditor({
  items,
  stores = [],
  dailyOverrides: initialDailyOverrides = [],
  initialDate = '',
  priceHistory = [],
  canEdit,
}: CKPriceEditorProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [prices, setPrices] = useState<CKItem[]>(items)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('份')
  const [newPrice, setNewPrice] = useState('')
  const activeItems = prices.filter(item => item.active !== false)
  const [overrideStoreId, setOverrideStoreId] = useState(stores[0]?.id ?? '')
  const [overrideDate, setOverrideDate] = useState(initialDate)
  const [overridePriceId, setOverridePriceId] = useState(activeItems[0]?.id ?? '')
  const [overridePrice, setOverridePrice] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [dailyOverrides, setDailyOverrides] = useState<DailyPriceOverride[]>(initialDailyOverrides)

  async function addItem() {
    const price = Number(newPrice)
    if (!newName.trim()) { toast.error('請輸入品項名稱'); return }
    if (newPrice === '' || !Number.isFinite(price) || price < 0) { toast.error('請輸入有效的單價'); return }
    setLoading(true)
    const result = await createCKPrice(newName, newUnit, price)
    if (result.error) toast.error(result.error)
    else {
      setPrices(prev => [...prev, { ...result.item, updated_by_name: '剛剛新增' }])
      setNewName(''); setNewUnit('份'); setNewPrice(''); setAdding(false)
      toast.success('已新增，店面央廚配送步驟會立即同步')
    }
    setLoading(false)
  }

  function startEdit(item: CKItem) {
    setEditing(item.id)
    setEditValue(String(item.unit_price))
    setEditUnit(item.unit || '份')
    setReason('')
  }

  function cancelEdit() { setEditing(null); setEditValue(''); setEditUnit(''); setReason('') }

  async function saveEdit(id: string) {
    const newPrice = parseFloat(editValue)
    if (isNaN(newPrice) || newPrice < 0) { toast.error('請輸入有效的金額'); return }
    setLoading(true)
    const result = await updateCKPrice(id, newPrice, reason, editUnit)
    if (result.error) { toast.error(result.error) }
    else {
      setPrices(prev => prev.map(p => p.id === id ? { ...p, unit_price: newPrice, unit: editUnit } : p))
      toast.success('已更新')
      setEditing(null)
    }
    setLoading(false)
  }

  async function saveDailyOverride() {
    const unitPrice = Number(overridePrice)
    if (!overrideStoreId) { toast.error('請選擇店家'); return }
    if (!overrideDate) { toast.error('請選擇營業日期'); return }
    if (!overridePriceId) { toast.error('請選擇央廚品項'); return }
    if (overridePrice === '' || !Number.isFinite(unitPrice) || unitPrice < 0) { toast.error('請輸入有效的特例單價'); return }
    if (!overrideReason.trim()) { toast.error('請填寫設定特例的原因'); return }

    setLoading(true)
    const result = await upsertCKPriceOverride({
      storeId: overrideStoreId,
      businessDate: overrideDate,
      priceId: overridePriceId,
      unitPrice,
      reason: overrideReason,
    })
    if (result.error) {
      toast.error(result.error)
    } else {
      const store = stores.find(item => item.id === overrideStoreId)
      const price = prices.find(item => item.id === overridePriceId)
      const saved: DailyPriceOverride = {
        ...(result.override as DailyPriceOverride),
        unit_price: unitPrice,
        store_name: store?.name ?? '未知店家',
        item_name: price?.item_name ?? '未知品項',
        default_unit_price: Number(price?.unit_price ?? 0),
        updated_by_name: '剛剛由您設定',
      }
      setDailyOverrides(current => [
        saved,
        ...current.filter(item => !(
          item.store_id === overrideStoreId
          && item.business_date === overrideDate
          && item.central_kitchen_price_id === overridePriceId
        )),
      ])
      setOverridePrice('')
      setOverrideReason('')
      toast.success(`已設定：${store?.name ?? '店家'} ${overrideDate} 當日使用 $${unitPrice}`)
    }
    setLoading(false)
  }

  async function removeDailyOverride(item: DailyPriceOverride) {
    if (!window.confirm(`確定取消「${item.store_name} ${item.business_date} ${item.item_name}」的單日特例嗎？`)) return
    setLoading(true)
    const result = await deleteCKPriceOverride(item.id)
    if (result.error) toast.error(result.error)
    else {
      setDailyOverrides(current => current.filter(row => row.id !== item.id))
      toast.success('已取消單日特例，該店將改用總公司標準單價')
    }
    setLoading(false)
  }

  const selectedOverrideItem = prices.find(item => item.id === overridePriceId)

  return (
    <div>
      {canEdit && (
        <div className="mb-6 bg-white rounded-2xl overflow-hidden" style={{ border: '1.5px solid #fed7aa', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div className="px-4 py-3.5 flex items-start gap-3" style={{ background: '#fff7ed', borderBottom: '1px solid #ffedd5' }}>
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#ffedd5', color: '#ea580c' }}>
              <CalendarDays className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: '#9a3412' }}>指定店家單日特例</p>
              <p className="text-xs mt-0.5 leading-5" style={{ color: '#c2410c' }}>
                由總公司設定，只在所選店家的指定營業日生效；店面不能修改，其他店與其他日期仍使用標準單價。
              </p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold" style={{ color: '#52525b' }}>店家</span>
                <select value={overrideStoreId} onChange={event => setOverrideStoreId(event.target.value)} className="w-full h-11 px-3 rounded-xl text-sm outline-none bg-white" style={{ border: '1.5px solid #e4e4e7' }}>
                  {stores.length === 0 && <option value="">尚無可選店家</option>}
                  {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold" style={{ color: '#52525b' }}>生效營業日（僅此一天）</span>
                <input type="date" value={overrideDate} onChange={event => setOverrideDate(event.target.value)} className="w-full h-11 px-3 rounded-xl text-sm outline-none" style={{ border: '1.5px solid #e4e4e7' }} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold" style={{ color: '#52525b' }}>央廚品項</span>
                <select value={overridePriceId} onChange={event => setOverridePriceId(event.target.value)} className="w-full h-11 px-3 rounded-xl text-sm outline-none bg-white" style={{ border: '1.5px solid #e4e4e7' }}>
                  {activeItems.map(item => <option key={item.id} value={item.id}>{item.item_name}（標準 ${item.unit_price}）</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold" style={{ color: '#52525b' }}>當日特例單價</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#a1a1aa' }}>$</span>
                  <input type="number" min="0" step="0.5" value={overridePrice} onChange={event => setOverridePrice(event.target.value)} placeholder={selectedOverrideItem ? `標準價 ${selectedOverrideItem.unit_price}` : '特例單價'} className="w-full h-11 pl-7 pr-3 rounded-xl text-sm outline-none" style={{ border: '1.5px solid #fbbf24' }} />
                </div>
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold" style={{ color: '#52525b' }}>原因（必填）</span>
              <input value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="例如：9/10 已先下訂 9/12 配送，沿用調價前單價" className="w-full h-11 px-3 rounded-xl text-sm outline-none" style={{ border: '1.5px solid #e4e4e7' }} />
            </label>
            <div className="flex justify-end">
              <button type="button" disabled={loading || stores.length === 0 || activeItems.length === 0} onClick={saveDailyOverride} className="h-10 px-4 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center gap-2" style={{ background: '#ea580c' }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                設定單日特例
              </button>
            </div>
          </div>

          {dailyOverrides.length > 0 && (
            <div style={{ borderTop: '1px solid #f4f4f5' }}>
              <div className="px-4 py-2.5 text-xs font-semibold" style={{ background: '#fafafa', color: '#71717a' }}>已設定的單日特例</div>
              {dailyOverrides.map((item, index) => (
                <div key={item.id} className="px-4 py-3 flex items-center gap-3" style={{ borderTop: index === 0 ? '1px solid #f4f4f5' : undefined, borderBottom: index !== dailyOverrides.length - 1 ? '1px solid #f4f4f5' : undefined }}>
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#fff7ed', color: '#ea580c' }}><Store className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#18181b' }}>{item.store_name} · {item.business_date} · {item.item_name}</p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: '#71717a' }}>{item.reason || '未填原因'}{item.updated_by_name ? ` · ${item.updated_by_name}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold tabular-nums" style={{ color: '#ea580c' }}>${item.unit_price}</p>
                    <p className="text-[11px]" style={{ color: '#a1a1aa' }}>標準 ${item.default_unit_price}</p>
                  </div>
                  <button type="button" disabled={loading} onClick={() => removeDailyOverride(item)} title="取消單日特例" className="p-2 rounded-lg disabled:opacity-50" style={{ background: '#fef2f2', color: '#dc2626' }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <div className="mb-3">
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)' }}>
              <Plus className="h-4 w-4" />新增配送品項
            </button>
          ) : (
            <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1.5px solid #FDE68A' }}>
              <p className="text-sm font-bold" style={{ color: '#92400E' }}>新增央廚配送品項</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="品項名稱" className="h-11 px-3 rounded-xl text-sm outline-none" style={{ border: '1.5px solid #e4e4e7' }} />
                <input value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="單位，例如：包、鍋" className="h-11 px-3 rounded-xl text-sm outline-none" style={{ border: '1.5px solid #e4e4e7' }} />
                <input type="number" min="0" step="0.5" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="單價" className="h-11 px-3 rounded-xl text-sm outline-none" style={{ border: '1.5px solid #e4e4e7' }} />
              </div>
              <p className="text-xs" style={{ color: '#71717a' }}>儲存後會立即同步到所有店面的「央廚配送」步驟；歷史帳目不受影響。</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 rounded-xl text-sm" style={{ background: '#f4f4f5' }}>取消</button>
                <button type="button" disabled={loading} onClick={addItem} className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: '#F59E0B' }}>{loading ? '新增中…' : '新增並同步店面'}</button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      {prices.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-4 px-4 py-3.5"
          style={{ borderBottom: idx !== prices.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: '#18181b' }}>{item.item_name}</p>
            <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>
              上次更新：{new Date(item.updated_at).toLocaleDateString('zh-TW')}
              {item.updated_by_name && (
                <>
                  <span style={{ margin: '0 6px', color: '#d4d4d8' }}>·</span>
                  <span style={{ color: '#71717a' }}>{item.updated_by_name}</span>
                  {item.updated_by_role && (
                    <span style={{ color: '#a1a1aa', marginLeft: 4 }}>（{item.updated_by_role}）</span>
                  )}
                </>
              )}
            </p>
          </div>

          {editing === item.id ? (
            <div className="flex items-center gap-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm" style={{ color: '#a1a1aa' }}>$</span>
                  <input
                    type="number" min="0" step="0.5" autoFocus
                    style={{ width: '80px', height: '34px', padding: '0 10px', border: '1.5px solid #F59E0B', borderRadius: '10px', fontSize: '14px', textAlign: 'right', outline: 'none', fontVariantNumeric: 'tabular-nums', boxShadow: '0 0 0 4px rgba(245,158,11,0.12)' }}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                  />
                  <span className="text-xs" style={{ color: '#a1a1aa' }}>／</span>
                  <input
                    placeholder="單位"
                    style={{ width: '52px', height: '34px', padding: '0 8px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', textAlign: 'center' }}
                    value={editUnit}
                    onChange={e => setEditUnit(e.target.value)}
                  />
                </div>
                <input
                  placeholder="異動原因（選填）"
                  style={{ width: '160px', height: '28px', padding: '0 8px', border: '1.5px solid #e4e4e7', borderRadius: '8px', fontSize: '12px', outline: 'none', fontFamily: 'inherit' }}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
              </div>
              <button onClick={() => saveEdit(item.id)} disabled={loading}
                className="p-1.5 rounded-lg"
                style={{ background: '#d1fae5', color: '#047857', opacity: loading ? 0.5 : 1 }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button onClick={cancelEdit} className="p-1.5 rounded-lg" style={{ background: '#f4f4f5', color: '#52525b' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: '#f4f4f5', color: '#71717a' }}>／{item.unit || '份'}</span>
              <span className="text-xl font-bold tabular-nums" style={{ color: '#18181b' }}>${item.unit_price}</span>
              {canEdit && (
                <button onClick={() => startEdit(item)} className="p-1.5 rounded-lg"
                  style={{ background: '#f4f4f5', color: '#a1a1aa' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FFFBEB'; (e.currentTarget as HTMLElement).style.color = '#92400E' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f4f4f5'; (e.currentTarget as HTMLElement).style.color = '#a1a1aa' }}>
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      </div>

      {priceHistory.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
            <p className="text-sm font-semibold" style={{ color: '#18181b' }}>最近單價變動紀錄</p>
          </div>
          {priceHistory.map((h: any, idx: number) => {
            const dateStr = h.changed_at || h.created_at
            const date = dateStr ? new Date(dateStr).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : '—'
            return (
              <div key={idx} className="px-4 py-3 flex items-start gap-3 text-sm"
                style={{ borderBottom: idx !== priceHistory.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                <span className="shrink-0 text-xs tabular-nums font-medium" style={{ color: '#a1a1aa', marginTop: '1px' }}>{date}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium" style={{ color: '#18181b' }}>{h.item_name}</span>
                  <span className="mx-1.5" style={{ color: '#a1a1aa' }}>
                    <span className="tabular-nums" style={{ color: '#71717a' }}>${h.old_price}</span>
                    <span className="mx-1" style={{ color: '#d4d4d8' }}>→</span>
                    <span className="tabular-nums font-semibold" style={{ color: '#92400E' }}>${h.new_price}</span>
                  </span>
                  {h.reason && (
                    <span className="text-xs" style={{ color: '#a1a1aa' }}>（{h.reason}）</span>
                  )}
                </div>
                {h.changed_by_name && (
                  <span className="shrink-0 text-xs" style={{ color: '#71717a' }}>
                    {h.changed_by_name}{h.changed_by_role && (
                      <span style={{ color: '#a1a1aa', marginLeft: 4 }}>· {h.changed_by_role}</span>
                    )}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
