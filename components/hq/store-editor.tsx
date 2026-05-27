'use client'

import { useState, useRef, useEffect } from 'react'
import { updateStoreSettings } from '@/app/actions/stores'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Plus, X, Loader2, Check, FileSpreadsheet, Upload, Trash2 } from 'lucide-react'

interface Store {
  id: string; name: string; mode: string; ichef_uber_linked: boolean
  uber_enabled: boolean; uber_accounts: string[]; panda_enabled: boolean
  twpay_enabled: boolean; online_enabled: boolean; petty_cash: number
}

interface Props { store: Store; canEdit: boolean }

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <button
        type="button" disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          position: 'relative', width: '36px', height: '20px', borderRadius: '10px', flexShrink: 0,
          background: checked ? '#6366f1' : '#d4d4d8', border: 'none', cursor: disabled ? 'default' : 'pointer',
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

export default function StoreEditor({ store, canEdit }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
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

  // Excel template state
  type TemplateStatus = { exists: boolean; counts?: { 食材: number; 耗材: number; 雜項: number } }
  const [templateStatus, setTemplateStatus] = useState<TemplateStatus | null>(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const templateFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (templateStatus !== null) return
    fetch(`/api/stores/${store.id}/excel-template`)
      .then(r => r.json())
      .then(d => setTemplateStatus(d))
      .catch(() => setTemplateStatus({ exists: false }))
  }, [open, store.id, templateStatus])

  async function handleTemplateUpload(file: File) {
    setTemplateLoading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`/api/stores/${store.id}/excel-template`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) { toast.error(`上傳失敗：${data.error}`); return }
      setTemplateStatus({ exists: true, counts: data.counts })
      toast.success(`模板已上傳，共解析 ${data.counts.食材 + data.counts.耗材 + data.counts.雜項} 個品項欄`)
    } finally {
      setTemplateLoading(false)
    }
  }

  async function handleTemplateDelete() {
    if (!confirm('確定要移除此店的 Excel 模板嗎？')) return
    setTemplateLoading(true)
    try {
      await fetch(`/api/stores/${store.id}/excel-template`, { method: 'DELETE' })
      setTemplateStatus({ exists: false })
      toast.success('模板已移除')
    } finally {
      setTemplateLoading(false)
    }
  }

  function addAccount() {
    const name = newAccount.trim()
    if (!name) return
    if (uberAccounts.includes(name)) { toast.error('帳號名稱已存在'); return }
    setUberAccounts(prev => [...prev, name])
    setNewAccount('')
  }

  async function handleSave() {
    setSaving(true)
    const result = await updateStoreSettings(store.id, {
      mode, ichef_uber_linked: ichefLinked, uber_enabled: uberEnabled, uber_accounts: uberAccounts,
      panda_enabled: pandaEnabled, twpay_enabled: twpayEnabled, online_enabled: onlineEnabled, petty_cash: pettyCash,
    })
    if (result.error) { toast.error(result.error) }
    else { toast.success(`${store.name} 設定已儲存`); setOpen(false) }
    setSaving(false)
  }

  const modeLabel: Record<string, string> = { ichef: 'iChef', handwrite: '手寫菜單', mixed: '混合模式' }

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            {store.name.slice(0, 2)}
          </div>
          <div>
            <p className="text-sm font-semibold text-left" style={{ color: '#18181b' }}>{store.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#f4f4f5', color: '#71717a' }}>
                {modeLabel[store.mode] ?? store.mode}
              </span>
              {store.uber_enabled && store.uber_accounts.length > 0 && (
                <span className="text-xs" style={{ color: '#a1a1aa' }}>Uber × {store.uber_accounts.length}</span>
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

          {/* 營業模式 */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>營業模式</p>
            <div className="flex gap-2 flex-wrap">
              {(['ichef', 'handwrite', 'mixed'] as const).map(m => (
                <button key={m} type="button" disabled={!canEdit} onClick={() => setMode(m)}
                  className="px-3 py-1.5 rounded-xl text-sm font-medium"
                  style={{
                    background: mode === m ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'white',
                    color: mode === m ? 'white' : '#52525b',
                    border: mode === m ? 'none' : '1px solid #e4e4e7',
                    opacity: !canEdit ? 0.6 : 1,
                    boxShadow: mode === m ? '0 2px 8px rgba(99,102,241,0.25)' : 'none',
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
                      style={{ background: '#eef2ff', color: '#4338ca', border: '1px solid #e0e7ff' }}>
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
                      style={{ background: '#eef2ff', color: '#4338ca', border: '1px solid #e0e7ff' }}>
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

          {/* Excel 匯出模板 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5" style={{ color: '#a1a1aa' }} />
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>Excel 匯出模板</p>
            </div>
            <input ref={templateFileRef} type="file" accept=".xlsx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleTemplateUpload(f); e.target.value = '' }} />
            {templateStatus === null ? (
              <p className="text-xs" style={{ color: '#a1a1aa' }}>載入中…</p>
            ) : templateStatus.exists && templateStatus.counts ? (
              <div className="rounded-xl p-3 space-y-2" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold" style={{ color: '#15803d' }}>✓ 已上傳模板</p>
                  {templateLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: '#a1a1aa' }} />
                    : canEdit && (
                      <button onClick={handleTemplateDelete} className="p-1 rounded-lg" style={{ color: '#dc2626', background: '#fee2e2' }}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                </div>
                <div className="flex gap-3">
                  {(['食材', '耗材', '雜項'] as const).map(cat => (
                    <div key={cat} className="flex items-center gap-1">
                      <span className="text-[11px]" style={{ color: '#52525b' }}>{cat}</span>
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: '#15803d' }}>{templateStatus.counts![cat]}</span>
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <button onClick={() => templateFileRef.current?.click()} disabled={templateLoading}
                    className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#6366f1' }}>
                    <Upload className="h-3 w-3" /> 重新上傳
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl p-3" style={{ background: '#fafafa', border: '1.5px dashed #e4e4e7' }}>
                <p className="text-xs mb-2" style={{ color: '#71717a' }}>上傳 .xlsx 模板，匯出時自動套用此店的欄位格式</p>
                {canEdit && (
                  <button onClick={() => templateFileRef.current?.click()} disabled={templateLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: '#eef2ff', color: '#4338ca', border: '1px solid #e0e7ff' }}>
                    {templateLoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Upload className="h-3.5 w-3.5" />}
                    選擇模板檔案
                  </button>
                )}
              </div>
            )}
          </div>

          {canEdit && (
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              儲存設定
            </button>
          )}
        </div>
      )}
    </div>
  )
}
