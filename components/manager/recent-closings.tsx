'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ChevronRight, Trash2, Loader2, X } from 'lucide-react'
import { deleteClosingDraft } from '@/app/actions/closings'
import { toast } from 'sonner'

const WEEKDAY: Record<number, string> = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' }

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

interface Closing {
  id: string
  business_date: string
  status: string
  total_revenue: number
  variance: number | null
}

function DeleteButton({ closingId, onDeleted }: { closingId: string; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      const r = await deleteClosingDraft(closingId)
      if ('error' in r && r.error) {
        toast.error(r.error)
      } else {
        toast.success('草稿已刪除')
        onDeleted()
      }
      setConfirm(false)
    })
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-1.5" onClick={e => { e.preventDefault(); e.stopPropagation() }}>
        <span className="text-xs font-medium" style={{ color: '#be123c' }}>確認刪除？</span>
        <button
          disabled={pending}
          onClick={handleDelete}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-white"
          style={{ background: '#dc2626', opacity: pending ? 0.6 : 1 }}>
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : '刪除'}
        </button>
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirm(false) }}
          className="p-1 rounded-lg"
          style={{ background: '#f4f4f5' }}>
          <X className="h-3 w-3" style={{ color: '#71717a' }} />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirm(true) }}
      className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
      title="刪除草稿"
      style={{ color: '#d4d4d8' }}>
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

export default function RecentClosingsList({ closings: initial }: { closings: Closing[] }) {
  const [closings, setClosings] = useState(initial)

  return (
    <div className="flex flex-col gap-2 p-3">
      {closings.map(c => {
        const d = new Date(c.business_date + 'T00:00:00')
        const mo = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        const ww = `星期${WEEKDAY[d.getDay()]}`
        const varAbs = Math.abs(c.variance ?? 0)
        const varOk = varAbs === 0
        const varColor = varOk ? '#10b981' : varAbs <= 200 ? '#f59e0b' : '#f43f5e'
        const isDraft = c.status === 'draft'
        const desc = c.status === 'verified'
          ? (varOk ? '已對帳' : `誤差 ${(c.variance ?? 0) > 0 ? '+' : ''}${fmt(c.variance ?? 0)}`)
          : c.status === 'submitted' ? '待審核'
          : c.status === 'disputed' ? '異議退回'
          : '草稿未送'

        const isDisputed = c.status === 'disputed'
        return (
          <Link key={c.id} href={`/manager/history/${c.id}`}
            className="grid items-center rounded-xl px-4 py-3.5 transition-colors hover:bg-slate-50"
            style={{
              gridTemplateColumns: '80px 1fr auto 110px 28px', gap: '14px', fontSize: '13px',
              background: isDisputed ? '#FEF2F2' : 'transparent',
              border: isDisputed ? '1.5px solid #FCA5A5' : '1px solid #f4f4f5',
              boxShadow: isDisputed ? '0 1px 6px rgba(244,63,94,0.18)' : 'none',
            }}>

            <div>
              <p style={{ fontWeight: 700, color: isDisputed ? '#991B1B' : '#18181b' }}>{mo}/{dd}</p>
              <p style={{ color: isDisputed ? '#B91C1C' : '#a1a1aa', fontSize: '12px' }}>{ww}</p>
            </div>

            <div>
              {isDisputed ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold"
                  style={{ background: '#DC2626', color: 'white' }}>
                  ⚠ 異議退回．請點開修正
                </span>
              ) : (
                <span style={{ color: '#52525b' }}>{desc}</span>
              )}
            </div>

            <div onClick={e => e.preventDefault()}>
              {isDraft && (
                <DeleteButton
                  closingId={c.id}
                  onDeleted={() => setClosings(prev => prev.filter(x => x.id !== c.id))}
                />
              )}
            </div>

            <p style={{ fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: isDisputed ? '#991B1B' : '#18181b' }}>
              {c.total_revenue > 0 ? `$${fmt(c.total_revenue)}` : '—'}
            </p>

            <p style={{ fontWeight: 600, fontSize: '12px', textAlign: 'right', color: isDisputed ? '#DC2626' : varColor, fontVariantNumeric: 'tabular-nums' }}>
              {varOk ? '✓ $0' : `${(c.variance ?? 0) >= 0 ? '+' : ''}${fmt(c.variance ?? 0)}`}
            </p>

            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: isDisputed ? '#DC2626' : '#e4e4e7' }} />
          </Link>
        )
      })}
    </div>
  )
}
