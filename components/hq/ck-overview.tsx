'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, CheckCircle2, Loader2, Banknote, Camera, X, Upload, RotateCcw, Trash2 } from 'lucide-react'
import { deleteCKDailyRecord, markCKHQPaid, reviewCKDailyRecord } from '@/app/actions/ck'
import { uploadToStorage } from '@/app/actions/upload'
import { toast } from 'sonner'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  submitted: { bg: '#f0fdf4', text: '#15803d', label: '已送出' },
  verified:  { bg: '#dcfce7', text: '#15803d', label: '已審核' },
  disputed:  { bg: '#ffe4e6', text: '#be123c', label: '已退回' },
  draft:     { bg: '#FFFBEB', text: '#92400E', label: '草稿中' },
  none:      { bg: '#f4f4f5', text: '#71717a', label: '未開始' },
}

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  '食材': { bg: '#fef3c7', text: '#92400e' },
  '耗材': { bg: '#ecfdf5', text: '#047857' },
  '雜項': { bg: '#f4f4f5', text: '#52525b' },
}

interface MemberStore { store_id: string; store_name: string; amount: number }
interface ExternalOrder { name: string; amount: number }
interface Expense { category: string; item_name: string; amount: number; payer_name?: string }

interface CKStoreData {
  ckStore: { id: string; name: string }
  status: string
  payerName?: string | null
  note?: string | null
  reviewNote?: string | null
  reviewedAt?: string | null
  hqPaid: boolean
  hqPaidAt?: string | null
  hqReimbursementPhotoUrls?: string[]
  hqReimbursementSentAt?: string | null
  ckReimbursementConfirmed?: boolean
  ckReimbursementConfirmedAt?: string | null
  revenueTotal: number
  expenseTotal: number
  balance: number
  memberStores: MemberStore[]
  externalOrders: ExternalOrder[]
  externalStores: { id: string; name: string }[]
  expenses: Expense[]
  receiptPhotoUrls?: string[]
}

interface Props {
  data: CKStoreData[]
  date: string
}

function ReviewActions({ ckStoreId, date, status }: { ckStoreId: string; date: string; status: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function approve() {
    startTransition(async () => {
      const r = await reviewCKDailyRecord(ckStoreId, date, 'verified')
      if (r.error) toast.error('審核失敗：' + r.error)
      else { toast.success('央廚帳目已審核通過'); router.refresh() }
    })
  }

  function reject() {
    const note = window.prompt('退回原因（選填），央廚店長會看到這段說明：', '')
    if (note === null) return
    startTransition(async () => {
      const r = await reviewCKDailyRecord(ckStoreId, date, 'disputed', note)
      if (r.error) toast.error('退回失敗：' + r.error)
      else { toast.success('已退回央廚帳目，等待修正'); router.refresh() }
    })
  }

  function remove() {
    if (!window.confirm('確定要刪除這天的央廚帳目嗎？刪除後央廚需要重新輸入。')) return
    startTransition(async () => {
      const r = await deleteCKDailyRecord(ckStoreId, date)
      if (r.error) toast.error('刪除失敗：' + r.error)
      else { toast.success('央廚帳目已刪除'); router.refresh() }
    })
  }

  if (status === 'verified') return null

  const canReview = ['submitted', 'disputed', 'draft'].includes(status)

  return (
    <div className="rounded-2xl p-3 space-y-2" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
      <p className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>帳目審核</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button type="button" onClick={approve} disabled={isPending || !canReview}
          className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          審核通過
        </button>
        <button type="button" onClick={reject} disabled={isPending || !canReview}
          className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
          <RotateCcw className="h-4 w-4" />
          退回修改
        </button>
        <button type="button" onClick={remove} disabled={isPending || !canReview}
          className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }}>
          <Trash2 className="h-4 w-4" />
          刪除帳目
        </button>
      </div>
    </div>
  )
}

function PayButton({
  ckStoreId,
  date,
  paid,
  expenseTotal,
  photoUrls: initialPhotoUrls,
  sentAt,
  confirmed,
  confirmedAt,
  onPreview,
}: {
  ckStoreId: string
  date: string
  paid: boolean
  expenseTotal: number
  photoUrls: string[]
  sentAt?: string | null
  confirmed: boolean
  confirmedAt?: string | null
  onPreview: (url: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState(paid)
  const [photoUrls, setPhotoUrls] = useState(initialPhotoUrls)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      const uploaded: string[] = []
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
        const path = `ck-reimbursements/${ckStoreId}/${date}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const r = await uploadToStorage(formData, 'receipts', path)
        if ('error' in r) throw new Error(r.error)
        uploaded.push(r.publicUrl)
      }
      setPhotoUrls(prev => [...prev, ...uploaded])
      toast.success(`已上傳 ${uploaded.length} 張補款照片`)
    } catch (err: any) {
      toast.error('上傳失敗：' + (err?.message ?? '未知錯誤'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleSubmit() {
    if (photoUrls.length === 0) {
      toast.error('請先上傳補款信封照片')
      return
    }
    setOptimistic(true)
    startTransition(async () => {
      const r = await markCKHQPaid(ckStoreId, date, true, photoUrls)
      if (r.error) {
        setOptimistic(false)
        toast.error('操作失敗：' + r.error)
      } else {
        toast.success('已送出補款，等待央廚點交')
      }
    })
  }

  function handleCancel() {
    setOptimistic(false)
    startTransition(async () => {
      const r = await markCKHQPaid(ckStoreId, date, false)
      if (r.error) {
        setOptimistic(true)
        toast.error('操作失敗：' + r.error)
      } else {
        setPhotoUrls([])
        toast.success('已取消補款記錄')
      }
    })
  }

  if (optimistic) {
    return (
      <div className="space-y-3 px-4 py-3.5 rounded-2xl"
        style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: confirmed ? '#15803d' : '#d97706' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: confirmed ? '#15803d' : '#92400e' }}>
                {confirmed ? '央廚已點交' : '待央廚點交'}
              </p>
              <p className="text-xs" style={{ color: '#16a34a' }}>
                已包 ${fmt(expenseTotal)} 給央廚{sentAt ? ` · ${new Date(sentAt).toLocaleString('zh-TW')}` : ''}
              </p>
              {confirmedAt && (
                <p className="text-xs" style={{ color: '#15803d' }}>點交時間：{new Date(confirmedAt).toLocaleString('zh-TW')}</p>
              )}
            </div>
          </div>
          <button type="button" onClick={handleCancel} disabled={isPending || confirmed}
            className="text-xs px-2.5 py-1 rounded-lg transition-colors hover:bg-white/60 disabled:opacity-40"
            style={{ color: '#15803d' }}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : '取消'}
          </button>
        </div>
        {photoUrls.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {photoUrls.map((url, i) => (
              <button key={`${url}-${i}`} type="button" onClick={() => onPreview(url)} className="block" style={{ aspectRatio: '1' }}>
                <img src={url} alt={`補款照片 ${i + 1}`} className="h-full w-full rounded-lg object-cover" style={{ border: '1px solid #bbf7d0' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl p-3" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 shrink-0" style={{ color: '#92400e' }} />
          <div className="text-left">
            <p className="text-sm font-semibold" style={{ color: '#92400e' }}>補款信封照片</p>
            <p className="text-xs" style={{ color: '#a16207' }}>應包 ${fmt(expenseTotal)}</p>
          </div>
        </div>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || isPending}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
          style={{ background: 'white', color: '#92400e', border: '1px solid #FDE68A' }}>
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
          上傳
        </button>
      </div>
      {photoUrls.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {photoUrls.map((url, i) => (
            <div key={`${url}-${i}`} className="relative" style={{ aspectRatio: '1' }}>
              <button type="button" onClick={() => onPreview(url)} className="block h-full w-full">
                <img src={url} alt={`補款照片 ${i + 1}`} className="h-full w-full rounded-lg object-cover" style={{ border: '1px solid #FDE68A' }} />
              </button>
              <button type="button" onClick={() => setPhotoUrls(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute -right-1 -top-1 h-5 w-5 rounded-full flex items-center justify-center"
                style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={handleSubmit} disabled={isPending || uploading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.2)' }}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        送出補款，通知央廚點交
      </button>
    </div>
  )
}


function CKCard({ d, date }: { d: CKStoreData; date: string }) {
  const [open, setOpen] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const st = STATUS_STYLE[d.status] ?? STATUS_STYLE.none
  const hasData = d.status !== 'none'

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>

      {/* 標題列 */}
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold shrink-0 text-xs"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)' }}>
            {d.ckStore.name.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: '#18181b' }}>{d.ckStore.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: st.bg, color: st.text }}>{st.label}</span>
              {d.hqPaid && (
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: d.ckReimbursementConfirmed ? '#f0fdf4' : '#FFFBEB', color: d.ckReimbursementConfirmed ? '#15803d' : '#92400E' }}>
                  <CheckCircle2 className="h-2.5 w-2.5" />{d.ckReimbursementConfirmed ? '已點交' : '待點交'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {hasData && (
            <div className="text-right hidden sm:block">
              <p className="text-xs" style={{ color: '#a1a1aa' }}>支出</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: '#f97316' }}>
                ${fmt(d.expenseTotal)}
              </p>
            </div>
          )}
          {open
            ? <ChevronUp className="h-4 w-4 shrink-0" style={{ color: '#a1a1aa' }} />
            : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: '#a1a1aa' }} />}
        </div>
      </button>

      {/* 摘要（未展開） */}
      {!open && hasData && (
        <div className="grid grid-cols-3 gap-px mx-5 mb-4" style={{ border: '1px solid #f4f4f5', borderRadius: '12px', overflow: 'hidden' }}>
          {[
            { label: '營業額', value: d.revenueTotal, color: '#10b981' },
            { label: '當日支出', value: d.expenseTotal, color: '#f97316' },
            { label: '待補款', value: d.hqPaid ? 0 : d.expenseTotal, color: d.hqPaid ? '#a1a1aa' : '#dc2626' },
          ].map(({ label, value, color }) => (
            <div key={label} className="px-3 py-2.5" style={{ background: '#fafafa' }}>
              <p className="text-[10px] font-semibold" style={{ color: '#a1a1aa' }}>{label}</p>
              <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color }}>${fmt(value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* 展開細節 */}
      {open && (
        <div className="px-5 pb-5 space-y-4" style={{ borderTop: '1px solid #f4f4f5', paddingTop: '16px' }}>

          {hasData ? (
            <>
              {/* 摘要 */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '營業額', value: d.revenueTotal, color: '#10b981' },
                  { label: '當日支出', value: d.expenseTotal, color: '#f97316' },
                  { label: '待補款', value: d.hqPaid ? 0 : d.expenseTotal, color: d.hqPaid ? '#a1a1aa' : '#dc2626' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-xl px-3 py-2.5" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
                    <p className="text-[10px] font-semibold" style={{ color: '#a1a1aa' }}>{label}</p>
                    <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color }}>${fmt(value)}</p>
                  </div>
                ))}
              </div>

              {/* 體系內叫貨 */}
              {d.memberStores.length > 0 && (
                <Section title="體系內叫貨">
                  {d.memberStores.map(s => (
                    <Row key={s.store_id}
                      left={s.store_name}
                      right={s.amount > 0 ? `$${fmt(s.amount)}` : '—'}
                      dim={s.amount === 0}
                    />
                  ))}
                  <TotalRow label="體系內合計" value={d.memberStores.reduce((s, o) => s + o.amount, 0)} />
                </Section>
              )}

              {/* 體系外叫貨 */}
              {d.externalOrders.length > 0 && (
                <Section title="體系外叫貨">
                  {d.externalOrders.map(o => (
                    <Row key={o.name} left={o.name} right={`$${fmt(o.amount)}`} />
                  ))}
                  <TotalRow label="體系外合計" value={d.externalOrders.reduce((s, o) => s + o.amount, 0)} />
                </Section>
              )}

              {/* 支出明細 */}
              {d.expenses.length > 0 && (
                <Section title="支出明細">
                  {d.expenses.map((e, i) => (
                    <div key={i} className="flex items-center gap-2 py-2.5 px-3" style={{ borderBottom: '1px solid #f9f9f9' }}>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: CAT_COLORS[e.category]?.bg ?? '#f4f4f5', color: CAT_COLORS[e.category]?.text ?? '#52525b' }}>
                        {e.category}
                      </span>
                      <span className="flex-1 text-sm" style={{ color: '#18181b' }}>
                        {e.item_name}
                        {e.payer_name && <span className="ml-1.5 text-xs" style={{ color: '#a1a1aa' }}>（{e.payer_name}墊付）</span>}
                      </span>
                      <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: '#18181b' }}>${fmt(e.amount)}</span>
                    </div>
                  ))}
                  <TotalRow label="支出合計" value={d.expenses.reduce((s, e) => s + e.amount, 0)} color="#dc2626" />
                </Section>
              )}

              {/* 貨款代墊人 / 備註 */}
              {(d.payerName || d.note) && (
                <div className="rounded-xl px-3 py-3 space-y-1" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
                  {d.payerName && <p className="text-sm" style={{ color: '#18181b' }}>貨款代墊：<b>{d.payerName}</b></p>}
                  {d.note && <p className="text-sm" style={{ color: '#52525b' }}>{d.note}</p>}
                </div>
              )}

              {d.reviewNote && (
                <div className="rounded-xl px-3 py-3 space-y-1" style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
                  <p className="text-xs font-semibold" style={{ color: '#be123c' }}>退回原因</p>
                  <p className="text-sm" style={{ color: '#881337' }}>{d.reviewNote}</p>
                </div>
              )}

              {/* 收據照片 */}
              {(d.receiptPhotoUrls?.length ?? 0) > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Camera className="h-3.5 w-3.5" style={{ color: '#a1a1aa' }} />
                    <p className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>收據照片（{d.receiptPhotoUrls!.length} 張）</p>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {d.receiptPhotoUrls!.map((url, i) => (
                      <button key={url} type="button" onClick={() => setLightboxUrl(url)}
                        className="relative group" style={{ aspectRatio: '1' }}>
                        <img src={url} alt={`收據 ${i + 1}`}
                          className="w-full h-full object-cover rounded-xl"
                          style={{ border: '1px solid #e4e4e7' }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 補款管理 */}
              {d.expenseTotal > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#a1a1aa' }}>補款管理</p>
                  <PayButton
                    ckStoreId={d.ckStore.id}
                    date={date}
                    paid={d.hqPaid}
                    expenseTotal={d.expenseTotal}
                    photoUrls={d.hqReimbursementPhotoUrls ?? []}
                    sentAt={d.hqReimbursementSentAt}
                    confirmed={d.ckReimbursementConfirmed ?? false}
                    confirmedAt={d.ckReimbursementConfirmedAt}
                    onPreview={setLightboxUrl}
                  />
                </div>
              )}

              <ReviewActions ckStoreId={d.ckStore.id} date={date} status={d.status} />

              {/* 匯出 Excel */}
            </>
          ) : (
            <>
              <p className="text-sm text-center py-4" style={{ color: '#a1a1aa' }}>今日尚未填寫帳目</p>
            </>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxUrl(null)}>
          <button type="button" onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>
            <X className="h-5 w-5" />
          </button>
          <img src={lightboxUrl} alt="收據" className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-1.5" style={{ color: '#a1a1aa' }}>{title}</p>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ left, right, dim }: { left: string; right: string; dim?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3" style={{ borderBottom: '1px solid #f9f9f9' }}>
      <span className="text-sm font-medium" style={{ color: dim ? '#a1a1aa' : '#18181b' }}>{left}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color: dim ? '#a1a1aa' : '#18181b' }}>{right}</span>
    </div>
  )
}

function TotalRow({ label, value, color = '#18181b' }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3" style={{ background: '#fafafa', borderTop: '1px solid #f4f4f5' }}>
      <span className="text-xs font-bold uppercase" style={{ color: '#a1a1aa' }}>{label}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color }}>${fmt(value)}</span>
    </div>
  )
}

export default function CKOverview({ data, date }: Props) {
  const totalRevenue = data.reduce((s, d) => s + d.revenueTotal, 0)
  const totalExpense = data.reduce((s, d) => s + d.expenseTotal, 0)
  const submittedCount = data.filter(d => d.status === 'submitted' || d.status === 'verified').length
  const paidCount = data.filter(d => d.hqPaid).length
  const unpaidExpense = data.filter(d => !d.hqPaid && d.expenseTotal > 0).reduce((s, d) => s + d.expenseTotal, 0)

  return (
    <div className="space-y-4">
      {/* 全體摘要 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '營業額', value: `$${fmt(totalRevenue)}`, color: '#10b981' },
          { label: '全體支出', value: `$${fmt(totalExpense)}`, color: '#f97316' },
          { label: '已送出', value: `${submittedCount} / ${data.length} 間`, color: '#F59E0B' },
          { label: '待補款', value: unpaidExpense > 0 ? `$${fmt(unpaidExpense)}` : '—', color: unpaidExpense > 0 ? '#dc2626' : '#a1a1aa' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl px-4 py-3" style={{ border: '1px solid #f4f4f5' }}>
            <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#a1a1aa' }}>{label}</p>
            <p className="text-base font-bold tabular-nums" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* 各央廚卡片 */}
      {data.map(d => (
        <CKCard key={d.ckStore.id} d={d} date={date} />
      ))}
    </div>
  )
}
