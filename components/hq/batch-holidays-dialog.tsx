'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarDays, Check, Loader2, X } from 'lucide-react'
import { addBatchStoreHolidays } from '@/app/actions/store-holidays'

interface StoreOption { id: string; name: string }

type Scope = 'store' | 'ck' | 'all'

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  border: '1.5px solid #e4e4e7',
  borderRadius: 10,
  fontSize: 14,
  background: 'white',
  outline: 'none',
  color: '#18181b',
}

export default function BatchHolidaysDialog({
  stores,
  ckStores,
  date,
  onClose,
}: {
  stores: StoreOption[]
  ckStores: StoreOption[]
  date: string
  onClose: () => void
}) {
  const router = useRouter()
  const [scope, setScope] = useState<Scope>('store')
  const [from, setFrom] = useState(date)
  const [to, setTo] = useState(date)
  const [note, setNote] = useState('颱風')
  const [selectedIds, setSelectedIds] = useState<string[]>(stores.map(s => s.id))
  const [saving, setSaving] = useState(false)

  const options = useMemo(() => {
    if (scope === 'store') return stores
    if (scope === 'ck') return ckStores
    return [...stores, ...ckStores]
  }, [scope, stores, ckStores])

  const allSelected = options.length > 0 && options.every(s => selectedIds.includes(s.id))

  function changeScope(next: Scope) {
    setScope(next)
    if (next === 'store') setSelectedIds(stores.map(s => s.id))
    else if (next === 'ck') setSelectedIds(ckStores.map(s => s.id))
    else setSelectedIds([...stores, ...ckStores].map(s => s.id))
  }

  function toggleAll() {
    if (allSelected) {
      const optionIds = new Set(options.map(s => s.id))
      setSelectedIds(prev => prev.filter(id => !optionIds.has(id)))
      return
    }
    setSelectedIds(prev => [...new Set([...prev, ...options.map(s => s.id)])])
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    setSaving(true)
    const result = await addBatchStoreHolidays(selectedIds, from, to, note)
    setSaving(false)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    toast.success(`已設定 ${result.storeCount} 間，${result.dateCount} 天公休`)
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.42)' }}>
      <div className="w-full max-w-2xl rounded-2xl bg-white overflow-hidden" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.24)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2" style={{ color: '#18181b' }}>
              <CalendarDays className="h-4 w-4" /> 批次公休
            </h2>
            <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>一次設定多間店面或央廚，提醒與帳目中心會自動排除公休日。</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl inline-flex items-center justify-center" style={{ background: '#f4f4f5', color: '#71717a' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 78px)' }}>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['store', `店面 ${stores.length}`],
              ['ck', `央廚 ${ckStores.length}`],
              ['all', `全部 ${stores.length + ckStores.length}`],
            ] as Array<[Scope, string]>).map(([value, label]) => (
              <button key={value} onClick={() => changeScope(value)}
                className="h-10 rounded-xl text-sm font-bold"
                style={scope === value
                  ? { background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: 'white' }
                  : { background: 'white', color: '#52525b', border: '1px solid #e4e4e7' }}>
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>開始日期</label>
              <input type="date" value={from} onChange={e => {
                setFrom(e.target.value)
                if (to < e.target.value) setTo(e.target.value)
              }} style={INPUT_STYLE} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>結束日期</label>
              <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} style={INPUT_STYLE} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>原因</label>
              <input value={note} onChange={e => setNote(e.target.value)}
                placeholder="例：颱風、停水、公司活動"
                style={INPUT_STYLE} />
            </div>
          </div>

          <div className="rounded-2xl p-3 space-y-3" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold" style={{ color: '#18181b' }}>選擇公休店家</p>
                <p className="text-xs" style={{ color: '#a1a1aa' }}>已選 {selectedIds.length} 間</p>
              </div>
              <button onClick={toggleAll} className="px-3 h-9 rounded-xl text-xs font-bold"
                style={{ background: 'white', border: '1px solid #e4e4e7', color: allSelected ? '#dc2626' : '#047857' }}>
                {allSelected ? '取消全選' : '全選'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {options.map(store => {
                const checked = selectedIds.includes(store.id)
                return (
                  <button key={store.id} onClick={() => toggleOne(store.id)}
                    className="h-11 px-3 rounded-xl text-left text-sm font-semibold flex items-center gap-2"
                    style={checked
                      ? { background: '#ecfdf5', color: '#047857', border: '1.5px solid #86efac' }
                      : { background: 'white', color: '#52525b', border: '1px solid #e4e4e7' }}>
                    <span className="h-5 w-5 rounded-full inline-flex items-center justify-center shrink-0"
                      style={{ background: checked ? '#10b981' : '#f4f4f5', color: checked ? 'white' : '#d4d4d8' }}>
                      {checked && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="truncate">{store.name}</span>
                  </button>
                )
              })}
              {options.length === 0 && (
                <p className="text-sm col-span-full py-4 text-center" style={{ color: '#a1a1aa' }}>沒有可選項目</p>
              )}
            </div>
          </div>

          <button onClick={handleSave} disabled={saving || selectedIds.length === 0 || !from || !to}
            className="w-full h-12 rounded-2xl text-sm font-bold text-white inline-flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', opacity: saving || selectedIds.length === 0 || !from || !to ? 0.55 : 1 }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
            套用批次公休
          </button>
        </div>
      </div>
    </div>
  )
}
