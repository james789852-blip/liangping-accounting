'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckSquare, Loader2, CheckCircle2 } from 'lucide-react'
import ReviewCard from './review-card'
import { verifyClosingsBatch } from '@/app/actions/closings'

interface Closing {
  id: string
  business_date: string
  status: string
  total_revenue: number
  variance: number
  note: string
  dispute_note: string
  submitted_at: string
  should_include_delivery: number
  actual_remit: number
  total_cost: number
  total_expenses: number
  stores: { id?: string; name: string }
  revenue_items: any[]
  expense_items: any[]
  order_items: any[]
  remittance_adjustments?: any[]
  reserve_items?: any[]
}

interface Props {
  pending: Closing[]
  receiptsByClosing: Record<string, any[]>
  canReview: boolean
  canDispute: boolean
}

type FilterKey = 'all' | 'variance' | 'disputed' | { type: 'store'; name: string }

export default function ReviewsList({ pending, receiptsByClosing, canReview, canDispute }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [batchPending, startBatch] = useTransition()
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const stores = useMemo(() => {
    const seen = new Set<string>()
    const arr: string[] = []
    for (const c of pending) {
      const n = c.stores?.name
      if (n && !seen.has(n)) { seen.add(n); arr.push(n) }
    }
    return arr
  }, [pending])

  const visible = useMemo(() => {
    let arr = pending.filter(c => !doneIds.has(c.id))
    if (filter === 'variance') arr = arr.filter(c => c.variance !== 0)
    else if (filter === 'disputed') arr = arr.filter(c => c.status === 'disputed')
    else if (typeof filter === 'object' && filter.type === 'store') {
      arr = arr.filter(c => c.stores?.name === filter.name)
    }
    return arr
  }, [pending, doneIds, filter])

  const remainingCount = pending.length - doneIds.size
  const varianceCount = pending.filter(c => !doneIds.has(c.id) && c.variance !== 0).length
  const disputedCount = pending.filter(c => !doneIds.has(c.id) && c.status === 'disputed').length

  // 找下一張未處理的卡，並 smooth scroll 過去
  function scrollToNext(currentId: string) {
    const ids = visible.map(c => c.id)
    const idx = ids.indexOf(currentId)
    // 候選：當前後面 → 當前前面（如果後面沒了）
    const candidates = [...ids.slice(idx + 1), ...ids.slice(0, idx).reverse()]
    const nextId = candidates.find(id => id !== currentId && !doneIds.has(id))
    if (!nextId) return
    const el = cardRefs.current[nextId]
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }
  }

  function handleProcessed(id: string) {
    setSelected(prev => {
      if (!prev.has(id)) return prev
      const n = new Set(prev); n.delete(id); return n
    })
    // 等卡片消失動畫之後再 scroll，避免 layout shift
    setTimeout(() => scrollToNext(id), 60)
    setDoneIds(prev => new Set(prev).add(id))
    router.refresh()
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function handleBatchVerify() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    startBatch(async () => {
      const r = await verifyClosingsBatch(ids)
      if ('error' in r && r.error) {
        toast.error(r.error)
        return
      }
      const verified = (r as { verified: number }).verified ?? ids.length
      toast.success(`已核准 ${verified} 筆`)
      setDoneIds(prev => {
        const n = new Set(prev)
        ids.forEach(i => n.add(i))
        return n
      })
      setSelected(new Set())
      router.refresh()
    })
  }

  if (remainingCount === 0) {
    return (
      <div className="text-center py-10 rounded-2xl" style={{ background: 'white', border: '1px solid #f4f4f5', color: '#a1a1aa' }}>
        <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">目前無待審核帳目</p>
      </div>
    )
  }

  const filterIsAll = filter === 'all'
  const filterIsVar = filter === 'variance'
  const filterIsDis = filter === 'disputed'
  const filterStore = typeof filter === 'object' && filter.type === 'store' ? filter.name : null

  return (
    <div className="space-y-3">

      {/* sticky 篩選 + 批次工具列 */}
      <div className="sticky z-10 -mx-4 px-4 py-2 backdrop-blur-md"
        style={{ top: 0, background: 'rgba(250,250,250,0.92)', borderBottom: '1px solid #f4f4f5' }}>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1" style={{ scrollbarWidth: 'none' }}>
          <Chip active={filterIsAll} onClick={() => setFilter('all')}>全部 {remainingCount}</Chip>
          {varianceCount > 0 && (
            <Chip active={filterIsVar} onClick={() => setFilter('variance')} tone="amber">有誤差 {varianceCount}</Chip>
          )}
          {disputedCount > 0 && (
            <Chip active={filterIsDis} onClick={() => setFilter('disputed')} tone="rose">異議退回 {disputedCount}</Chip>
          )}
          {stores.map(s => (
            <Chip key={s} active={filterStore === s} onClick={() => setFilter({ type: 'store', name: s })}>{s}</Chip>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="flex items-center justify-between gap-2 mt-2 px-3 py-2 rounded-xl"
            style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
            <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#047857' }}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              已勾選 {selected.size} 筆
            </span>
            <div className="flex gap-1.5">
              <button onClick={() => setSelected(new Set())}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                style={{ background: 'white', border: '1px solid #d1fae5', color: '#52525b' }}>
                取消
              </button>
              <button disabled={batchPending} onClick={handleBatchVerify}
                className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold flex items-center gap-1.5"
                style={{ background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 2px 8px rgba(16,185,129,0.25)', opacity: batchPending ? 0.5 : 1 }}>
                {batchPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                批次核准
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 卡片清單 */}
      {visible.length === 0 ? (
        <div className="text-center py-8 rounded-2xl text-sm" style={{ background: 'white', border: '1px solid #f4f4f5', color: '#a1a1aa' }}>
          此篩選條件下無資料
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(c => (
            <div key={c.id} ref={el => { cardRefs.current[c.id] = el }}>
              <ReviewCard
                closing={c as any}
                receipts={receiptsByClosing[c.id] ?? []}
                canReview={canReview}
                canDispute={canDispute}
                selected={selected.has(c.id)}
                onToggleSelect={() => toggleSelect(c.id)}
                onProcessed={() => handleProcessed(c.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({
  active, onClick, children, tone,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode
  tone?: 'amber' | 'rose'
}) {
  const palette = active
    ? tone === 'amber' ? { bg: '#f59e0b', color: 'white', border: '#f59e0b' }
      : tone === 'rose' ? { bg: '#f43f5e', color: 'white', border: '#f43f5e' }
      : { bg: '#18181b', color: 'white', border: '#18181b' }
    : { bg: 'white', color: '#52525b', border: '#e4e4e7' }
  return (
    <button onClick={onClick}
      className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors"
      style={{ background: palette.bg, color: palette.color, border: `1px solid ${palette.border}` }}>
      {children}
    </button>
  )
}
