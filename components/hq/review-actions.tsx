'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { verifyClosing, disputeClosing, deleteClosing } from '@/app/actions/closings'
import { CheckCircle, RotateCcw, Loader2, X, Trash2 } from 'lucide-react'

interface Props {
  closingId: string
  currentStatus: string
  onProcessed?: () => void
  hideVerify?: boolean
}

export default function ReviewActions({ closingId, currentStatus, onProcessed, hideVerify = false }: Props) {
  const [loading, setLoading] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [note, setNote] = useState('')
  const [done, setDone] = useState(false)
  const canVerify = currentStatus === 'submitted' || currentStatus === 'disputed'
  const canDispute = currentStatus === 'submitted' || currentStatus === 'verified' || currentStatus === 'disputed'

  if (done) return null

  async function handleVerify() {
    setLoading(true)
    const result = await verifyClosing(closingId)
    if (result.error) { toast.error(result.error) }
    else { toast.success('已核准'); setDone(true); onProcessed?.() }
    setLoading(false)
  }

  async function handleDelete() {
    setLoading(true)
    const result = await deleteClosing(closingId)
    if (result.error) { toast.error(result.error) }
    else { toast.success('帳目已刪除，店長可重新填寫'); setDone(true); onProcessed?.() }
    setLoading(false)
  }

  async function handleDispute() {
    setLoading(true)
    const result = await disputeClosing(closingId, note)
    if (result.error) { toast.error(result.error) }
    else { toast.success('已退回修改'); setDone(true); onProcessed?.() }
    setLoading(false)
  }

  if (showDisputeForm) {
    return (
      <div className="space-y-2 p-3 rounded-xl" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold" style={{ color: '#c2410c' }}>退回原因（選填）</p>
          <button type="button" onClick={() => { setShowDisputeForm(false); setNote('') }}>
            <X className="h-3.5 w-3.5" style={{ color: '#a1a1aa' }} />
          </button>
        </div>
        <textarea
          placeholder="可選填異常原因，店長看到後會依此修正..."
          style={{ width: '100%', fontSize: '13px', border: '1.5px solid #fed7aa', borderRadius: '8px', padding: '8px 10px', height: '72px', resize: 'none', outline: 'none', fontFamily: 'inherit', background: 'white' }}
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <div className="flex gap-2">
          <button type="button" disabled={loading} onClick={handleDispute}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
            style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', opacity: loading ? 0.5 : 1 }}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            確認退回
          </button>
          <button type="button" onClick={() => { setShowDisputeForm(false); setNote('') }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
            取消
          </button>
        </div>
      </div>
    )
  }

  if (showDeleteConfirm) {
    return (
      <div className="space-y-2 p-3 rounded-xl" style={{ background: '#fff8f8', border: '1px solid #fda4af' }}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold" style={{ color: '#be123c' }}>確認刪除此帳目？</p>
          <button type="button" onClick={() => setShowDeleteConfirm(false)}>
            <X className="h-3.5 w-3.5" style={{ color: '#a1a1aa' }} />
          </button>
        </div>
        <p className="text-xs" style={{ color: '#be123c' }}>刪除後無法復原，所有帳目資料將一併清除，店長可重新填寫。</p>
        <div className="flex gap-2">
          <button type="button" disabled={loading} onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
            style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', opacity: loading ? 0.5 : 1 }}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            確認刪除
          </button>
          <button type="button" onClick={() => setShowDeleteConfirm(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
            取消
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {canVerify && !hideVerify && (
        <button type="button" disabled={loading} onClick={handleVerify}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
          style={{ background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 2px 8px rgba(16,185,129,0.25)', opacity: loading ? 0.5 : 1 }}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
          {currentStatus === 'disputed' ? '重新核准' : '核准'}
        </button>
      )}
      {canDispute && (
        <button type="button" disabled={loading} onClick={() => setShowDisputeForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
          <RotateCcw className="h-3.5 w-3.5" />
          {currentStatus === 'verified' ? '重新退回修改' : currentStatus === 'disputed' ? '再次退回修改' : '退回修改'}
        </button>
      )}
      <button type="button" disabled={loading} onClick={() => setShowDeleteConfirm(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: '#fff8f8', color: '#be123c', border: '1px solid #fecdd3' }}>
        <Trash2 className="h-3.5 w-3.5" />
        刪除帳目
      </button>
    </div>
  )
}
