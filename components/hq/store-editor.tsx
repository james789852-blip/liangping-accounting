'use client'

import { useState, useRef } from 'react'
import { updateStoreSettings } from '@/app/actions/stores'
import { updateCKAssignedStores, addCKExternalStore, deleteCKExternalStore } from '@/app/actions/ck'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Plus, X, Loader2, Check, Pencil, Trash2 } from 'lucide-react'

interface Store {
  id: string; name: string; mode: string; ichef_uber_linked: boolean
  uber_enabled: boolean; uber_accounts: string[]; panda_enabled: boolean
  twpay_enabled: boolean; online_enabled: boolean; petty_cash: number
  type?: string; assigned_store_ids?: string[]
}

interface Props {
  store: Store
  canEdit: boolean
  memberStoreOptions?: { id: string; name: string }[]
  externalStores?: { id: string; name: string }[]
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <button
        type="button" disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          position: 'relative', width: '36px', height: '20px', borderRadius: '10px', flexShrink: 0,
          background: checked ? '#F59E0B' : '#d4d4d8', border: 'none', cursor: disabled ? 'default' : 'pointer',
          transition: 'background 0.2s',
        }}>
        <span style={{
          position: 'absolute', top: '2px', left: '2px', width: '16px', height: '16px',
          background: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 0.2s',
        }} />
      </button>
      <span className="text-sm" style={{ color: '#52525b' }}>{label}</span>
    </label>
  )
}

export default function StoreEditor({ store, canEdit, memberStoreOptions = [], externalStores: initExternal = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [storeName, setStoreName] = useState(store.name)
  const [editingName, setEditingName] = useState(false)
  const [mode, setMode] = useState(store.mode)
  const [ichefLinked, setIchefLinked] = useState(store.ichef_uber_linked)
  const [uberEnabled, setUberEnabled] = useState(store.uber_enabled)
  const [uberAccounts, setUberAccounts] = useState<string[]>(store.uber_accounts ?? [])
  const [newAccount, setNewAccount] = useState('')
  const composingRef = useRef(false)
  const [pandaEnabled, setPandaEnabled] = useState(store.panda_enabled)
  const [twpayEnabled, setTwpayEnabled] = useState(store.twpay_enabled)
  const [onlineEnabled, setOnlineEnabled] = useState(store.online_enabled)
  const [pettyCash, setPettyCash] = useState(store.petty_cash)
  const [storeType, setStoreType] = useState(store.type ?? '店面')
  const [assignedStoreIds, setAssignedStoreIds] = useState<string[]>(store.assigned_store_ids ?? [])
  const [extStores, setExtStores] = useState<{ id: string; name: string }[]>(initExternal)
  const [newExtName, setNewExtName] = useState('')
  const [addingExt, setAddingExt] = useState(false)
  const [extLoading, setExtLoading] = useState<string | null>(null)

  function addAccount() {
    const name = newAccount.trim()
    if (!name) return
    if (uberAccounts.includes(name)) { toast.error('帳號名稱已存在'); return }
    setUberAccounts(prev => [...prev, name])
    setNewAccount('')
  }

  async function handleAddExtStore() {
    const name = newExtName.trim()
    if (!name) return
    if (extStores.some(s => s.name === name)) { toast.error('已有相同名稱的店家'); return }
    setExtLoading('add')
    const r = await addCKExternalStore(store.id, name)
    if (r.error) { toast.error(r.error) }
    else {
      // 重新 fetch 最新清單（id 由後端產生）
      setExtStores(prev => [...prev, { id: 'pending-' + Date.now(), name }])
      setNewExtName('')
      setAddingExt(false)
      toast.success(`已新增「${name}」`)
    }
    setExtLoading(null)
  }

  async function handleDeleteExtStore(id: string, name: string) {
    setExtLoading(id)
    const r = await deleteCKExternalStore(id)
    if (r.error) { toast.error(r.error) }
    else {
      setExtStores(prev => prev.filter(s => s.id !== id))
      toast.success(`已刪除「${name}」`)
    }
    setExtLoading(null)
  }

  async function handleSave() {
    if (!storeName.trim()) { toast.error('請填寫店家名稱'); return }
    setSaving(true)
    const [result, ckResult] = await Promise.all([
      updateStoreSettings(store.id, {
        name: storeName.trim(),
        type: storeType,
        mode, ichef_uber_linked: ichefLinked, uber_enabled: uberEnabled, uber_accounts: uberAccounts,
        panda_enabled: pandaEnabled, twpay_enabled: twpayEnabled, online_enabled: onlineEnabled, petty_cash: pettyCash,
      }),
      storeType === '央廚'
        ? updateCKAssignedStores(store.id, assignedStoreIds)
        : Promise.resolve({ success: true }),
    ])
    const ckErr = (ckResult as { error?: string }).error
    if (result.error || ckErr) { toast.error(result.error ?? ckErr) }
    else { toast.success(`${storeName} 設定已儲存`); setEditingName(false); setOpen(false) }
    setSaving(false)
  }

  const modeLabel: Record<string, string> = { ichef: 'iChef', handwrite: '手寫菜單', mixed: '混合模式' }

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', fontSize: storeName.length > 2 ? '10px' : '13px' }}>
            {storeName}
          </div>
          <div>
            <p className="text-sm font-semibold text-left" style={{ color: '#18181b' }}>{storeName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: storeType === '央廚' ? '#fef3c7' : '#f0fdf4', color: storeType === '央廚' ? '#b45309' : '#15803d' }}>
                {storeType}
              </span>
              {storeType !== '央廚' && (
                <>
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#f4f4f5', color: '#71717a' }}>
                    {modeLabel[mode] ?? mode}
                  </span>
                  {uberEnabled && uberAccounts.length > 0 && (
                    <span className="text-xs" style={{ color: '#a1a1aa' }}>Uber × {uberAccounts.length}</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 shrink-0" style={{ color: '#a1a1aa' }} />
          : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: '#a1a1aa' }} />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5" style={{ borderTop: '1px solid #f4f4f5', background: '#fafafa', paddingTop: '16px' }}>

          {/* 店家名稱 */}
          {canEdit && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>店家名稱</p>
              {editingName ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={storeName}
                    onChange={e => setStoreName(e.target.value)}
                    style={{ flex: 1, height: '36px', padding: '0 12px', border: '1.5px solid #F59E0B', borderRadius: '10px', fontSize: '14px', outline: 'none', background: 'white', fontFamily: 'inherit' }}
                  />
                  <button type="button" onClick={() => { setStoreName(store.name); setEditingName(false) }}
                    className="px-3 rounded-xl text-sm"
                    style={{ background: '#f4f4f5', color: '#71717a' }}>取消</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: '#18181b' }}>{storeName}</span>
                  <button type="button" onClick={() => setEditingName(true)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-indigo-50"
                    style={{ color: '#F59E0B' }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 店家類型 */}
          {canEdit && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>店家類型</p>
              <div className="flex gap-2">
                {(['店面', '央廚'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setStoreType(t)}
                    className="px-3 py-1.5 rounded-xl text-sm font-medium"
                    style={{
                      background: storeType === t ? 'linear-gradient(135deg,#F59E0B,#F97316)' : 'white',
                      color: storeType === t ? 'white' : '#52525b',
                      border: storeType === t ? 'none' : '1px solid #e4e4e7',
                      boxShadow: storeType === t ? '0 2px 8px rgba(245,158,11,0.2)' : 'none',
                    }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 央廚：體系內服務店家 */}
          {storeType === '央廚' && memberStoreOptions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>體系內服務店家</p>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e4e4e7' }}>
                {memberStoreOptions.map((s, i) => {
                  const checked = assignedStoreIds.includes(s.id)
                  return (
                    <label key={s.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors"
                      style={{ borderTop: i > 0 ? '1px solid #f4f4f5' : 'none', background: checked ? '#FFFBEB' : 'white' }}>
                      <input type="checkbox" checked={checked} disabled={!canEdit}
                        onChange={e => {
                          if (e.target.checked) setAssignedStoreIds(prev => [...prev, s.id])
                          else setAssignedStoreIds(prev => prev.filter(id => id !== s.id))
                        }}
                        style={{ accentColor: '#F59E0B', width: '16px', height: '16px' }}
                      />
                      <span className="text-sm font-medium" style={{ color: checked ? '#92400E' : '#52525b' }}>{s.name}</span>
                    </label>
                  )
                })}
              </div>
              <p className="text-xs" style={{ color: '#a1a1aa' }}>
                勾選的店家結帳時，叫貨金額會自動串入此央廚記錄
              </p>
            </div>
          )}

          {/* 央廚：體系外服務店家 */}
          {storeType === '央廚' && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>體系外服務店家</p>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e4e4e7' }}>
                {extStores.length === 0 && !addingExt && (
                  <p className="text-sm px-3 py-3" style={{ color: '#a1a1aa' }}>尚未新增體系外店家</p>
                )}
                {extStores.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2.5"
                    style={{ borderTop: i > 0 ? '1px solid #f4f4f5' : 'none', background: 'white' }}>
                    <span className="flex-1 text-sm font-medium" style={{ color: '#18181b' }}>{s.name}</span>
                    {canEdit && (
                      <button type="button"
                        onClick={() => handleDeleteExtStore(s.id, s.name)}
                        disabled={extLoading === s.id}
                        className="p-1 rounded-lg transition-colors hover:bg-red-50"
                        style={{ color: '#a1a1aa', border: 'none', background: 'none', cursor: 'pointer' }}>
                        {extLoading === s.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                ))}
                {canEdit && addingExt && (
                  <div className="flex gap-2 px-3 py-2.5" style={{ borderTop: extStores.length > 0 ? '1px solid #f4f4f5' : 'none' }}>
                    <input
                      autoFocus
                      value={newExtName}
                      onChange={e => setNewExtName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleAddExtStore() } }}
                      placeholder="體系外店家名稱"
                      style={{ flex: 1, height: '34px', padding: '0 10px', border: '1.5px solid #F59E0B', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white', fontFamily: 'inherit' }}
                    />
                    <button type="button" onClick={handleAddExtStore} disabled={extLoading === 'add'}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white shrink-0"
                      style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)' }}>
                      {extLoading === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '新增'}
                    </button>
                    <button type="button" onClick={() => { setAddingExt(false); setNewExtName('') }}
                      className="px-2.5 py-1.5 rounded-lg text-sm font-semibold shrink-0"
                      style={{ background: '#f4f4f5', color: '#52525b' }}>取消</button>
                  </div>
                )}
              </div>
              {canEdit && !addingExt && (
                <button type="button" onClick={() => setAddingExt(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold"
                  style={{ color: '#F59E0B', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Plus className="h-3.5 w-3.5" />新增體系外店家
                </button>
              )}
              <p className="text-xs" style={{ color: '#a1a1aa' }}>
                體系外店家叫貨金額由央廚管理人員每日手動填入
              </p>
            </div>
          )}

          {/* 營業模式 / Uber / 其他平台 / 零用金（店面限定） */}
          {storeType !== '央廚' && (
            <>
              {/* 營業模式 */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>營業模式</p>
                <div className="flex gap-2 flex-wrap">
                  {(['ichef', 'handwrite', 'mixed'] as const).map(m => (
                    <button key={m} type="button" disabled={!canEdit} onClick={() => setMode(m)}
                      className="px-3 py-1.5 rounded-xl text-sm font-medium"
                      style={{
                        background: mode === m ? 'linear-gradient(135deg,#F59E0B,#F97316)' : 'white',
                        color: mode === m ? 'white' : '#52525b',
                        border: mode === m ? 'none' : '1px solid #e4e4e7',
                        opacity: !canEdit ? 0.6 : 1,
                        boxShadow: mode === m ? '0 2px 8px rgba(245,158,11,0.2)' : 'none',
                      }}>
                      {modeLabel[m]}
                    </button>
                  ))}
                </div>
                {mode === 'ichef' && (
                  <div className="mt-2 space-y-1">
                    <Toggle label="iChef 整合外送平台（總金額含 Uber / 台灣Pay）"
                      checked={ichefLinked} onChange={setIchefLinked} disabled={!canEdit} />
                    <p className="text-[11px] ml-11" style={{ color: '#a1a1aa' }}>
                      啟用後，結帳時輸入 iChef 總金額，外送平台金額僅供扣除使用
                    </p>
                  </div>
                )}
              </div>

              {/* Uber */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>Uber Eats</p>
                  <Toggle label="啟用" checked={uberEnabled} onChange={setUberEnabled} disabled={!canEdit} />
                </div>
                {uberEnabled && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {uberAccounts.map(acc => (
                        <span key={acc} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-sm"
                          style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FEF3C7' }}>
                          {acc}
                          {canEdit && (
                            <button type="button" onClick={() => setUberAccounts(prev => prev.filter(a => a !== acc))}>
                              <X className="h-3 w-3" style={{ color: '#818cf8' }} />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <input
                          placeholder="帳號名稱（例：鑫營）"
                          style={{ flex: 1, height: '36px', padding: '0 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white', fontFamily: 'inherit' }}
                          value={newAccount}
                          onChange={e => setNewAccount(e.target.value)}
                          onCompositionStart={() => { composingRef.current = true }}
                          onCompositionEnd={() => { setTimeout(() => { composingRef.current = false }, 0) }}
                          onKeyDown={e => { if (e.key === 'Enter' && !composingRef.current) addAccount() }}
                        />
                        <button type="button" onClick={addAccount}
                          className="flex items-center gap-1 px-3 rounded-xl text-sm font-medium"
                          style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FEF3C7' }}>
                          <Plus className="h-3.5 w-3.5" /> 新增
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 其他平台 */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>其他平台 / 通路</p>
                <div className="space-y-2.5">
                  <Toggle label="熊貓 foodpanda" checked={pandaEnabled} onChange={setPandaEnabled} disabled={!canEdit} />
                  <Toggle label="台灣Pay" checked={twpayEnabled} onChange={setTwpayEnabled} disabled={!canEdit} />
                  <Toggle label="線上點餐" checked={onlineEnabled} onChange={setOnlineEnabled} disabled={!canEdit} />
                </div>
              </div>

              {/* 零用金 */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>結帳後剩餘零用金</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: '#a1a1aa' }}>$</span>
                  <input
                    type="number" min="0"
                    style={{ width: '128px', height: '36px', padding: '0 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', textAlign: 'right', outline: 'none', background: !canEdit ? '#fafafa' : 'white', fontVariantNumeric: 'tabular-nums' }}
                    value={pettyCash || ''} placeholder="0"
                    disabled={!canEdit}
                    onChange={e => setPettyCash(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </>
          )}

          {canEdit && (
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)', opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              儲存設定
            </button>
          )}
        </div>
      )}
    </div>
  )
}
