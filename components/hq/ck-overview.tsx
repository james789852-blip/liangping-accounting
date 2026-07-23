'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Loader2, Banknote, Camera, X, Upload, RotateCcw, Trash2 } from 'lucide-react'
import { deleteCKDailyRecord, markCKHQPaid, reviewCKDailyRecord, saveCKHQReimbursementPhotoDraft } from '@/app/actions/ck'
import { uploadToStorage } from '@/app/actions/upload'
import { toast } from 'sonner'
import { centralKitchenPhotoPath } from '@/lib/storage-paths'
import SafePhotoImage from './safe-photo-image'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

// 依店家管理設定，計算要從央廚補款／點交金額扣除的體系外收入。
function deductibleExternalRevenue(d: Pick<CKStoreData, 'externalStores' | 'externalOrders'>) {
  const deductibleNames = new Set(
    d.externalStores
      .filter(store => store.deductFromReimbursement)
      .map(store => store.name.trim())
      .filter(Boolean),
  )
  return d.externalOrders
    .filter(order => deductibleNames.has(order.name.trim()))
    .reduce((sum, order) => sum + Number(order.amount || 0), 0)
}

function hqReimbursementAmount(d: Pick<CKStoreData, 'expenseTotal' | 'externalStores' | 'externalOrders'>) {
  return Math.max(0, d.expenseTotal - deductibleExternalRevenue(d))
}

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

interface MemberStore { store_id: string; store_name: string; amount: number; manager_amount: number | null }
interface ExternalOrder { name: string; amount: number }
interface Expense { category: string; item_name: string; amount: number; payer_name?: string; vendor_group?: string; doc_type?: string; note?: string; receipt_photo_url?: string }

type ExpenseGroup = {
  key: string
  name: string
  expenses: Expense[]
  total: number
  categories: string[]
  payerNames: string[]
  notes: string[]
  photoUrls: string[]
}

/** 同一廠商的多個品項視為同一張待核對單據，不再逐品項重複顯示照片。 */
function groupExpensesByVendor(expenses: Expense[]): ExpenseGroup[] {
  const groups = new Map<string, ExpenseGroup>()
  expenses.forEach(expense => {
    const name = expense.vendor_group?.trim() || expense.item_name.trim() || '未分類支出'
    const key = name
    const current = groups.get(key) ?? {
      key,
      name,
      expenses: [],
      total: 0,
      categories: [],
      payerNames: [],
      notes: [],
      photoUrls: [],
    }
    current.expenses.push(expense)
    current.total += Number(expense.amount) || 0
    if (expense.category && !current.categories.includes(expense.category)) current.categories.push(expense.category)
    if (expense.payer_name && !current.payerNames.includes(expense.payer_name)) current.payerNames.push(expense.payer_name)
    if (expense.note && !current.notes.includes(expense.note)) current.notes.push(expense.note)
    if (expense.receipt_photo_url && !current.photoUrls.includes(expense.receipt_photo_url)) current.photoUrls.push(expense.receipt_photo_url)
    groups.set(key, current)
  })
  return Array.from(groups.values())
}

interface CKStoreData {
  ckStore: { id: string; name: string }
  status: string
  payerName?: string | null
  submittedBy?: string | null
  submittedByName?: string | null
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
  externalStores: { id: string; name: string; deductFromReimbursement?: boolean }[]
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
  // 審核成功後先在目前畫面立即隱藏核准按鈕，避免父層的央廚明細快取
  // 尚未更新時，畫面仍顯示可以再次核准。完整重新載入後會再以資料庫狀態為準。
  const [localDecision, setLocalDecision] = useState<'verified' | 'disputed' | 'deleted' | null>(null)

  function approve() {
    startTransition(async () => {
      const r = await reviewCKDailyRecord(ckStoreId, date, 'verified')
      if (r.error) toast.error('審核失敗：' + r.error)
      else {
        setLocalDecision('verified')
        toast.success('央廚帳目已審核通過')
        router.refresh()
      }
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
      else {
        setLocalDecision('deleted')
        toast.success('央廚帳目已刪除')
        router.refresh()
      }
    })
  }

  const effectiveStatus = localDecision ?? status
  const canApprove = ['submitted', 'disputed', 'draft'].includes(effectiveStatus)
  const canRevise = ['submitted', 'verified', 'disputed', 'draft'].includes(effectiveStatus)

  if (localDecision === 'deleted') return null

  return (
    <div className="rounded-2xl p-3 space-y-2" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
      <p className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>帳目審核</p>
      <div className={`grid grid-cols-1 ${canApprove ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2`}>
        {canApprove && (
          <button type="button" onClick={approve} disabled={isPending}
            className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            審核通過
          </button>
        )}
        <button type="button" onClick={reject} disabled={isPending || !canRevise}
          className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
          <RotateCcw className="h-4 w-4" />
          退回修改
        </button>
        <button type="button" onClick={remove} disabled={isPending || !canRevise}
          className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }}>
          <Trash2 className="h-4 w-4" />
          刪除帳目
        </button>
      </div>
    </div>
  )
}

function ckRecordBadges(status: string, hqPaid: boolean, handoffConfirmed: boolean) {
  const badges: Array<{ label: string; bg: string; text: string; icon?: boolean }> = []
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.none
  badges.push({ label: st.label, bg: st.bg, text: st.text })
  if (handoffConfirmed) {
    badges.push({ label: '已點交', bg: '#dbeafe', text: '#1d4ed8', icon: true })
  } else if (hqPaid) {
    badges.push({ label: '待點交', bg: '#FFFBEB', text: '#92400E', icon: true })
  }
  return badges
}

function PayButton({
  ckStoreId,
  date,
  paid,
  expenseTotal,
  originalExpenseTotal,
  externalRevenue,
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
  originalExpenseTotal?: number
  externalRevenue?: number
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
        const path = centralKitchenPhotoPath(ckStoreId, date, 'reimbursements', `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`)
        const r = await uploadToStorage(formData, 'receipts', path)
        if ('error' in r) throw new Error(r.error)
        uploaded.push(r.publicUrl)
      }
      const nextPhotoUrls = [...photoUrls, ...uploaded]
      const saved = await saveCKHQReimbursementPhotoDraft(ckStoreId, date, nextPhotoUrls)
      if ('error' in saved) throw new Error(saved.error)
      setPhotoUrls(nextPhotoUrls)
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

  function removeDraftPhoto(index: number) {
    const nextPhotoUrls = photoUrls.filter((_, photoIndex) => photoIndex !== index)
    setPhotoUrls(nextPhotoUrls)
    startTransition(async () => {
      const saved = await saveCKHQReimbursementPhotoDraft(ckStoreId, date, nextPhotoUrls)
      if (saved.error) toast.error('刪除照片保存失敗：' + saved.error)
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
              {(externalRevenue ?? 0) > 0 && (originalExpenseTotal ?? expenseTotal) !== expenseTotal && (
                <p className="text-xs" style={{ color: '#15803d' }}>
                  原支出 ${fmt(originalExpenseTotal ?? expenseTotal)} − 體系外 ${fmt(externalRevenue ?? 0)}
                </p>
              )}
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
                <SafePhotoImage src={url} alt={`補款照片 ${i + 1}`} thumb width={180} height={180} className="h-full w-full rounded-lg object-cover" style={{ border: '1px solid #bbf7d0' }} />
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
            {(externalRevenue ?? 0) > 0 && (originalExpenseTotal ?? expenseTotal) !== expenseTotal && (
              <p className="text-xs" style={{ color: '#a16207' }}>
                ${fmt(originalExpenseTotal ?? expenseTotal)} − 體系外 ${fmt(externalRevenue ?? 0)}
              </p>
            )}
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
                <SafePhotoImage src={url} alt={`補款照片 ${i + 1}`} thumb width={180} height={180} className="h-full w-full rounded-lg object-cover" style={{ border: '1px solid #FDE68A' }} />
              </button>
              <button type="button" onClick={() => removeDraftPhoto(i)} disabled={isPending}
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
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewDecision, setReviewDecision] = useState<'verified' | 'disputed' | null>(null)
  const displayStatus = reviewDecision ?? d.status
  const badges = ckRecordBadges(displayStatus, d.hqPaid, d.ckReimbursementConfirmed ?? false)
  const hasData = displayStatus !== 'none'
  const externalRevenue = deductibleExternalRevenue(d)
  const reimbursementAmount = Math.max(0, d.expenseTotal - externalRevenue)
  const expenseGroups = groupExpensesByVendor(d.expenses)

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
              {badges.map(badge => (
                <span key={badge.label} className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: badge.bg, color: badge.text }}>
                  {badge.icon && <CheckCircle2 className="h-2.5 w-2.5" />}
                  {badge.label}
                </span>
              ))}
            </div>
            {(d.submittedByName || d.submittedBy) && (
              <p className="text-[11px] mt-1" style={{ color: '#71717a' }}>
                帳目送出者：{d.submittedByName ?? '未記錄'}
              </p>
            )}
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
            { label: '待補款', value: d.hqPaid ? 0 : reimbursementAmount, color: d.hqPaid ? '#a1a1aa' : '#dc2626' },
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
                  { label: '待補款', value: d.hqPaid ? 0 : reimbursementAmount, color: d.hqPaid ? '#a1a1aa' : '#dc2626' },
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
                  {expenseGroups.map(group => (
                    <div key={group.key} style={{ borderBottom: '1px solid #f4f4f5' }}>
                      <div className="flex items-center gap-2 py-2.5 px-3" style={{ background: '#fafafa' }}>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: CAT_COLORS[group.categories[0]]?.bg ?? '#f4f4f5', color: CAT_COLORS[group.categories[0]]?.text ?? '#52525b' }}>
                          {group.categories.join('／') || '支出'}
                        </span>
                        <span className="flex-1 text-sm font-bold" style={{ color: '#18181b' }}>{group.name}</span>
                        <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: '#18181b' }}>${fmt(group.total)}</span>
                      </div>
                      {group.expenses.map((expense, index) => (
                        <div key={`${expense.item_name}-${index}`} className="flex items-center gap-2 py-2 pl-9 pr-3">
                          <span className="flex-1 text-sm" style={{ color: '#52525b' }}>
                            {expense.item_name}
                            {expense.payer_name && <span className="ml-1.5 text-xs" style={{ color: '#a1a1aa' }}>（{expense.payer_name}墊付）</span>}
                          </span>
                          <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: '#52525b' }}>${fmt(expense.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  <TotalRow label="支出合計" value={d.expenses.reduce((s, e) => s + e.amount, 0)} color="#dc2626" />
                </Section>
              )}

              {/* 貨款代墊人 / 備註 */}
              {(d.submittedByName || d.submittedBy || d.payerName || d.note) && (
                <div className="rounded-xl px-3 py-3 space-y-1" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
                  {(d.submittedByName || d.submittedBy) && <p className="text-sm" style={{ color: '#18181b' }}>帳目送出者：<b>{d.submittedByName ?? '未記錄'}</b></p>}
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
                        <SafePhotoImage src={url} alt={`收據 ${i + 1}`} thumb width={240} height={240}
                          className="w-full h-full object-cover rounded-xl"
                          style={{ border: '1px solid #e4e4e7' }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 補款管理 */}
              {reimbursementAmount > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#a1a1aa' }}>補款管理</p>
                  <PayButton
                    ckStoreId={d.ckStore.id}
                    date={date}
                    paid={d.hqPaid}
                    expenseTotal={reimbursementAmount}
                    originalExpenseTotal={d.expenseTotal}
                    externalRevenue={externalRevenue}
                    photoUrls={d.hqReimbursementPhotoUrls ?? []}
                    sentAt={d.hqReimbursementSentAt}
                    confirmed={d.ckReimbursementConfirmed ?? false}
                    confirmedAt={d.ckReimbursementConfirmedAt}
                    onPreview={setLightboxUrl}
                  />
                </div>
              )}

              {['submitted', 'disputed', 'draft'].includes(displayStatus) && (
                <button type="button" onClick={() => setReviewOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)' }}>
                  <Camera className="h-4 w-4" />開始逐步核對
                </button>
              )}
              {['submitted', 'verified', 'disputed', 'draft'].includes(displayStatus) && (
                <ReviewActions ckStoreId={d.ckStore.id} date={date} status={displayStatus} />
              )}

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
          <SafePhotoImage src={lightboxUrl} alt="收據" loading="eager" className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
        </div>
      )}
      {reviewOpen && <CKStepReview d={d} date={date} onClose={() => setReviewOpen(false)} onReviewed={setReviewDecision} />}
    </div>
  )
}

type CKReviewStep = {
  key: string
  title: string
  photoUrls?: string[]
  rows: Array<{ label: string; amount?: number; value?: string; managerAmount?: number | null }>
  total?: number
  managerTotal?: number
}

function CKStepReview({ d, date, onClose, onReviewed }: { d: CKStoreData; date: string; onClose: () => void; onReviewed: (decision: 'verified' | 'disputed') => void }) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set())
  const [issues, setIssues] = useState<Record<number, string>>({})
  const [editingIssue, setEditingIssue] = useState(false)
  const [draft, setDraft] = useState('')
  const [photoIndex, setPhotoIndex] = useState(0)
  const [pending, startTransition] = useTransition()

  const expensePhotoSet = new Set(d.expenses.map(e => e.receipt_photo_url).filter(Boolean))
  const unassignedPhotos = (d.receiptPhotoUrls ?? []).filter(url => !expensePhotoSet.has(url))
  const expenseGroups = groupExpensesByVendor(d.expenses)
  const steps: CKReviewStep[] = [
    ...(d.memberStores.length ? [{
      key: 'member',
      title: '體系內叫貨',
      rows: d.memberStores.map(item => ({ label: item.store_name, amount: item.amount, managerAmount: item.manager_amount })),
      total: d.memberStores.reduce((sum, item) => sum + item.amount, 0),
      managerTotal: d.memberStores.reduce((sum, item) => sum + (item.manager_amount ?? 0), 0),
    }] : []),
    ...(d.externalOrders.length ? [{ key: 'external', title: '體系外叫貨', rows: d.externalOrders.map(item => ({ label: item.name, amount: item.amount })), total: d.externalOrders.reduce((sum, item) => sum + item.amount, 0) }] : []),
    ...expenseGroups.map(group => ({
      key: `expense-${group.key}`,
      title: `支出：${group.name}`,
      photoUrls: group.photoUrls,
      rows: [
        { label: '類別', value: group.categories.join('／') || '未分類' },
        ...(group.payerNames.length ? [{ label: '代墊人', value: group.payerNames.join('、') }] : []),
        ...group.expenses.map(item => ({ label: item.item_name, amount: item.amount })),
        ...group.notes.map(note => ({ label: '備註', value: note })),
      ],
      total: group.total,
    })),
    ...unassignedPhotos.map((url, i) => ({ key: `photo-${i}`, title: `其他收據照片 ${i + 1}`, photoUrls: [url], rows: [{ label: '照片用途', value: '央廚收據／單據' }] })),
    { key: 'summary', title: '央廚結算結果', rows: [
      { label: '營業額', amount: d.revenueTotal },
      { label: '當日支出', amount: d.expenseTotal },
      { label: '結餘', amount: d.balance },
      { label: '總公司應補款', amount: hqReimbursementAmount(d) },
      ...(d.payerName ? [{ label: '貨款代墊', value: d.payerName }] : []),
      ...(d.note ? [{ label: '備註', value: d.note }] : []),
    ] },
  ]
  const step = steps[index]
  const currentPhotoUrls = step.photoUrls ?? []
  const currentPhotoUrl = currentPhotoUrls[photoIndex] ?? currentPhotoUrls[0]
  const reviewedCount = new Set([...confirmed, ...Object.keys(issues).map(Number)]).size
  const complete = reviewedCount === steps.length
  const issueEntries = Object.entries(issues).filter(([, note]) => note.trim())

  useEffect(() => setPhotoIndex(0), [index])

  function markOkay() {
    setConfirmed(prev => new Set(prev).add(index))
    setIssues(prev => { const next = { ...prev }; delete next[index]; return next })
    setEditingIssue(false)
    if (index < steps.length - 1) setIndex(index + 1)
  }
  function saveIssue() {
    setIssues(prev => ({ ...prev, [index]: draft.trim() || '此步驟內容有誤，請重新確認。' }))
    setConfirmed(prev => { const next = new Set(prev); next.delete(index); return next })
    setEditingIssue(false)
    if (index < steps.length - 1) setIndex(index + 1)
  }
  function finish(decision: 'verified' | 'disputed') {
    const note = decision === 'disputed'
      ? issueEntries.map(([i, text], n) => `${n + 1}. 【${steps[Number(i)]?.title}】${text}`).join('\n')
      : undefined
    startTransition(async () => {
      const result = await reviewCKDailyRecord(d.ckStore.id, date, decision, note)
      if (result.error) toast.error(result.error)
      else {
        onReviewed(decision)
        toast.success(decision === 'verified' ? '央廚帳目已審核通過' : `已退回並回報 ${issueEntries.length} 個問題`)
        onClose()
        router.refresh()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(9,9,11,.75)' }}>
      <div className="bg-white w-full sm:max-w-4xl sm:rounded-3xl overflow-hidden flex flex-col" style={{ maxHeight: '94dvh' }}>
        <div className="p-4 flex justify-between items-center" style={{ borderBottom: '1px solid #e4e4e7' }}>
          <div><p className="font-bold">逐步核對 · {d.ckStore.name}</p><p className="text-xs" style={{ color: '#71717a' }}>{index + 1} / {steps.length}　{step.title}</p></div>
          <button onClick={onClose} className="p-2 rounded-full" style={{ background: '#f4f4f5' }}><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto p-4 grid sm:grid-cols-2 gap-4">
          <div className="min-h-64 rounded-2xl flex flex-col overflow-hidden" style={{ background: currentPhotoUrl ? '#18181b' : '#f8fafc', border: '1px solid #e4e4e7' }}>
            <div className="flex-1 flex items-center justify-center min-h-64">
              {currentPhotoUrl ? <SafePhotoImage src={currentPhotoUrl} alt={step.title} className="w-full h-full max-h-[48dvh] object-contain" /> : <div className="text-center" style={{ color: '#a1a1aa' }}><FileTextFallback /><p className="text-sm mt-2">此步驟沒有照片，請核對輸入內容與金額</p></div>}
            </div>
            {currentPhotoUrls.length > 1 && (
              <div className="grid grid-cols-4 gap-2 p-2" style={{ background: '#18181b', borderTop: '1px solid rgba(255,255,255,.15)' }}>
                {currentPhotoUrls.map((url, photoNumber) => (
                  <button key={url} type="button" onClick={() => setPhotoIndex(photoNumber)}
                    className="overflow-hidden rounded-lg"
                    style={{ aspectRatio: '1', border: `2px solid ${photoNumber === photoIndex ? '#f59e0b' : 'transparent'}` }}>
                    <SafePhotoImage src={url} alt={`${step.title} 照片 ${photoNumber + 1}`} thumb width={180} height={180} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl p-3 space-y-2" style={{ background: '#fafafa', border: '1px solid #e4e4e7' }}>
              <p className="text-xs font-bold" style={{ color: '#52525b' }}>央廚輸入內容</p>
              {step.key === 'member' && (
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 text-[10px] font-bold" style={{ color: '#a1a1aa' }}>
                  <span>店家</span><span>央廚輸入</span><span>店長輸入</span>
                </div>
              )}
              {step.rows.map((row, i) => step.key === 'member' ? (
                <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2.5 px-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
                  <span className="text-sm font-medium">{row.label}</span>
                  <span className="text-sm font-bold tabular-nums">${fmt(row.amount ?? 0)}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: row.managerAmount == null ? '#a1a1aa' : row.managerAmount === row.amount ? '#059669' : '#dc2626' }}>
                    {row.managerAmount == null ? '尚未送出' : `$${fmt(row.managerAmount)}`}
                  </span>
                </div>
              ) : <Row key={i} left={row.label} right={row.amount !== undefined ? `$${fmt(row.amount)}` : row.value || '—'} />)}
              {step.total !== undefined && (step.key === 'member' ? (
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2.5 px-3" style={{ background: '#fff7ed', borderTop: '1px solid #fed7aa' }}>
                  <span className="text-xs font-bold" style={{ color: '#9a3412' }}>步驟合計</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: '#92400e' }}>${fmt(step.total)}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: step.managerTotal === step.total ? '#059669' : '#dc2626' }}>${fmt(step.managerTotal ?? 0)}</span>
                </div>
              ) : <TotalRow label="步驟合計" value={step.total} color="#92400e" />)}
            </div>
            {!editingIssue ? <div className="grid grid-cols-2 gap-2">
              <button onClick={markOkay} className="py-3 rounded-xl text-sm font-bold text-white" style={{ background: confirmed.has(index) ? '#10b981' : 'linear-gradient(135deg,#10b981,#059669)' }}>內容相符</button>
              <button onClick={() => { setDraft(issues[index] || ''); setEditingIssue(true) }} className="py-3 rounded-xl text-sm font-bold" style={{ background: '#fff1f2', color: '#be123c', border: '1px solid #fda4af' }}>{issues[index] ? '已記錄問題' : '內容有誤'}</button>
            </div> : <div className="p-3 rounded-xl space-y-2" style={{ background: '#fff1f2', border: '1px solid #fda4af' }}><p className="text-xs font-bold" style={{ color: '#be123c' }}>問題說明（選填）</p><p className="text-[11px]" style={{ color: '#9f1239' }}>不填寫時會自動提醒央廚「此步驟內容有誤，請重新確認」。</p><textarea autoFocus className="w-full min-h-24 p-3 rounded-lg" value={draft} onChange={e => setDraft(e.target.value)} placeholder="可輸入此步驟的詳細問題…" /><div className="flex justify-end gap-2"><button onClick={() => setEditingIssue(false)}>取消</button><button onClick={saveIssue} className="px-3 py-2 text-xs font-bold text-white rounded-lg" style={{ background: '#e11d48' }}>{draft.trim() ? '記錄問題' : '直接標記有誤'}</button></div></div>}
            <div className="grid grid-cols-2 gap-2"><button disabled={index === 0} onClick={() => setIndex(i => i - 1)} className="py-2 rounded-xl disabled:opacity-30" style={{ background: '#f4f4f5' }}><ChevronLeft className="inline h-4 w-4" />上一項</button><button disabled={index === steps.length - 1} onClick={() => setIndex(i => i + 1)} className="py-2 rounded-xl disabled:opacity-30" style={{ background: '#f4f4f5' }}>下一項<ChevronRight className="inline h-4 w-4" /></button></div>
            {complete && <button disabled={pending} onClick={() => finish(issueEntries.length ? 'disputed' : 'verified')} className="w-full py-3 rounded-xl font-bold text-white disabled:opacity-50" style={{ background: issueEntries.length ? '#e11d48' : '#059669' }}>{pending ? '處理中…' : issueEntries.length ? `彙整 ${issueEntries.length} 個問題並退回央廚` : '全部核對完成，審核通過'}</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

function FileTextFallback() { return <div className="text-4xl">📋</div> }

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
  const unpaidExpense = data
    .filter(d => !d.hqPaid)
    .reduce((s, d) => s + hqReimbursementAmount(d), 0)

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
