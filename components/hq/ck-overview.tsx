'use client'

import { useState, useTransition, useRef } from 'react'
import { ChevronDown, ChevronUp, CheckCircle2, Loader2, Banknote, Download, Upload, FileSpreadsheet, Camera, X } from 'lucide-react'
import { markCKHQPaid } from '@/app/actions/ck'
import { toast } from 'sonner'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  submitted: { bg: '#f0fdf4', text: '#15803d', label: '已送出' },
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
  hqPaid: boolean
  hqPaidAt?: string | null
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

function PayButton({ ckStoreId, date, paid, expenseTotal }: { ckStoreId: string; date: string; paid: boolean; expenseTotal: number }) {
  const [isPending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState(paid)

  function handleToggle() {
    const next = !optimistic
    setOptimistic(next)
    startTransition(async () => {
      const r = await markCKHQPaid(ckStoreId, date, next)
      if (r.error) {
        setOptimistic(!next)
        toast.error('操作失敗：' + r.error)
      } else {
        toast.success(next ? '已標記補款完成' : '已取消補款記錄')
      }
    })
  }

  if (optimistic) {
    return (
      <div className="flex items-center justify-between px-4 py-3.5 rounded-2xl"
        style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#15803d' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#15803d' }}>已補款</p>
            <p className="text-xs" style={{ color: '#16a34a' }}>已包 ${fmt(expenseTotal)} 給央廚</p>
          </div>
        </div>
        <button type="button" onClick={handleToggle} disabled={isPending}
          className="text-xs px-2.5 py-1 rounded-lg transition-colors hover:bg-white/60"
          style={{ color: '#15803d' }}>
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : '取消'}
        </button>
      </div>
    )
  }

  return (
    <button type="button" onClick={handleToggle} disabled={isPending}
      className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-colors hover:opacity-80"
      style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.25)' }}>
      <div className="flex items-center gap-2">
        <Banknote className="h-4 w-4 text-white shrink-0" />
        <div className="text-left">
          <p className="text-sm font-semibold text-white">標記補款完成</p>
          <p className="text-xs text-white/80">應包 ${fmt(expenseTotal)}</p>
        </div>
      </div>
      {isPending
        ? <Loader2 className="h-4 w-4 text-white animate-spin" />
        : <span className="text-white/80 text-lg">→</span>}
    </button>
  )
}

function ExportSection({ ckStoreId, ckStoreName }: { ckStoreId: string; ckStoreName: string }) {
  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [exporting, setExporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [hasTemplate, setHasTemplate] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useState(() => {
    fetch(`/api/ck-stores/${ckStoreId}/template`)
      .then(r => r.json())
      .then(d => setHasTemplate(d.hasTemplate))
      .catch(() => {})
  })

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`/api/export/ck?ckStoreId=${ckStoreId}&month=${month}`)
      if (!res.ok) { toast.error('匯出失敗'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${ckStoreName}_${month.replace('-', '')}_央廚食耗.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('匯出完成')
    } catch { toast.error('匯出失敗') }
    finally { setExporting(false) }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/ck-stores/${ckStoreId}/template`, { method: 'POST', body: fd })
      if (!res.ok) { toast.error('上傳失敗'); return }
      setHasTemplate(true)
      toast.success('模板已更新，下次匯出自動套用')
    } catch { toast.error('上傳失敗') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <div>
      <p className="text-xs font-semibold mb-2" style={{ color: '#a1a1aa' }}>匯出 Excel</p>
      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
        {/* 模板狀態 + 上傳 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 shrink-0" style={{ color: hasTemplate ? '#10b981' : '#a1a1aa' }} />
            <span className="text-xs font-medium" style={{ color: '#52525b' }}>
              {hasTemplate === null ? '檢查中…' : hasTemplate ? '模板已設定' : '尚未上傳模板（將產生基本格式）'}
            </span>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleUpload} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl shrink-0 transition-colors hover:opacity-80"
            style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {hasTemplate ? '更換模板' : '上傳模板'}
          </button>
        </div>
        {/* 月份選擇 + 匯出 */}
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="flex-1 text-sm px-3 py-2 rounded-xl outline-none border transition-colors"
            style={{ border: '1.5px solid #e4e4e7', background: 'white', color: '#18181b', fontFamily: 'inherit' }}
          />
          <button type="button" onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl text-white shrink-0 transition-colors hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            匯出
          </button>
        </div>
      </div>
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
                  style={{ background: '#f0fdf4', color: '#15803d' }}>
                  <CheckCircle2 className="h-2.5 w-2.5" />補款完成
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
            { label: '叫貨收入', value: d.revenueTotal, color: '#10b981' },
            { label: '當日支出', value: d.expenseTotal, color: '#f97316' },
            { label: '當日結餘', value: d.balance, color: d.balance >= 0 ? '#F59E0B' : '#dc2626' },
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
                  { label: '叫貨收入', value: d.revenueTotal, color: '#10b981' },
                  { label: '當日支出', value: d.expenseTotal, color: '#f97316' },
                  { label: '當日結餘', value: d.balance, color: d.balance >= 0 ? '#F59E0B' : '#dc2626' },
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

              {/* 收據照片 */}
              {(d.receiptPhotoUrls?.length ?? 0) > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Camera className="h-3.5 w-3.5" style={{ color: '#a1a1aa' }} />
                    <p className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>收據照片（{d.receiptPhotoUrls!.length} 張）</p>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
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
                  />
                </div>
              )}

              {/* 匯出 Excel */}
              <ExportSection ckStoreId={d.ckStore.id} ckStoreName={d.ckStore.name} />
            </>
          ) : (
            <>
              <p className="text-sm text-center py-4" style={{ color: '#a1a1aa' }}>今日尚未填寫帳目</p>
              <ExportSection ckStoreId={d.ckStore.id} ckStoreName={d.ckStore.name} />
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
  const submittedCount = data.filter(d => d.status === 'submitted').length
  const paidCount = data.filter(d => d.hqPaid).length
  const unpaidExpense = data.filter(d => !d.hqPaid && d.expenseTotal > 0).reduce((s, d) => s + d.expenseTotal, 0)

  return (
    <div className="space-y-4">
      {/* 全體摘要 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '全體叫貨', value: `$${fmt(totalRevenue)}`, color: '#10b981' },
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
