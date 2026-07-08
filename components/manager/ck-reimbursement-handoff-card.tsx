'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, X } from 'lucide-react'
import { confirmCKReimbursementHandoff } from '@/app/actions/ck'

type PendingReimbursement = {
  id: string
  business_date: string
  sent_at: string | null
  photos: string[]
}

type Props = {
  ckStoreId: string
  items: PendingReimbursement[]
}

function formatSentTime(value: string | null) {
  if (!value) return '總公司已送出補款照片'
  return `送出時間：${new Date(value).toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export default function CKReimbursementHandoffCard({ ckStoreId, items }: Props) {
  const router = useRouter()
  const [pendingDate, setPendingDate] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleConfirm = (date: string) => {
    startTransition(async () => {
      setPendingDate(date)
      const result = await confirmCKReimbursementHandoff(ckStoreId, date)
      setPendingDate(null)

      if (result?.error) {
        toast.error(`點交失敗：${result.error}`)
        return
      }

      toast.success('補款已點交完成')
      router.refresh()
    })
  }

  return (
    <div
      className="rounded-3xl p-5 mb-4"
      style={{ background: '#FFF7ED', border: '1.5px solid #FED7AA' }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xl font-black" style={{ color: '#9A3412' }}>
            有補款等待點交
          </p>
          <p className="text-sm font-bold mt-1" style={{ color: '#C2410C' }}>
            確認收到總公司補款信封後，直接在這裡完成點交。
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-sm font-black" style={{ background: '#FFEDD5', color: '#9A3412' }}>
          {items.length} 筆
        </span>
      </div>

      <div className="space-y-3">
        {items.map(item => {
          const busy = isPending && pendingDate === item.business_date
          return (
            <div key={item.id} className="rounded-2xl bg-white p-4" style={{ border: '1px solid #FED7AA' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-gray-900">{item.business_date}</p>
                  <p className="text-sm font-bold mt-1" style={{ color: '#9A3412' }}>{formatSentTime(item.sent_at)}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleConfirm(item.business_date)}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-black text-white disabled:opacity-60"
                  style={{ background: '#059669' }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {busy ? '點交中...' : '確認點交完成'}
                </button>
              </div>

              {item.photos.length > 0 && (
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                  {item.photos.map((url, index) => (
                    <button
                      key={`${item.id}-photo-${index}`}
                      type="button"
                      onClick={() => setPreviewUrl(url)}
                      className="block h-20 w-20 flex-shrink-0 cursor-zoom-in overflow-hidden rounded-xl bg-orange-50"
                      aria-label={`放大補款信封照片 ${index + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="補款信封照片" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setPreviewUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewUrl(null)}
            className="absolute right-4 top-4 rounded-full p-2"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}
            aria-label="關閉補款照片預覽"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="補款信封照片放大預覽"
            className="max-h-[85vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
            onClick={event => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
