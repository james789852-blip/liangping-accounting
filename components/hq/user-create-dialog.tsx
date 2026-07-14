'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, X } from 'lucide-react'
import { createUser } from '@/app/actions/users'
import { getTitleOptions, inferSystemRole, type AccountUnitType } from '@/lib/account-access'

interface Store { id: string; name: string; type?: string }

const PERMISSION_TOGGLES = [
  { key: 'can_manage_users', label: '可管理帳號', desc: '新增、修改、停用使用者帳號' },
  { key: 'can_manage_store_settings', label: '可管理店面店家', desc: '修改店面設定、外送帳號與零用金' },
  { key: 'can_manage_ck_settings', label: '可管理央廚店家', desc: '修改央廚設定、服務店家與體系外店家' },
  { key: 'can_manage_store_items', label: '可管理店面品項', desc: '修改店面品項對應與 Excel 欄位' },
  { key: 'can_manage_ck_items', label: '可管理央廚品項', desc: '修改央廚品項對應與 Excel 欄位' },
  { key: 'can_manage_store_receipts', label: '可管理店面收據廠商', desc: '修改店面結帳使用的類別與廠商' },
  { key: 'can_manage_ck_receipts', label: '可管理央廚收據廠商', desc: '修改央廚帳目使用的類別與廠商' },
  { key: 'can_manage_ck_prices', label: '可管理央廚單價', desc: '修改央廚配送品項單價與單位' },
  { key: 'can_review_closings', label: '可審核帳目', desc: '審核、退回、刪除店家帳目' },
  { key: 'can_export_reports', label: '可匯出報表', desc: '匯出管理用 Excel / 報表' },
] as const

const PERMISSION_GROUPS = [
  { label: '帳號與帳務', keys: ['can_manage_users', 'can_review_closings', 'can_export_reports'] },
  { label: '店面管理', keys: ['can_manage_store_settings', 'can_manage_store_items', 'can_manage_store_receipts'] },
  { label: '央廚管理', keys: ['can_manage_ck_settings', 'can_manage_ck_items', 'can_manage_ck_receipts', 'can_manage_ck_prices'] },
] as const

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px',
  fontSize: '14px', background: 'white', outline: 'none', fontFamily: 'inherit', color: '#18181b',
}

export default function UserCreateDialog({ stores }: { stores: Store[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', account: '', password: '', title: '經理', employee_id: '',
  })
  const [unitId, setUnitId] = useState('hq')
  const [customTitle, setCustomTitle] = useState(false)
  const [permissions, setPermissions] = useState<Record<(typeof PERMISSION_TOGGLES)[number]['key'], boolean>>({
    can_manage_users: false,
    can_manage_store_settings: false,
    can_manage_ck_settings: false,
    can_manage_store_items: false,
    can_manage_ck_items: false,
    can_manage_store_receipts: false,
    can_manage_ck_receipts: false,
    can_manage_ck_prices: false,
    can_review_closings: false,
    can_export_reports: false,
  })
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const primaryStore = stores.find(store => store.id === unitId)
  const unitType: AccountUnitType = unitId === 'hq' ? 'hq' : primaryStore?.type === '央廚' ? 'ck' : 'store'
  const titleOptions = getTitleOptions(unitType)
  const isHQ = unitType === 'hq'
  const isOwner = isHQ && inferSystemRole(form.title, titleOptions[0]) === '老闆'

  function toggleStore(id: string) {
    setSelectedStores(prev => {
      const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
      return next
    })
  }

  function handleClose() {
    setOpen(false)
    setForm({ name: '', account: '', password: '', title: '經理', employee_id: '' })
    setUnitId('hq')
    setCustomTitle(false)
    setPermissions({
      can_manage_users: false,
      can_manage_store_settings: false,
      can_manage_ck_settings: false,
      can_manage_store_items: false,
      can_manage_ck_items: false,
      can_manage_store_receipts: false,
      can_manage_ck_receipts: false,
      can_manage_ck_prices: false,
      can_review_closings: false,
      can_export_reports: false,
    })
    setSelectedStores([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.account || !form.password) { toast.error('請填寫所有必填欄位'); return }
    if (!form.title.trim()) { toast.error('請選擇或新增職稱'); return }
    setLoading(true)
    const result = await createUser({
      name: form.name,
      account: form.account,
      password: form.password,
      role: inferSystemRole(form.title, titleOptions[0]),
      title: form.title || undefined,
      employee_id: form.employee_id || undefined,
      is_hq: isHQ,
      ...(isHQ ? permissions : Object.fromEntries(Object.keys(permissions).map(key => [key, false]))),
      store_ids: isOwner ? [] : [...new Set([...(primaryStore ? [primaryStore.id] : []), ...selectedStores])],
      primary_store_id: primaryStore?.id ?? null,
    })
    if (result.error) { toast.error('建立失敗：' + result.error) }
    else { toast.success('帳號建立成功！'); handleClose() }
    setLoading(false)
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
        style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
        <Plus className="h-4 w-4" /> 新增帳號
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: 'white', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
              <h2 className="text-base font-bold" style={{ color: '#18181b' }}>新增使用者帳號</h2>
              <button onClick={handleClose} className="p-1.5 rounded-lg" style={{ color: '#a1a1aa', background: '#f4f4f5' }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>姓名 *</label>
                  <input style={INPUT_STYLE} placeholder="王小明"
                    value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>序號</label>
                  <input style={INPUT_STYLE} placeholder="tw0030001"
                    value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>帳號（身分證字號） *</label>
                <input
                  style={{ ...INPUT_STYLE, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  placeholder="A123456789"
                  value={form.account}
                  onChange={e => setForm(p => ({ ...p, account: e.target.value.toUpperCase() }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>密碼（出生年月日 YYMMDD） *</label>
                <input type="text" style={INPUT_STYLE} placeholder="如 830719"
                  value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>歸屬單位 *</label>
                <select style={{ ...INPUT_STYLE, cursor: 'pointer' }} value={unitId}
                  onChange={e => {
                    const nextId = e.target.value
                    const nextStore = stores.find(store => store.id === nextId)
                    const nextType: AccountUnitType = nextId === 'hq' ? 'hq' : nextStore?.type === '央廚' ? 'ck' : 'store'
                    setUnitId(nextId)
                    setCustomTitle(false)
                    setForm(prev => ({ ...prev, title: getTitleOptions(nextType)[0] ?? '' }))
                  }}>
                  <option value="hq">總公司</option>
                  <optgroup label="店面">
                    {stores.filter(store => (store.type ?? '店面') !== '央廚').map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </optgroup>
                  <optgroup label="央廚">
                    {stores.filter(store => store.type === '央廚').map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </optgroup>
                </select>
                <p className="text-[10px] mt-1" style={{ color: '#a1a1aa' }}>此單位決定帳號分類與登入主畫面。</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold" style={{ color: '#52525b' }}>職稱 *</label>
                  <button type="button" onClick={() => { setCustomTitle(value => !value); setForm(prev => ({ ...prev, title: '' })) }}
                    className="text-xs font-semibold" style={{ color: '#d97706' }}>
                    {customTitle ? '返回職稱選單' : '＋ 新增職稱'}
                  </button>
                </div>
                {customTitle ? (
                  <input style={INPUT_STYLE} placeholder="輸入自訂職稱" value={form.title}
                    onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} />
                ) : (
                  <select style={{ ...INPUT_STYLE, cursor: 'pointer' }} value={form.title}
                    onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}>
                    {titleOptions.map(title => <option key={title} value={title}>{title}</option>)}
                  </select>
                )}
              </div>

              {isOwner && (
                <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#b45309' }}>
                  老闆自動擁有全部店面及總公司後台存取權限
                </div>
              )}

              {isHQ && !isOwner && (
                <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid #f4f4f5', background: '#fafafa' }}>
                  <p className="text-xs font-bold" style={{ color: '#52525b' }}>總公司功能權限</p>
                  {PERMISSION_GROUPS.map(group => (
                    <div key={group.label}>
                      <p className="text-[10px] font-bold mb-1.5 mt-3 first:mt-1" style={{ color: '#a1a1aa' }}>{group.label}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {PERMISSION_TOGGLES.filter(item => (group.keys as readonly string[]).includes(item.key)).map(item => (
                          <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2" style={{ border: '1px solid #f4f4f5' }}>
                            <div><p className="text-sm font-semibold" style={{ color: '#18181b' }}>{item.label}</p><p className="text-[10px]" style={{ color: '#a1a1aa' }}>{item.desc}</p></div>
                            <button type="button" onClick={() => setPermissions(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                              className="h-5 w-9 rounded-full p-0.5 shrink-0" style={{ background: permissions[item.key] ? '#F59E0B' : '#d4d4d8' }}>
                              <span className="block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: permissions[item.key] ? 'translateX(16px)' : 'translateX(0)' }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isOwner && (
                <div>
                  <label className="block text-xs font-semibold mb-2" style={{ color: '#52525b' }}>其他店家權限（可切換）</label>
                  {(['店面', '央廚'] as const).map(type => {
                    const group = stores.filter(s => (s.type ?? '店面') === type)
                    if (group.length === 0) return null
                    return (
                      <div key={type} className="mb-3">
                        <p className="text-[10px] font-semibold mb-1.5 uppercase tracking-wide" style={{ color: '#a1a1aa' }}>{type}</p>
                        <div className="flex flex-wrap gap-2">
                          {group.map(s => (
                            <button key={s.id} type="button" disabled={s.id === primaryStore?.id} onClick={() => toggleStore(s.id)}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold"
                              style={{
                                background: (s.id === primaryStore?.id || selectedStores.includes(s.id)) ? 'linear-gradient(135deg,#F59E0B,#F97316)' : 'white',
                                color: (s.id === primaryStore?.id || selectedStores.includes(s.id)) ? 'white' : '#52525b',
                                border: (s.id === primaryStore?.id || selectedStores.includes(s.id)) ? 'none' : '1px solid #e4e4e7',
                                opacity: s.id === primaryStore?.id ? 0.65 : 1,
                              }}>
                              {s.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {selectedStores.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedStores.map(id => {
                        const s = stores.find(x => x.id === id)
                        return (
                          <span key={id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                            style={{ background: '#FFFBEB', color: '#92400E' }}>
                            {s?.name}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => toggleStore(id)} />
                          </span>
                        )
                      })}
                    </div>
                  )}

                  <p className="text-[10px] mt-2" style={{ color: '#1e40af' }}>
                    歸屬單位是主店面；這裡只設定可額外切換的其他店家，不會改變人員分類。
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={handleClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
                  取消
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)', opacity: loading ? 0.7 : 1 }}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  建立帳號
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
