'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, X } from 'lucide-react'
import { createUser } from '@/app/actions/users'
import { TITLE_OPTIONS, inferSystemRole, isHQTitle } from '@/lib/account-access'

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

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px',
  fontSize: '14px', background: 'white', outline: 'none', fontFamily: 'inherit', color: '#18181b',
}

export default function UserCreateDialog({ stores }: { stores: Store[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', account: '', password: '', role: '店長', title: '店長', employee_id: '',
  })
  const [isHQ, setIsHQ] = useState(false)
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
  const isOwner = inferSystemRole(form.title, form.role) === '老闆'
  const autoHQ = isHQTitle(form.title)

  function toggleStore(id: string) {
    setSelectedStores(prev => {
      const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
      return next
    })
  }

  function handleClose() {
    setOpen(false)
    setForm({ name: '', account: '', password: '', role: '店長', title: '', employee_id: '' })
    setIsHQ(false)
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
    const hqAccess = isOwner || isHQ || autoHQ
    if (!hqAccess && selectedStores.length === 0) { toast.error('請至少開啟一家店的店家權限'); return }
    setLoading(true)
    const result = await createUser({
      name: form.name,
      account: form.account,
      password: form.password,
      role: inferSystemRole(form.title, form.role),
      title: form.title || undefined,
      employee_id: form.employee_id || undefined,
      is_hq: isOwner ? true : (isHQ || autoHQ),
      ...permissions,
      store_ids: isOwner ? [] : selectedStores,
      primary_store_id: isOwner ? null : (selectedStores[0] ?? null),
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
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>職稱</label>
                <input list="account-title-options-create" style={INPUT_STYLE} placeholder="選擇或輸入職稱，例如：店長、財務經理"
                  value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
                <datalist id="account-title-options-create">
                  {TITLE_OPTIONS.map(title => <option key={title} value={title} />)}
                </datalist>
                <p className="text-[10px] mt-1" style={{ color: '#a1a1aa' }}>選擇建議職稱即可，也可以直接新增自訂職稱。</p>
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
                    <p className="text-sm font-semibold" style={{ color: '#18181b' }}>總公司權限</p>
                    <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>開啟後可從店長端返回總公司後台</p>
                  </div>
                  <button type="button" disabled={autoHQ} onClick={() => setIsHQ(v => !v)}
                    style={{
                      position: 'relative', width: '36px', height: '20px', borderRadius: '10px', flexShrink: 0,
                      background: (isHQ || autoHQ) ? '#F59E0B' : '#d4d4d8', border: 'none', cursor: autoHQ ? 'default' : 'pointer',
                      transition: 'background 0.2s',
                    }}>
                    <span style={{
                      position: 'absolute', top: '2px', left: '2px', width: '16px', height: '16px',
                      background: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      transform: (isHQ || autoHQ) ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.2s',
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
                  <label className="block text-xs font-semibold mb-2" style={{ color: '#52525b' }}>店家權限（可切換）</label>
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

                  <p className="text-[10px] mt-2" style={{ color: '#1e40af' }}>
                    勾選的店家就是此帳號可使用、可切換的店家；登入時自動進入第一個勾選的店家。
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
