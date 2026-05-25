'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, X } from 'lucide-react'
import { createUser } from '@/app/actions/users'

interface Store { id: string; name: string }

const ROLES = ['店長', '副店長', '助理', '顧問', '經理', '總監', '老闆']

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px',
  fontSize: '14px', background: 'white', outline: 'none', fontFamily: 'inherit', color: '#18181b',
}

export default function UserCreateDialog({ stores }: { stores: Store[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: '店長' })
  const [isHQ, setIsHQ] = useState(false)
  const [selectedStores, setSelectedStores] = useState<string[]>([])

  const isOwner = form.role === '老闆'

  function toggleStore(id: string) {
    setSelectedStores(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  function handleClose() {
    setOpen(false)
    setForm({ name: '', email: '', password: '', role: '店長' })
    setIsHQ(false)
    setSelectedStores([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.email || !form.password) { toast.error('請填寫所有必填欄位'); return }
    if (!isOwner && selectedStores.length === 0) { toast.error('請至少選擇一家店'); return }
    setLoading(true)
    const result = await createUser({
      ...form,
      is_hq: isOwner ? true : isHQ,
      store_ids: isOwner ? [] : selectedStores,
    })
    if (result.error) { toast.error('建立失敗：' + result.error) }
    else { toast.success('帳號建立成功！'); handleClose() }
    setLoading(false)
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
        <Plus className="h-4 w-4" /> 新增帳號
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: 'white', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* 彈窗標題 */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
              <h2 className="text-base font-bold" style={{ color: '#18181b' }}>新增使用者帳號</h2>
              <button onClick={handleClose} className="p-1.5 rounded-lg" style={{ color: '#a1a1aa', background: '#f4f4f5' }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

              {/* 姓名 */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>姓名 *</label>
                <input style={INPUT_STYLE} placeholder="王小明"
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>電子郵件 *</label>
                <input type="email" style={INPUT_STYLE} placeholder="user@example.com"
                  value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>

              {/* 密碼 */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>初始密碼 *（8碼以上）</label>
                <input type="password" style={INPUT_STYLE} placeholder="至少 8 個字元"
                  value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
              </div>

              {/* 職務 */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>職務</label>
                <select style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                  value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* 老闆說明 */}
              {isOwner && (
                <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#b45309' }}>
                  老闆自動擁有全部店面及總公司後台存取權限
                </div>
              )}

              {/* 總公司後台開關 */}
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
                      background: isHQ ? '#6366f1' : '#d4d4d8', border: 'none', cursor: 'pointer',
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

              {/* 指派店家 */}
              {!isOwner && (
                <div>
                  <label className="block text-xs font-semibold mb-2" style={{ color: '#52525b' }}>指派店家（可多選）</label>
                  <div className="flex flex-wrap gap-2">
                    {stores.map(s => (
                      <button key={s.id} type="button" onClick={() => toggleStore(s.id)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold"
                        style={{
                          background: selectedStores.includes(s.id) ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'white',
                          color: selectedStores.includes(s.id) ? 'white' : '#52525b',
                          border: selectedStores.includes(s.id) ? 'none' : '1px solid #e4e4e7',
                        }}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                  {selectedStores.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedStores.map(id => {
                        const s = stores.find(x => x.id === id)
                        return (
                          <span key={id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                            style={{ background: '#eef2ff', color: '#4338ca' }}>
                            {s?.name}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => toggleStore(id)} />
                          </span>
                        )
                      })}
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
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', opacity: loading ? 0.7 : 1 }}>
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
