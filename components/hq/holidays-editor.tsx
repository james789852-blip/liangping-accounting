'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { fetchStoreHolidays, addStoreHoliday, deleteStoreHoliday, type Holiday } from '@/app/actions/store-holidays'

export default function HolidaysEditor({
  storeId, storeName, year, monthNum, onClose,
}: {
  storeId: string; storeName: string; year: number; monthNum: number; onClose: () => void
}) {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [newDate, setNewDate] = useState(`${year}-${String(monthNum).padStart(2, '0')}-01`)
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const first = `${year}-${String(monthNum).padStart(2, '0')}-01`
    const lastDay = new Date(year, monthNum, 0).getDate()
    const last = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    fetchStoreHolidays(storeId, first, last)
      .then(r => {
        if ('error' in r) { toast.error(r.error); return }
        setHolidays(r.holidays)
      })
      .finally(() => setLoading(false))
  }, [storeId, year, monthNum])

  async function handleAdd() {
    if (!newDate) return
    setSaving(true)
    const r = await addStoreHoliday(storeId, newDate, newNote)
    setSaving(false)
    if ('error' in r) { toast.error(r.error); return }
    toast.success('已加公休日')
    setHolidays(prev => [...prev, { id: crypto.randomUUID(), store_id: storeId, holiday_date: newDate, note: newNote || null }].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)))
    setNewNote('')
  }

  async function handleDelete(id: string) {
    const r = await deleteStoreHoliday(id)
    if ('error' in r) { toast.error(r.error); return }
    setHolidays(prev => prev.filter(h => h.id !== id))
    toast.success('已移除')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 space-y-3" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: '#18181b' }}>{storeName} · 公休日設定</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs" style={{ color: '#a1a1aa' }}>設定公休日後，「未結帳提醒」與對帳頁會自動排除該日</p>

        <div className="rounded-xl p-3 space-y-2" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
          <p className="text-xs font-semibold" style={{ color: '#52525b' }}>已設定（{holidays.length}）</p>
          {loading && <p className="text-xs" style={{ color: '#a1a1aa' }}>載入中…</p>}
          {!loading && holidays.length === 0 && (
            <p className="text-xs" style={{ color: '#a1a1aa' }}>本月無公休日</p>
          )}
          <ul className="space-y-1">
            {holidays.map(h => (
              <li key={h.id} className="flex items-center gap-2 text-sm">
                <span className="tabular-nums font-semibold" style={{ color: '#6b21a8' }}>{h.holiday_date}</span>
                {h.note && <span className="text-xs" style={{ color: '#52525b' }}>· {h.note}</span>}
                <button onClick={() => handleDelete(h.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl p-3 space-y-2" style={{ background: 'white', border: '1px solid #f4f4f5' }}>
          <p className="text-xs font-semibold" style={{ color: '#52525b' }}>新增公休日</p>
          <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
            style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid #e4e4e7', borderRadius: 8, fontSize: 14, outline: 'none', background: 'white' }} />
          <input value={newNote} onChange={e => setNewNote(e.target.value)}
            placeholder="原因（選填，例：颱風、清明節）"
            style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid #e4e4e7', borderRadius: 8, fontSize: 14, outline: 'none', background: 'white' }} />
          <button onClick={handleAdd} disabled={saving || !newDate}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            新增公休日
          </button>
        </div>
      </div>
    </div>
  )
}
