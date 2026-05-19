'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { verifyClosing, disputeClosing, deleteClosing } from '@/app/actions/closings'
import { CheckCircle, RotateCcw, Loader2, X, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  closingId: string
  currentStatus: string
}

export default function ReviewActions({ closingId, currentStatus }: Props) {
  const [loading, setLoading] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [note, setNote] = useState('')
  const [done, setDone] = useState(false)

  if (done) return null

  async function handleVerify() {
    setLoading(true)
    const result = await verifyClosing(closingId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('已核准')
      setDone(true)
    }
    setLoading(false)
  }

  async function handleDelete() {
    setLoading(true)
    const result = await deleteClosing(closingId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('帳目已刪除，店長可重新填寫')
      setDone(true)
    }
    setLoading(false)
  }

  async function handleDispute() {
    if (!note.trim()) { toast.error('請填寫退回原因'); return }
    setLoading(true)
    const result = await disputeClosing(closingId, note)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('已退回修改')
      setDone(true)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-2">
      {!showDisputeForm && !showDeleteConfirm ? (
        <div className="flex gap-2 flex-wrap">
          {currentStatus === 'submitted' && (
            <button
              type="button"
              disabled={loading}
              onClick={handleVerify}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              核准
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => setShowDisputeForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 text-xs font-medium hover:bg-orange-200 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {currentStatus === 'verified' ? '重新退回修改' : '退回修改'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            刪除帳目
          </button>
        </div>
      ) : showDisputeForm ? (
        <div className="space-y-2 p-3 rounded-xl bg-orange-50 border border-orange-200">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-orange-700">填寫退回原因</p>
            <button type="button" onClick={() => { setShowDisputeForm(false); setNote('') }}>
              <X className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </div>
          <textarea
            placeholder="請說明異常原因，店長看到後會依此修正..."
            className={cn(
              'w-full text-sm border border-orange-200 rounded-lg px-3 py-2 h-20 resize-none',
              'focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white'
            )}
            value={note}
            onChange={e => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || !note.trim()}
              onClick={handleDispute}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              確認退回
            </button>
            <button
              type="button"
              onClick={() => { setShowDisputeForm(false); setNote('') }}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 p-3 rounded-xl bg-red-50 border border-red-200">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-red-700">確認刪除此帳目？</p>
            <button type="button" onClick={() => setShowDeleteConfirm(false)}>
              <X className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </div>
          <p className="text-xs text-red-600">刪除後無法復原，所有帳目資料將一併清除，店長可重新填寫。</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              確認刪除
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
