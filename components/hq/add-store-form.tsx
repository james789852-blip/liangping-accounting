'use client'

import { useState, useTransition } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import { createStore } from '@/app/actions/stores'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function AddStoreForm() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'ichef' | 'handwrite' | 'mixed'>('ichef')
  const [storeType, setStoreType] = useState<'店面' | '央廚'>('店面')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit() {
    if (!name.trim()) { toast.error('請填寫店家名稱'); return }
    startTransition(async () => {
      const r = await createStore(name.trim(), mode, storeType)
      if (r.error) { toast.error(r.error); return }
      toast.success(`${name.trim()} 已建立`)
      setName('')
      setMode('ichef')
      setStoreType('店面')
      setOpen(false)
      router.refresh()
    })
  }

  const modeLabel = { ichef: 'iChef', handwrite: '手寫菜單', mixed: '混合模式' }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all hover:opacity-80"
        style={{ background: 'white', border: '2px dashed #FDE68A', color: '#92400E' }}>
        <Plus className="h-4 w-4" />
        新增店家
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: '2px solid #FDE68A', boxShadow: '0 2px 8px rgba(245,158,11,0.12)' }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: '#18181b' }}>新增店家</p>
        <button onClick={() => { setOpen(false); setName('') }}
          className="p-1 rounded-lg" style={{ color: '#a1a1aa' }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>店家名稱</p>
        <input
          autoFocus
          placeholder="例：鑫營"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          style={{ width: '100%', height: '40px', padding: '0 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', outline: 'none', fontFamily: 'inherit' }}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>店家類型</p>
        <div className="flex gap-2">
          {(['店面', '央廚'] as const).map(t => (
            <button key={t} type="button" onClick={() => setStoreType(t)}
              className="px-3 py-1.5 rounded-xl text-sm font-medium"
              style={{
                background: storeType === t ? 'linear-gradient(135deg,#F59E0B,#F97316)' : 'white',
                color: storeType === t ? 'white' : '#52525b',
                border: storeType === t ? 'none' : '1px solid #e4e4e7',
              }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>營業模式</p>
        <div className="flex gap-2 flex-wrap">
          {(['ichef', 'handwrite', 'mixed'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className="px-3 py-1.5 rounded-xl text-sm font-medium"
              style={{
                background: mode === m ? 'linear-gradient(135deg,#F59E0B,#F97316)' : 'white',
                color: mode === m ? 'white' : '#52525b',
                border: mode === m ? 'none' : '1px solid #e4e4e7',
                boxShadow: mode === m ? '0 2px 8px rgba(245,158,11,0.2)' : 'none',
              }}>
              {modeLabel[m]}
            </button>
          ))}
        </div>
      </div>

      <button onClick={handleSubmit} disabled={pending || !name.trim()}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
        style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', opacity: pending || !name.trim() ? 0.6 : 1, boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        建立店家
      </button>
    </div>
  )
}
