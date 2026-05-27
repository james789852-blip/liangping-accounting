'use client'

import { useState } from 'react'
import { Trash2, Loader2, X } from 'lucide-react'
import { deleteClosingDraft } from '@/app/actions/closings'
import { toast } from 'sonner'

export default function DeleteDraftButton({ closingId }: { closingId: string }) {
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    const result = await deleteClosingDraft(closingId)
    if (result?.error) {
      toast.error(result.error)
      setLoading(false)
      setConfirm(false)
    }
  }

  if (confirm) {
    return (
      <div className="rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3"
        style={{ background: '#fff8f8', border: '1px solid #fda4af' }}>
        <p className="text-sm font-medium" style={{ color: '#be123c' }}>確定要刪除此草稿？此動作無法復原。</p>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setConfirm(false)} disabled={loading}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold"
            style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
            <X className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleDelete} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', opacity: loading ? 0.6 : 1 }}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            確認刪除
          </button>
        </div>
      </div>
    )
  }

  return (
    <button onClick={() => setConfirm(true)}
      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold"
      style={{ background: '#fff8f8', border: '1px solid #fecdd3', color: '#be123c' }}>
      <Trash2 className="h-4 w-4" />
      刪除此草稿
    </button>
  )
}
