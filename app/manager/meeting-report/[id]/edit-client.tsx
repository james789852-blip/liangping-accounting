'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, Save, Loader2, Sparkles, Plus, Trash2, Check, X,
  TrendingUp, Users, MessageSquare, Award, FileDown, Send,
} from 'lucide-react'
import RichTextEditor from '@/components/manager/rich-text-editor'
import SectionPhotoGrid from '@/components/manager/section-photo-grid'
import {
  updateMeetingReport, submitMeetingReport, unsubmitMeetingReport,
  generateOperationsReview, addActionItem, updateActionItemDescription,
  resolveActionItem, deleteActionItem,
  type MeetingReport, type ActionItem,
} from '@/app/actions/meeting-reports'

interface Props {
  report: MeetingReport
  storeName: string
  thisReportItems: ActionItem[]
  carryOverItems: ActionItem[]
}

export default function EditClient({ report: initial, storeName, thisReportItems: initThis, carryOverItems: initCarry }: Props) {
  const router = useRouter()
  const [report, setReport] = useState(initial)
  const [thisItems, setThisItems] = useState<ActionItem[]>(initThis)
  const [carryItems, setCarryItems] = useState<ActionItem[]>(initCarry)
  const [savingField, setSavingField] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [pending, startTransition] = useTransition()

  const isSubmitted = report.status === 'submitted'

  // ─── 共用：保存單一欄位 ───
  async function saveField(field: keyof MeetingReport, value: any) {
    setSavingField(field as string)
    try {
      const patch: any = { [field]: value }
      const r = await updateMeetingReport(report.id, patch)
      if ('error' in r) { toast.error(r.error); return false }
      setReport(prev => ({ ...prev, [field]: value } as MeetingReport))
      return true
    } finally {
      setTimeout(() => setSavingField(null), 400)
    }
  }

  // 防抖 save：富文本/文字方塊用，避免太頻繁打 server
  const debounceTimers = useState<Record<string, any>>({})[0]
  function debouncedSave(field: keyof MeetingReport, value: any, delay = 800) {
    setReport(prev => ({ ...prev, [field]: value } as MeetingReport))
    if (debounceTimers[field as string]) clearTimeout(debounceTimers[field as string])
    debounceTimers[field as string] = setTimeout(() => {
      saveField(field, value)
    }, delay)
  }

  // ─── 區塊 1：自動產生營運回顧 ───
  async function handleGenerate() {
    setGenerating(true)
    try {
      const r = await generateOperationsReview(report.store_id, report.period_start, report.period_end)
      if ('error' in r) { toast.error(r.error); return }
      await saveField('operations_review_html', r.html)
      toast.success('已產生最新營運數字')
    } finally {
      setGenerating(false)
    }
  }

  // ─── 區塊 6：行動項目 CRUD ───
  const [newItemDesc, setNewItemDesc] = useState('')
  async function handleAddItem() {
    const desc = newItemDesc.trim()
    if (!desc) return
    const r = await addActionItem(report.id, report.store_id, desc)
    if ('error' in r) { toast.error(r.error); return }
    setThisItems(prev => [...prev, r.item])
    setNewItemDesc('')
  }

  async function handleResolveCarry(item: ActionItem, status: 'open' | 'resolved' | 'dropped', note: string) {
    const r = await resolveActionItem(item.id, report.id, note, status)
    if ('error' in r) { toast.error(r.error); return }
    if (status === 'open') {
      setCarryItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'open', resolution_note: note, resolved_in_report_id: null, resolved_at: null } : i))
    } else {
      setCarryItems(prev => prev.map(i => i.id === item.id ? { ...i, status, resolution_note: note, resolved_in_report_id: report.id } : i))
    }
  }

  async function handleDeleteItem(itemId: string) {
    const r = await deleteActionItem(itemId)
    if ('error' in r) { toast.error(r.error); return }
    setThisItems(prev => prev.filter(i => i.id !== itemId))
  }

  // ─── 提交 / 取消提交 ───
  async function handleSubmit() {
    if (!confirm('確定提交本份會議報告？提交後仍可取消提交修改。')) return
    startTransition(async () => {
      const r = await submitMeetingReport(report.id)
      if ('error' in r) { toast.error(r.error); return }
      setReport(prev => ({ ...prev, status: 'submitted' }))
      toast.success('已提交')
    })
  }
  async function handleUnsubmit() {
    startTransition(async () => {
      const r = await unsubmitMeetingReport(report.id)
      if ('error' in r) { toast.error(r.error); return }
      setReport(prev => ({ ...prev, status: 'draft' }))
      toast.success('已改回草稿')
    })
  }

  // ─── PDF 匯出 ───
  async function handleExportPDF() {
    const res = await fetch(`/api/meeting-report/${report.id}/pdf`)
    if (!res.ok) { toast.error('匯出失敗：' + await res.text()); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `會議報告_${report.period_start}_${report.period_end}.pdf`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-full pb-32 lg:pb-12" style={{ background: '#fafafa' }}>

      {/* Header */}
      <div className="bg-white px-5 py-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
        <Link href="/manager/meeting-report" className="text-xs inline-flex items-center gap-1 mb-2" style={{ color: '#71717a' }}>
          <ArrowLeft className="h-3 w-3" /> 返回列表
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold flex items-center gap-2" style={{ color: '#18181b', letterSpacing: '-0.02em' }}>
              📋 雙週會議報告
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>{storeName}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: isSubmitted ? '#D1FAE5' : '#FEF3C7', color: isSubmitted ? '#047857' : '#B45309' }}>
              {isSubmitted ? '已提交' : '草稿'}
            </span>
            {savingField && <span className="text-[11px] flex items-center gap-1" style={{ color: '#a1a1aa' }}><Loader2 className="h-3 w-3 animate-spin" />儲存中</span>}
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-3xl mx-auto space-y-4">

        {/* 期間 */}
        <Card>
          <SectionTitle icon="📅" title="會議資訊" />
          <div className="grid grid-cols-3 gap-3">
            <Field label="起始日期">
              <input type="date" value={report.period_start}
                disabled={isSubmitted}
                onChange={e => saveField('period_start', e.target.value)}
                style={inputStyle} />
            </Field>
            <Field label="結束日期">
              <input type="date" value={report.period_end}
                disabled={isSubmitted}
                onChange={e => saveField('period_end', e.target.value)}
                style={inputStyle} />
            </Field>
            <Field label="會議日期">
              <input type="date" value={report.meeting_date ?? ''}
                disabled={isSubmitted}
                onChange={e => saveField('meeting_date', e.target.value)}
                style={inputStyle} />
            </Field>
          </div>
        </Card>

        {/* 區塊 1：營運回顧 */}
        <Card>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <SectionTitle icon="📊" title="一、主要營運回顧" inline />
            <button onClick={handleGenerate} disabled={generating || isSubmitted}
              className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
              style={{ background: '#FEF3C7', color: '#B45309', border: '1.5px solid #FBBF24', cursor: generating || isSubmitted ? 'not-allowed' : 'pointer', opacity: isSubmitted ? 0.5 : 1 }}>
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              系統自動產生
            </button>
          </div>
          <p className="text-[11px] mb-2" style={{ color: '#a1a1aa' }}>
            兩週生意比較由系統自動產生。點「系統自動產生」會即時拉資料庫最新數字並覆蓋此區塊。
          </p>
          <RichTextEditor
            value={report.operations_review_html ?? ''}
            onChange={html => debouncedSave('operations_review_html', html)}
            placeholder="點上方按鈕由系統自動產生，或自行編輯…"
            minHeight={200}
          />
        </Card>

        {/* 區塊 2：客訴反應 */}
        <Card>
          <SectionTitle icon="💬" title="二、客訴反應 / Google 評論" />
          <RichTextEditor
            value={report.customer_feedback_html ?? ''}
            onChange={html => debouncedSave('customer_feedback_html', html)}
            placeholder="顧客反應、客訴內容、Google 評論回覆..."
          />
          <div className="mt-3">
            <p className="text-xs font-medium mb-2" style={{ color: '#52525b' }}>相關照片</p>
            <SectionPhotoGrid storeId={report.store_id}
              photos={report.customer_feedback_photos ?? []}
              onChange={photos => saveField('customer_feedback_photos', photos)} />
          </div>
        </Card>

        {/* 區塊 3：同仁狀況 */}
        <Card>
          <SectionTitle icon="👥" title="三、同仁狀況" />
          <RichTextEditor
            value={report.staff_status_html ?? ''}
            onChange={html => debouncedSave('staff_status_html', html)}
            placeholder="排班、出勤、表現、人員異動..."
          />
          <div className="mt-3">
            <p className="text-xs font-medium mb-2" style={{ color: '#52525b' }}>相關照片</p>
            <SectionPhotoGrid storeId={report.store_id}
              photos={report.staff_status_photos ?? []}
              onChange={photos => saveField('staff_status_photos', photos)} />
          </div>
        </Card>

        {/* 區塊 4：產品品質 */}
        <Card>
          <SectionTitle icon="🍴" title="四、產品品質" />
          <RichTextEditor
            value={report.product_quality_html ?? ''}
            onChange={html => debouncedSave('product_quality_html', html)}
            placeholder="食材品質、出餐速度、客訴、改善方案..."
          />
          <div className="mt-3">
            <p className="text-xs font-medium mb-2" style={{ color: '#52525b' }}>相關照片</p>
            <SectionPhotoGrid storeId={report.store_id}
              photos={report.product_quality_photos ?? []}
              onChange={photos => saveField('product_quality_photos', photos)} />
          </div>
        </Card>

        {/* 區塊 5：上次提出的問題追蹤 */}
        {carryItems.length > 0 && (
          <Card>
            <SectionTitle icon="🔄" title="五、上次提出的問題追蹤" />
            <p className="text-[11px] mb-3" style={{ color: '#a1a1aa' }}>
              從上次會議結轉過來的待解決事項，請填寫本次進度。
            </p>
            <div className="space-y-2">
              {carryItems.map(item => (
                <CarryOverItem key={item.id} item={item} disabled={isSubmitted}
                  onUpdate={(status, note) => handleResolveCarry(item, status, note)} />
              ))}
            </div>
          </Card>
        )}

        {/* 區塊 6：本次提出的改善項目 */}
        <Card>
          <SectionTitle icon="🎯" title={`${carryItems.length > 0 ? '六' : '五'}、本次提出的改善項目`} />
          <div className="space-y-2 mb-3">
            {thisItems.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: '#a1a1aa' }}>還沒新增改善項目</p>
            )}
            {thisItems.map((item, idx) => (
              <ThisActionItem key={item.id} index={idx + 1} item={item} disabled={isSubmitted}
                onChange={d => { setThisItems(prev => prev.map(p => p.id === item.id ? { ...p, description: d } : p)); updateActionItemDescription(item.id, d) }}
                onDelete={() => handleDeleteItem(item.id)} />
            ))}
          </div>
          {!isSubmitted && (
            <div className="flex gap-2">
              <input value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddItem() }}
                placeholder="輸入待改善事項…"
                style={inputStyle} />
              <button onClick={handleAddItem} disabled={!newItemDesc.trim()}
                className="text-sm font-bold px-4 rounded-xl flex items-center gap-1 shrink-0"
                style={{ background: '#FEF3C7', color: '#B45309', border: '1.5px solid #FBBF24', cursor: newItemDesc.trim() ? 'pointer' : 'not-allowed', opacity: newItemDesc.trim() ? 1 : 0.5 }}>
                <Plus className="h-4 w-4" />新增
              </button>
            </div>
          )}
        </Card>

        {/* 其他備註 */}
        <Card>
          <SectionTitle icon="📝" title="其他備註（可選）" />
          <RichTextEditor
            value={report.notes_html ?? ''}
            onChange={html => debouncedSave('notes_html', html)}
            placeholder="任何想補充的內容..." />
          <div className="mt-3">
            <p className="text-xs font-medium mb-2" style={{ color: '#52525b' }}>相關照片</p>
            <SectionPhotoGrid storeId={report.store_id}
              photos={report.notes_photos ?? []}
              onChange={photos => saveField('notes_photos', photos)} />
          </div>
        </Card>

        {/* 底部操作 */}
        <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-white" style={{ borderTop: '1px solid #f4f4f5', boxShadow: '0 -4px 12px rgba(0,0,0,0.04)' }}>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleExportPDF}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold"
              style={{ background: '#18181b', color: 'white', border: 'none', cursor: 'pointer', minWidth: 120 }}>
              <FileDown className="h-4 w-4" />匯出 PDF
            </button>
            {isSubmitted ? (
              <button onClick={handleUnsubmit} disabled={pending}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold"
                style={{ background: '#F4F4F5', color: '#52525b', border: '1.5px solid #e4e4e7', cursor: pending ? 'not-allowed' : 'pointer', minWidth: 120 }}>
                取消提交
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={pending}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', border: 'none', cursor: pending ? 'not-allowed' : 'pointer', minWidth: 120 }}>
                <Send className="h-4 w-4" />提交報告
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 子元件 ────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f4f4f5' }}>
      {children}
    </div>
  )
}

function SectionTitle({ icon, title, inline = false }: { icon: string; title: string; inline?: boolean }) {
  return (
    <h2 className={`text-base font-bold ${inline ? '' : 'mb-3'}`} style={{ color: '#18181b' }}>
      <span className="mr-1.5">{icon}</span>{title}
    </h2>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', border: '1.5px solid #e4e4e7',
  borderRadius: 10, fontSize: 14, outline: 'none', background: 'white', fontFamily: 'inherit',
}

// 上次提出的問題追蹤
function CarryOverItem({ item, disabled, onUpdate }: {
  item: ActionItem
  disabled: boolean
  onUpdate: (status: 'open' | 'resolved' | 'dropped', note: string) => void
}) {
  const [note, setNote] = useState(item.resolution_note ?? '')
  const [debouncing, setDebouncing] = useState<any>(null)
  function noteChange(v: string) {
    setNote(v)
    if (debouncing) clearTimeout(debouncing)
    setDebouncing(setTimeout(() => onUpdate(item.status, v), 600))
  }
  const isResolved = item.status === 'resolved'
  const isDropped = item.status === 'dropped'
  return (
    <div className="p-3 rounded-xl"
      style={{ background: isResolved ? '#F0FDF4' : isDropped ? '#F4F4F5' : '#FFFBEB', border: '1px solid ' + (isResolved ? '#86EFAC' : isDropped ? '#e4e4e7' : '#FCD34D') }}>
      <p className="text-sm font-medium" style={{ color: '#18181b' }}>{item.description}</p>
      <div className="flex gap-1.5 mt-2 flex-wrap">
        <button disabled={disabled} onClick={() => onUpdate('open', note)}
          className="text-[11px] font-bold px-2 py-1 rounded-md"
          style={{ background: item.status === 'open' ? '#FEF3C7' : 'white', color: item.status === 'open' ? '#B45309' : '#71717a', border: '1px solid ' + (item.status === 'open' ? '#FBBF24' : '#e4e4e7'), cursor: disabled ? 'not-allowed' : 'pointer' }}>
          進行中
        </button>
        <button disabled={disabled} onClick={() => onUpdate('resolved', note)}
          className="text-[11px] font-bold px-2 py-1 rounded-md flex items-center gap-1"
          style={{ background: isResolved ? '#D1FAE5' : 'white', color: isResolved ? '#047857' : '#71717a', border: '1px solid ' + (isResolved ? '#86EFAC' : '#e4e4e7'), cursor: disabled ? 'not-allowed' : 'pointer' }}>
          <Check className="h-2.5 w-2.5" />已解決
        </button>
        <button disabled={disabled} onClick={() => onUpdate('dropped', note)}
          className="text-[11px] font-bold px-2 py-1 rounded-md flex items-center gap-1"
          style={{ background: isDropped ? '#F4F4F5' : 'white', color: isDropped ? '#52525b' : '#71717a', border: '1px solid #e4e4e7', cursor: disabled ? 'not-allowed' : 'pointer' }}>
          <X className="h-2.5 w-2.5" />放棄
        </button>
      </div>
      <textarea value={note} onChange={e => noteChange(e.target.value)}
        disabled={disabled}
        placeholder="本次進度說明…"
        style={{ width: '100%', marginTop: 8, padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', resize: 'vertical', minHeight: 44, outline: 'none', background: 'white' }} />
    </div>
  )
}

function ThisActionItem({ index, item, disabled, onChange, onDelete }: {
  index: number
  item: ActionItem
  disabled: boolean
  onChange: (desc: string) => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-xl" style={{ background: '#fafafa' }}>
      <span className="text-xs font-bold shrink-0 mt-2 ml-1" style={{ color: '#71717a', width: 18 }}>{index}.</span>
      <textarea defaultValue={item.description} disabled={disabled}
        onChange={e => onChange(e.target.value)}
        style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #e4e4e7', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 40, outline: 'none', background: 'white' }} />
      {!disabled && (
        <button onClick={onDelete}
          className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg"
          style={{ background: '#FEF2F2', color: '#B91C1C', border: 'none', cursor: 'pointer' }}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
