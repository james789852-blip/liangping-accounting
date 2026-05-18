'use client'

import { useState } from 'react'
import { updateStoreSettings } from '@/app/actions/stores'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Plus, X, Loader2, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Store {
  id: string
  name: string
  mode: string
  ichef_uber_linked: boolean
  uber_enabled: boolean
  uber_accounts: string[]
  panda_enabled: boolean
  twpay_enabled: boolean
  online_enabled: boolean
  petty_cash: number
}

interface Props {
  store: Store
  canEdit: boolean
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn('flex items-center gap-2 cursor-pointer', disabled && 'opacity-50 cursor-default')}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative w-9 h-5 rounded-full transition-colors shrink-0',
          checked ? 'bg-blue-500' : 'bg-slate-300'
        )}
      >
        <span className={cn(
          'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0'
        )} />
      </button>
      <span className="text-sm text-slate-700">{label}</span>
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
  const [pandaEnabled, setPandaEnabled] = useState(store.panda_enabled)
  const [twpayEnabled, setTwpayEnabled] = useState(store.twpay_enabled)
  const [onlineEnabled, setOnlineEnabled] = useState(store.online_enabled)
  const [pettyCash, setPettyCash] = useState(store.petty_cash)

  function addAccount() {
    const name = newAccount.trim()
    if (!name) return
    if (uberAccounts.includes(name)) {
      toast.error('帳號名稱已存在')
      return
    }
    setUberAccounts(prev => [...prev, name])
    setNewAccount('')
  }

  function removeAccount(name: string) {
    setUberAccounts(prev => prev.filter(a => a !== name))
  }

  async function handleSave() {
    setSaving(true)
    const result = await updateStoreSettings(store.id, {
      mode,
      ichef_uber_linked: ichefLinked,
      uber_enabled: uberEnabled,
      uber_accounts: uberAccounts,
      panda_enabled: pandaEnabled,
      twpay_enabled: twpayEnabled,
      online_enabled: onlineEnabled,
      petty_cash: pettyCash,
    })
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${store.name} 設定已儲存`)
      setOpen(false)
    }
    setSaving(false)
  }

  const modeLabel: Record<string, string> = {
    ichef: 'iChef',
    handwrite: '手寫菜單',
    mixed: '混合模式',
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* 標題列 */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-900">{store.name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {modeLabel[store.mode] ?? store.mode}
          </span>
          {store.uber_enabled && store.uber_accounts.length > 0 && (
            <span className="text-xs text-slate-400">Uber × {store.uber_accounts.length}</span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {/* 展開內容 */}
      {open && (
        <div className="px-4 pb-4 pt-2 bg-slate-50 border-t border-slate-100 space-y-4">

          {/* 營業模式 */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">營業模式</p>
            <div className="flex gap-2 flex-wrap">
              {(['ichef', 'handwrite', 'mixed'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setMode(m)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                    mode === m
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300',
                    !canEdit && 'opacity-60 cursor-default'
                  )}
                >
                  {modeLabel[m]}
                </button>
              ))}
            </div>
            {mode === 'ichef' && (
              <div className="mt-2">
                <Toggle
                  label="iChef 整合外送平台（總金額含 Uber / 台灣Pay）"
                  checked={ichefLinked}
                  onChange={setIchefLinked}
                  disabled={!canEdit}
                />
                <p className="text-[11px] text-slate-400 mt-1 ml-11">
                  啟用後，結帳時輸入 iChef 總金額，外送平台金額僅供扣除使用
                </p>
              </div>
            )}
          </div>

          {/* Uber 設定 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Uber Eats</p>
              <Toggle label="啟用" checked={uberEnabled} onChange={setUberEnabled} disabled={!canEdit} />
            </div>
            {uberEnabled && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {uberAccounts.map(acc => (
                    <span key={acc} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm text-slate-700">
                      {acc}
                      {canEdit && (
                        <button type="button" onClick={() => removeAccount(acc)} className="text-slate-400 hover:text-red-500 transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="帳號名稱（例：鑫營）"
                      className="h-8 text-sm flex-1"
                      value={newAccount}
                      onChange={e => setNewAccount(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={addAccount}
                      className="flex items-center gap-1 px-3 h-8 rounded-lg bg-blue-50 text-blue-600 text-sm hover:bg-blue-100 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> 新增
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 其他平台 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">其他平台 / 通路</p>
            <div className="space-y-2">
              <Toggle label="熊貓 foodpanda" checked={pandaEnabled} onChange={setPandaEnabled} disabled={!canEdit} />
              <Toggle label="台灣Pay" checked={twpayEnabled} onChange={setTwpayEnabled} disabled={!canEdit} />
              <Toggle label="線上點餐" checked={onlineEnabled} onChange={setOnlineEnabled} disabled={!canEdit} />
            </div>
          </div>

          {/* 零用金 */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">結帳後剩餘零用金</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">$</span>
              <Input
                type="number"
                min="0"
                className="w-32 h-9 text-right tabular-nums"
                value={pettyCash || ''}
                placeholder="0"
                disabled={!canEdit}
                onChange={e => setPettyCash(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* 儲存按鈕 */}
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              儲存設定
            </button>
          )}
        </div>
      )}
    </div>
  )
}
