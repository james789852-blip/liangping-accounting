'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, X } from 'lucide-react'
import { createUser } from '@/app/actions/users'

interface Store { id: string; name: string; type?: string }

const ROLES = ['老闆', '總監', '經理', '顧問', '助理', '廠長', '副廠長', '店長', '副店長', '小幫手']

const PERMISSION_TOGGLES = [
  { key: 'can_manage_users', label: '可管理帳號', desc: '新增、修改、停用使用者帳號' },
  { key: 'can_manage_stores', label: '可管理店家', desc: '修改店家設定、外送帳號、央廚服務店家' },
  { key: 'can_manage_items', label: '可管理品項', desc: '修改品項對應、收據廠商與 Excel 對應' },
  { key: 'can_manage_ck_prices', label: '可管理央廚單價', desc: '修改央廚配送品項單價與單位' },
  { key: 'can_review_closings', label: '可審核帳目', desc: '審核、退回、刪除店家帳目' },
  { key: 'can_export_reports', label: '可匯出報表', desc: '匯出管理用 Excel / 報表' },
] as const

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px',
  fontSize: '14px', background: 'white', outline: 'none', fontFamily: 'inherit', color: '#18181b',
}

export default function UserCreateDialog({ stores }: { stores: Store[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', account: '', password: '', role: '店長', title: '', employee_id: '',
  })
  const [isHQ, setIsHQ] = useState(false)
  const [permissions, setPermissions] = useState<Record<(typeof PERMISSION_TOGGLES)[number]['key'], boolean>>({
    can_manage_users: false,
    can_manage_stores: false,
    can_manage_items: false,
    can_manage_ck_prices: false,
    can_review_closings: false,
    can_export_reports: false,
  })
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [primaryStoreId, setPrimaryStoreId] = useState<string | null>(null)

  const isOwner = form.role === '老闆'

  function toggleStore(id: string) {
    setSelectedStores(prev => {
      const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
      if (primaryStoreId && !next.includes(primaryStoreId)) setPrimaryStoreId(null)
      return next
    })
  }

  function handleClose() {
    setOpen(false)
    setForm({ name: '', account: '', password: '', role: '店長', title: '', employee_id: '' })
    setIsHQ(false)
    setPermissions({
      can_manage_users: false,
      can_manage_stores: false,
      can_manage_items: false,
      can_manage_ck_prices: false,
      can_review_closings: false,
      can_export_reports: false,
    })
    setSelectedStores([])
    setPrimaryStoreId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.account || !form.password) { toast.error('請填寫所有必填欄位'); return }
    if (!isOwner && selectedStores.length === 0) { toast.error('請至少選擇一家店'); return }
    setLoading(true)
    const result = await createUser({
      name: form.name,
      account: form.account,
      password: form.password,
      role: form.role,
      title: form.title || undefined,
      employee_id: form.employee_id || undefined,
      is_hq: isOwner ? true : isHQ,
      ...permissions,
      store_ids: isOwner ? [] : selectedStores,
      primary_store_id: isOwner ? null : primaryStoreId,
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>系統角色</label>
                  <select style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                    value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>顯示職稱</label>
                  <input style={INPUT_STYLE} placeholder="如：廠長、營運總監"
                    value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
                </div>
              </div>

              {isOwner && (
                <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#b45309' }}>
                  老闆自動擁有全部店面及總公司後台存取權限
                </div>
              )}

              {!isOwner && (
                <div className="flex items-center justify-between rounded-xl px-3 py-3"
                  style={{ border: '1px solid #f4f4f5', background: '#fafafa' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#18181b' }}>總公司後台存取</p>
                    <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>開啟後可進入總公司後台管理頁面</p>
                  </div>
                  <button type="button" onClick={() => setIsHQ(v => !v)}
                    style={{
                      position: 'relative', width: '36px', height: '20px', borderRadius: '10px', flexShrink: 0,
                      background: isHQ ? '#F59E0B' : '#d4d4d8', border: 'none', cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}>
                    <span style={{
                      position: 'absolute', top: '2px', left: '2px', width: '16px', height: '16px',
                      background: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      transform: isHQ ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.2s',
                    }} />
                  </button>
                </div>
              )}

              {!isOwner && (
                <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid #f4f4f5', background: '#fafafa' }}>
                  <p className="text-xs font-bold" style={{ color: '#52525b' }}>功能權限</p>
                  {PERMISSION_TOGGLES.map(item => (
                    <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2" style={{ border: '1px solid #f4f4f5' }}>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: '#18181b' }}>{item.label}</p>
                        <p className="text-[10px]" style={{ color: '#a1a1aa' }}>{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPermissions(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                        style={{
                          position: 'relative', width: '36px', height: '20px', borderRadius: '10px', flexShrink: 0,
                          background: permissions[item.key] ? '#F59E0B' : '#d4d4d8', border: 'none', cursor: 'pointer',
                          transition: 'background 0.2s',
                        }}>
                        <span style={{
                          position: 'absolute', top: '2px', left: '2px', width: '16px', height: '16px',
                          background: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          transform: permissions[item.key] ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.2s',
                        }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!isOwner && (
                <div>
                  <label className="block text-xs font-semibold mb-2" style={{ color: '#52525b' }}>指派店家（可多選）</label>
                  {(['店面', '央廚'] as const).map(type => {
                    const group = stores.filter(s => (s.type ?? '店面') === type)
                    if (group.length === 0) return null
                    return (
                      <div key={type} className="mb-3">
                        <p className="text-[10px] font-semibold mb-1.5 uppercase tracking-wide" style={{ color: '#a1a1aa' }}>{type}</p>
                        <div className="flex flex-wrap gap-2">
                          {group.map(s => (
                            <button key={s.id} type="button" onClick={() => toggleStore(s.id)}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold"
                              style={{
                                background: selectedStores.includes(s.id) ? 'linear-gradient(135deg,#F59E0B,#F97316)' : 'white',
                                color: selectedStores.includes(s.id) ? 'white' : '#52525b',
                                border: selectedStores.includes(s.id) ? 'none' : '1px solid #e4e4e7',
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

                  {/* 主店（所屬店面）— 限定從已勾選店家中選 */}
                  {selectedStores.length > 0 && (
                    <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: '#1e40af' }}>
                        主要所屬店面（登入時預設）
                      </label>
                      <select
                        value={primaryStoreId ?? ''}
                        onChange={e => setPrimaryStoreId(e.target.value || null)}
                        style={{ ...INPUT_STYLE, cursor: 'pointer', background: 'white' }}>
                        <option value="">— 未指定（使用第一家） —</option>
                        {selectedStores.map(id => {
                          const s = stores.find(x => x.id === id)
                          if (!s) return null
                          return <option key={id} value={id}>{s.name}</option>
                        })}
                      </select>
                      <p className="text-[10px] mt-1.5" style={{ color: '#1e40af' }}>
                        多店管理人員登入時會先進到此店；其他店仍可切換。
                      </p>
                    </div>
                  )}
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
