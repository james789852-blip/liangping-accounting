'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, X, Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import { updateUser, updateUserPassword, deleteUser } from '@/app/actions/users'
import { getTitleOptions, inferSystemRole, type AccountUnitType } from '@/lib/account-access'

interface Store { id: string; name: string; type?: string }
interface UserData {
  user_id: string
  name: string
  role: string
  title?: string | null
  employee_id?: string | null
  account?: string        // 身分證字號（從 auth email 提取）
  store_ids?: string[]
  primary_store_id?: string | null
  is_hq?: boolean
  active?: boolean
  can_manage_users?: boolean
  can_manage_stores?: boolean
  can_manage_store_settings?: boolean
  can_manage_ck_settings?: boolean
  can_manage_items?: boolean
  can_manage_store_items?: boolean
  can_manage_ck_items?: boolean
  can_manage_store_receipts?: boolean
  can_manage_ck_receipts?: boolean
  can_manage_ck_prices?: boolean
  can_review_closings?: boolean
  can_export_reports?: boolean
}

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

export default function UserEditDialog({ user, stores }: { user: UserData; stores: Store[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const initialUnitId = user.role === '老闆' || user.is_hq ? 'hq' : (user.primary_store_id ?? '')
  const initialStore = stores.find(store => store.id === initialUnitId)
  const initialUnitType: AccountUnitType = initialUnitId === 'hq' ? 'hq' : initialStore?.type === '央廚' ? 'ck' : 'store'
  const initialTitle = user.title ?? user.role ?? getTitleOptions(initialUnitType)[0]
  const [unitId, setUnitId] = useState(initialUnitId)
  const [customTitle, setCustomTitle] = useState(!getTitleOptions(initialUnitType).includes(initialTitle))

  const [form, setForm] = useState({
    name: user.name ?? '',
    account: user.account ?? '',
    title: initialTitle,
    employee_id: user.employee_id ?? '',
    active: user.active ?? true,
    can_manage_users: user.can_manage_users ?? false,
    can_manage_store_settings: user.can_manage_store_settings ?? user.can_manage_stores ?? false,
    can_manage_ck_settings: user.can_manage_ck_settings ?? user.can_manage_stores ?? false,
    can_manage_store_items: user.can_manage_store_items ?? user.can_manage_items ?? false,
    can_manage_ck_items: user.can_manage_ck_items ?? user.can_manage_items ?? false,
    can_manage_store_receipts: user.can_manage_store_receipts ?? user.can_manage_items ?? false,
    can_manage_ck_receipts: user.can_manage_ck_receipts ?? user.can_manage_items ?? false,
    can_manage_ck_prices: user.can_manage_ck_prices ?? false,
    can_review_closings: user.can_review_closings ?? false,
    can_export_reports: user.can_export_reports ?? false,
  })
  const [selectedStores, setSelectedStores] = useState<string[]>(
    [...new Set(user.store_ids ?? [])]
  )
  const primaryStore = stores.find(store => store.id === unitId)
  const unitType: AccountUnitType = unitId === 'hq' ? 'hq' : primaryStore?.type === '央廚' ? 'ck' : 'store'
  const titleOptions = getTitleOptions(unitType)
  const isHQ = unitType === 'hq'
  const isOwner = isHQ && inferSystemRole(form.title, titleOptions[0]) === '老闆'
  const allSelected = stores.length > 0 && stores.every(s => selectedStores.includes(s.id))

  function toggleStore(id: string) {
    setSelectedStores(prev => {
      const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
      return next
    })
  }

  function toggleAllStores() {
    if (allSelected) {
      setSelectedStores([])
    } else {
      setSelectedStores(stores.map(s => s.id))
    }
  }

  function handleClose() {
    setOpen(false)
    setNewPassword('')
    setConfirmDelete(false)
    setShowPw(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('請填寫姓名'); return }
    if (!unitId) { toast.error('請選擇歸屬單位'); return }
    if (!form.title.trim()) { toast.error('請選擇或新增職稱'); return }
    setLoading(true)

    const accountChanged = form.account.trim().toUpperCase() !== (user.account ?? '')
    const result = await updateUser(user.user_id, {
      name: form.name,
      ...(accountChanged && { account: form.account }),
      role: inferSystemRole(form.title, titleOptions[0]),
      title: form.title || undefined,
      employee_id: form.employee_id || undefined,
      store_ids: isOwner ? [] : [...new Set([...(primaryStore ? [primaryStore.id] : []), ...selectedStores])],
      primary_store_id: primaryStore?.id ?? null,
      is_hq: isHQ,
      can_manage_users: isOwner ? true : (isHQ && form.can_manage_users),
      can_manage_store_settings: isOwner ? true : (isHQ && form.can_manage_store_settings),
      can_manage_ck_settings: isOwner ? true : (isHQ && form.can_manage_ck_settings),
      can_manage_store_items: isOwner ? true : (isHQ && form.can_manage_store_items),
      can_manage_ck_items: isOwner ? true : (isHQ && form.can_manage_ck_items),
      can_manage_store_receipts: isOwner ? true : (isHQ && form.can_manage_store_receipts),
      can_manage_ck_receipts: isOwner ? true : (isHQ && form.can_manage_ck_receipts),
      can_manage_ck_prices: isOwner ? true : (isHQ && form.can_manage_ck_prices),
      can_review_closings: isOwner ? true : (isHQ && form.can_review_closings),
      can_export_reports: isOwner ? true : (isHQ && form.can_export_reports),
      active: form.active,
    })
    if (result.error) toast.error('更新失敗：' + result.error)
    else { toast.success('帳號資料已更新'); handleClose() }
    setLoading(false)
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!newPassword.trim()) { toast.error('請輸入新密碼'); return }
    setPwLoading(true)
    const result = await updateUserPassword(user.user_id, newPassword)
    if (result.error) toast.error('密碼更新失敗：' + result.error)
    else { toast.success('密碼已更新'); setNewPassword('') }
    setPwLoading(false)
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleteLoading(true)
    const result = await deleteUser(user.user_id)
    if (result.error) toast.error('刪除失敗：' + result.error)
    else { toast.success(`${user.name} 帳號已刪除`); handleClose() }
    setDeleteLoading(false)
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
        style={{ color: '#71717a' }}>
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: 'white', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
              <h2 className="text-base font-bold" style={{ color: '#18181b' }}>編輯帳號：{user.name}</h2>
              <button onClick={handleClose} className="p-1.5 rounded-lg" style={{ color: '#a1a1aa', background: '#f4f4f5' }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

              {/* 姓名 + 序號 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>姓名 *</label>
                  <input style={INPUT_STYLE} value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>序號</label>
                  <input style={INPUT_STYLE} placeholder="tw0030001"
                    value={form.employee_id}
                    onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))} />
                </div>
              </div>

              {/* 帳號（身分證字號） */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>帳號（身分證字號）</label>
                <input
                  style={{ ...INPUT_STYLE, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'monospace' }}
                  placeholder="A123456789"
                  value={form.account}
                  onChange={e => setForm(p => ({ ...p, account: e.target.value.toUpperCase() }))}
                />
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
                  {!unitId && <option value="">請選擇歸屬單位</option>}
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

              <div className="flex items-center justify-between rounded-xl px-3 py-2.5"
                style={{ border: '1px solid #f4f4f5', background: '#fafafa' }}>
                <span className="text-sm font-semibold" style={{ color: '#18181b' }}>帳號啟用</span>
                <button type="button" onClick={() => setForm(p => ({ ...p, active: !p.active }))}
                  className="h-5 w-9 rounded-full p-0.5" style={{ background: form.active ? '#22c55e' : '#d4d4d8' }}>
                  <span className="block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: form.active ? 'translateX(16px)' : 'translateX(0)' }} />
                </button>
              </div>

              {/* 功能權限 */}
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
                            <button type="button" onClick={() => setForm(p => ({ ...p, [item.key]: !p[item.key] }))}
                              className="h-5 w-9 rounded-full p-0.5 shrink-0" style={{ background: form[item.key] ? '#F59E0B' : '#d4d4d8' }}>
                              <span className="block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: form[item.key] ? 'translateX(16px)' : 'translateX(0)' }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 店家權限 */}
              {!isOwner && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold" style={{ color: '#52525b' }}>其他店家權限（可切換）</label>
                    <button type="button" onClick={toggleAllStores}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                      style={{
                        background: allSelected ? '#FFFBEB' : 'white',
                        color: allSelected ? '#92400E' : '#52525b',
                        border: `1px solid ${allSelected ? '#FDE68A' : '#e4e4e7'}`,
                      }}>
                      {allSelected ? '全部取消' : '全部店家'}
                    </button>
                  </div>
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
                    <p className="text-xs mt-1.5" style={{ color: '#a1a1aa' }}>
                      已選 {selectedStores.length} 間
                    </p>
                  )}

                  <p className="text-[10px] mt-2" style={{ color: '#1e40af' }}>
                    歸屬單位是主店面；這裡只設定可額外切換的其他店家，不會改變人員分類。
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={handleClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
                  取消
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', opacity: loading ? 0.7 : 1 }}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  儲存變更
                </button>
              </div>
            </form>

            {/* 密碼管理 */}
            <div className="px-5 pb-3">
              <div className="rounded-xl p-3.5" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
                <p className="text-xs font-semibold mb-2.5" style={{ color: '#52525b' }}>修改密碼</p>
                <p className="text-[11px] mb-2" style={{ color: '#a1a1aa' }}>
                  現有密碼因安全機制無法查看，請直接輸入新密碼後按更新。
                </p>
                <form onSubmit={handleResetPassword} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPw ? 'text' : 'password'}
                      style={{ ...INPUT_STYLE, paddingRight: '36px' }}
                      placeholder="新密碼（出生年月日 YYMMDD）"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2"
                      style={{ color: '#a1a1aa' }}>
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button type="submit" disabled={pwLoading}
                    className="px-3 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-1 shrink-0"
                    style={{ background: '#F59E0B', opacity: pwLoading ? 0.7 : 1 }}>
                    {pwLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '更新'}
                  </button>
                </form>
              </div>
            </div>

            {/* 刪除帳號 */}
            <div className="px-5 pb-5">
              {!confirmDelete ? (
                <button type="button" onClick={handleDelete}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ border: '1px solid #fca5a5', color: '#dc2626', background: 'white' }}>
                  <Trash2 className="h-3.5 w-3.5" />
                  刪除帳號
                </button>
              ) : (
                <div className="rounded-xl p-3" style={{ background: '#fff1f2', border: '1px solid #fca5a5' }}>
                  <p className="text-xs font-semibold text-center mb-2.5" style={{ color: '#dc2626' }}>
                    確定要刪除「{user.name}」的帳號？此操作無法復原。
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold"
                      style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
                      取消
                    </button>
                    <button type="button" onClick={handleDelete} disabled={deleteLoading}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1"
                      style={{ background: '#dc2626', opacity: deleteLoading ? 0.7 : 1 }}>
                      {deleteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      確認刪除
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  )
}
