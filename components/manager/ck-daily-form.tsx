'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, CheckCircle2, ChevronDown, ChevronUp, Save, Send, Camera, X, ZoomIn } from 'lucide-react'
import { saveCKDailyRecord, confirmCKOrder } from '@/app/actions/ck'
import CKHelp from './ck-help'
import { uploadToStorage } from '@/app/actions/upload'
import { compressImage } from '@/lib/compress-image'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

/**
 * 央廚對帳列：顯示店家自報金額 + 央廚自輸入金額 + 比對狀態
 * 不一致時紅色警告，相符顯示綠色 ✓
 */
function CrossCheckRow({ order, ckDailyRecordId, disabled }: {
  order: MemberOrder; ckDailyRecordId: string | null; disabled: boolean
}) {
  const router = useRouter()
  const [editValue, setEditValue] = useState<string>(
    order.confirmed_amount != null ? String(order.confirmed_amount) : ''
  )
  const [saving, setSaving] = useState(false)

  const storeAmount = order.amount || 0
  const ckAmount = order.confirmed_amount
  const isConfirmed = ckAmount != null
  const matched = isConfirmed && ckAmount === storeAmount
  const diff = isConfirmed ? (ckAmount - storeAmount) : 0

  async function save() {
    if (!ckDailyRecordId) { toast.error('請先儲存央廚日報'); return }
    const num = parseInt(editValue) || 0
    setSaving(true)
    const r = await confirmCKOrder({
      ckDailyRecordId,
      storeId: order.store_id,
      confirmedAmount: editValue === '' ? null : num,
    })
    setSaving(false)
    if ('error' in r && r.error) toast.error(r.error)
    else { toast.success('已對帳'); router.refresh() }
  }

  return (
    <div className="px-4 py-3" style={{ borderBottom: '1px solid #f9f9f9' }}>
      {/* 店家名稱 + 狀態 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold flex-1" style={{ color: '#18181b' }}>{order.store_name}</span>
        {!order.submitted ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: '#f4f4f5', color: '#a1a1aa' }}>店家未送出</span>
        ) : matched ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1"
            style={{ background: '#d1fae5', color: '#047857' }}>
            <CheckCircle2 className="h-3 w-3" />對帳完成
          </span>
        ) : isConfirmed ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: '#ffe4e6', color: '#be123c' }}>⚠ 差 {diff > 0 ? '+' : ''}{fmt(diff)}</span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: '#fef3c7', color: '#92400e' }}>待對帳</span>
        )}
      </div>

      {/* 兩欄並列：店家自報 vs 央廚對帳 */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg px-3 py-2" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#a1a1aa' }}>店家自報</p>
          <p className="font-bold tabular-nums" style={{ color: storeAmount > 0 ? '#18181b' : '#d4d4d8' }}>
            {storeAmount > 0 ? `$${fmt(storeAmount)}` : '—'}
          </p>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: matched ? '#d1fae5' : isConfirmed ? '#ffe4e6' : '#fef3c7', border: '1px solid #f4f4f5' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#a1a1aa' }}>央廚對帳</p>
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold" style={{ color: '#52525b' }}>$</span>
            <input
              type="number" inputMode="numeric" placeholder="輸入"
              value={editValue} onChange={e => setEditValue(e.target.value)}
              disabled={disabled || saving}
              style={{ width: '100%', padding: '2px 4px', border: 'none', background: 'transparent', fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', outline: 'none', fontFamily: 'inherit', color: '#18181b' }}
            />
          </div>
        </div>
      </div>

      {/* 動作按鈕 */}
      <div className="flex gap-2 mt-2">
        <button onClick={save} disabled={disabled || saving || !ckDailyRecordId}
          className="flex-1 py-2 rounded-lg text-xs font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: (disabled || saving) ? 0.6 : 1 }}>
          {saving ? '處理中…' : isConfirmed ? '更新對帳' : '確認對帳'}
        </button>
        {isConfirmed && !disabled && (
          <button onClick={() => { setEditValue(''); save() }} disabled={saving}
            className="px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ background: 'white', border: '1px solid #e4e4e7', color: '#71717a', cursor: 'pointer', fontFamily: 'inherit' }}>
            取消
          </button>
        )}
      </div>

      {!ckDailyRecordId && (
        <p className="text-[10px] mt-2" style={{ color: '#a1a1aa' }}>💡 請先在下方按「儲存草稿」建立日報，才能對帳</p>
      )}
    </div>
  )
}

interface MemberOrder { store_id: string; store_name: string; amount: number; submitted: boolean; confirmed_amount?: number | null }
interface ExternalStore { id: string; name: string }
interface ExternalOrder { name: string; amount: number }
interface Expense { id: string; category: '食材' | '耗材' | '雜項'; item_name: string; amount: number; payer_name: string; vendor_group: string; doc_type: string; note: string }
interface ExistingRecord {
  id: string
  payer_name?: string
  note?: string
  status: string
  externalOrders: ExternalOrder[]
  expenses: Expense[]
  receiptPhotoUrls?: string[]
}

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  '食材': { bg: '#fef3c7', text: '#92400e' },
  '耗材': { bg: '#ecfdf5', text: '#047857' },
  '雜項': { bg: '#f4f4f5', text: '#52525b' },
}

interface MappingItem { item_name: string; vendor_group: string | null; item_category: string; excel_column: string; sort_order: number | null }
interface ReceiptCat { id: string; name: string; vendors: { id: string; name: string }[] }
interface Props {
  ckStoreId: string
  ckStoreName: string
  date: string
  realToday?: string
  isBackfill?: boolean
  memberOrders: MemberOrder[]
  externalStores: ExternalStore[]
  existing: ExistingRecord | null
  vendorGroups?: { id: string; name: string; doc_type: string | null }[]
  mappingItems?: MappingItem[]
  receiptCategories?: ReceiptCat[]
}

export default function CKDailyForm({ ckStoreId, ckStoreName, date, realToday, isBackfill, memberOrders, externalStores, existing, vendorGroups = [], mappingItems = [], receiptCategories = [] }: Props) {
  const router = useRouter()
  const isLocked = existing?.status === 'submitted'
  const draftKey = `lp_ck_daily_draft:${ckStoreId}:${date}`

  const [payerName, setPayerName] = useState(existing?.payer_name ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 體系外叫貨
  const [extOrders, setExtOrders] = useState<ExternalOrder[]>(
    existing?.externalOrders ?? externalStores.map(s => ({ name: s.name, amount: 0 }))
  )

  // 支出明細
  const [expenses, setExpenses] = useState<Expense[]>(existing?.expenses ?? [])
  const [newExpense, setNewExpense] = useState<{
    category: '食材' | '耗材' | '雜項'; item_name: string; amount: string; payer_name: string; vendor_group: string; doc_type: string; note: string
  }>({
    category: '食材', item_name: '', amount: '', payer_name: '', vendor_group: '', doc_type: '發票', note: '',
  })
  // 支出：類別 → 廠商 → 品項 三層 dropdown（跟店面版一致）
  const [activeCat, setActiveCat] = useState<string>(receiptCategories[0]?.name ?? '廠商類別')
  const [activeVendor, setActiveVendor] = useState<string>('')

  // 收據照片
  const [photoUrls, setPhotoUrls] = useState<string[]>(existing?.receiptPhotoUrls ?? [])
  const [photoUploading, setPhotoUploading] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // 顯示折疊
  const [showMember, setShowMember] = useState(true)
  const [showExternal, setShowExternal] = useState(true)
  const [showExpenses, setShowExpenses] = useState(true)

  const vendorOptions = receiptCategories.find(c => c.name === activeCat)?.vendors ?? []
  const expenseItemOptions = useMemo(() => {
    if (!activeVendor) return []
    return mappingItems
      .filter(m => (m.vendor_group ?? '') === activeVendor)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.item_name.localeCompare(b.item_name, 'zh-Hant'))
  }, [activeVendor, mappingItems])
  const hasMappedExpenseItems = expenseItemOptions.length > 0
  const useVendorAsItem = activeCat === '雜項'

  useEffect(() => {
    if (isLocked || typeof window === 'undefined') return
    const raw = window.localStorage.getItem(draftKey)
    if (!raw) return
    try {
      const draft = JSON.parse(raw)
      if (draft?.ckStoreId !== ckStoreId || draft?.date !== date) return
      if (Array.isArray(draft.extOrders)) setExtOrders(draft.extOrders)
      if (Array.isArray(draft.expenses)) setExpenses(draft.expenses)
      if (Array.isArray(draft.photoUrls)) setPhotoUrls(draft.photoUrls)
      if (typeof draft.payerName === 'string') setPayerName(draft.payerName)
      if (typeof draft.note === 'string') setNote(draft.note)
      if (draft.newExpense && typeof draft.newExpense === 'object') {
        setNewExpense(prev => ({ ...prev, ...draft.newExpense }))
      }
      if (typeof draft.activeCat === 'string') setActiveCat(draft.activeCat)
      if (typeof draft.activeVendor === 'string') setActiveVendor(draft.activeVendor)
      toast.info('已恢復上次未儲存的央廚資料')
    } catch {
      window.localStorage.removeItem(draftKey)
    }
  }, [ckStoreId, date, draftKey, isLocked])

  useEffect(() => {
    if (isLocked || typeof window === 'undefined') return
    const timer = window.setTimeout(() => {
      const hasDraftContent =
        payerName.trim() ||
        note.trim() ||
        photoUrls.length > 0 ||
        expenses.length > 0 ||
        extOrders.some(o => Number(o.amount || 0) > 0) ||
        newExpense.item_name.trim() ||
        newExpense.amount ||
        newExpense.payer_name.trim() ||
        newExpense.note.trim()
      if (!hasDraftContent) {
        window.localStorage.removeItem(draftKey)
        return
      }
      window.localStorage.setItem(draftKey, JSON.stringify({
        ckStoreId,
        date,
        savedAt: new Date().toISOString(),
        payerName,
        note,
        extOrders,
        expenses,
        newExpense,
        activeCat,
        activeVendor,
        photoUrls,
      }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [activeCat, activeVendor, ckStoreId, date, draftKey, expenses, extOrders, isLocked, newExpense, note, payerName, photoUrls])

  const memberTotal = memberOrders.reduce((s, o) => s + o.amount, 0)
  const extTotal = extOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0)
  const revenueTotal = memberTotal + extTotal
  const expenseTotal = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const balance = revenueTotal - expenseTotal

  function updateExtAmount(name: string, val: string) {
    setExtOrders(prev => prev.map(o => o.name === name ? { ...o, amount: Number(val) || 0 } : o))
  }

  function addExpense() {
    if (!newExpense.item_name.trim() || !newExpense.amount) { toast.error('請填寫品項名稱與金額'); return }
    setExpenses(prev => [...prev, {
      id: crypto.randomUUID(),
      category: newExpense.category,
      item_name: newExpense.item_name.trim(),
      amount: Number(newExpense.amount) || 0,
      payer_name: newExpense.payer_name.trim(),
      vendor_group: newExpense.vendor_group.trim(),
      doc_type: newExpense.doc_type,
      note: newExpense.note.trim(),
    }])
    setNewExpense(p => ({ ...p, item_name: '', amount: '', payer_name: '', note: '' }))
  }

  function removeExpense(id: string) {
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  async function handlePhotoUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setPhotoUploading(true)
    for (const rawFile of Array.from(files)) {
      const file = await compressImage(rawFile)
      const fd = new FormData()
      fd.append('file', file)
      const path = `ck/${ckStoreId}/${date}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const result = await uploadToStorage(fd, 'receipts', path)
      if ('error' in result) { toast.error('上傳失敗：' + result.error) }
      else { setPhotoUrls(prev => [...prev, result.publicUrl]) }
    }
    setPhotoUploading(false)
  }

  async function handleSave(asSubmit = false) {
    if (asSubmit) setSubmitting(true); else setSaving(true)
    const r = await saveCKDailyRecord(ckStoreId, date, {
      payerName: payerName || undefined,
      note: note || undefined,
      status: asSubmit ? 'submitted' : 'draft',
      externalOrders: extOrders.filter(o => o.amount > 0),
      expenses: expenses.map(e => ({
        category: e.category, item_name: e.item_name, amount: e.amount,
        payer_name: e.payer_name || undefined,
        vendor_group: e.vendor_group || undefined,
        doc_type: e.doc_type || undefined,
        note: e.note || undefined,
      })),
      receiptPhotoUrls: photoUrls,
    })
    if (r.error) { toast.error('儲存失敗：' + r.error) }
    else {
      if (typeof window !== 'undefined') window.localStorage.removeItem(draftKey)
      toast.success(asSubmit ? '已送出！' : '草稿已儲存')
      router.refresh()
    }
    if (asSubmit) setSubmitting(false); else setSaving(false)
  }

  const INPUT = 'w-full px-3 py-2 rounded-xl text-sm outline-none border transition-colors'
  const INPUT_STYLE: React.CSSProperties = { border: '1.5px solid #e4e4e7', background: 'white', color: '#18181b', fontFamily: 'inherit' }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28 space-y-4">

      {/* 補帳日期切換 */}
      {isBackfill && realToday && (
        <div className="px-3 py-2 text-xs font-medium flex items-center justify-between gap-2 rounded-xl"
          style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
          <span>📅 你正在補做 <b>{date}</b> 的帳目（非今日）</span>
          <a href="/manager/ck" className="font-semibold underline shrink-0" style={{ color: '#78350F' }}>回到 {realToday}</a>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <span style={{ color: '#71717a' }}>日期</span>
        <input type="date" value={date} max={realToday ?? date}
          onChange={e => { const v = e.target.value; if (v) router.push(`/manager/ck?date=${v}`) }}
          className="px-2 py-1 rounded outline-none"
          style={{ border: '1px solid #e4e4e7', color: '#52525b', background: 'white' }}
          title="切換日期（可補做過往帳目）" />
      </div>

      {/* 狀態 banner */}
      {isLocked && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold"
          style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          今日帳目已送出
        </div>
      )}

      {/* 摘要卡片 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '叫貨收入', value: revenueTotal, color: '#10b981' },
          { label: '當日支出', value: expenseTotal, color: '#f97316' },
          { label: '當日結餘', value: balance, color: balance >= 0 ? '#F59E0B' : '#dc2626' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl px-4 py-3" style={{ border: '1px solid #f4f4f5' }}>
            <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#a1a1aa' }}>{label}</p>
            <p className="text-lg font-bold tabular-nums" style={{ color }}>${fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* 體系內店家叫貨 */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
        <button type="button" onClick={() => setShowMember(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: '#18181b' }}>體系內店家叫貨</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FFFBEB', color: '#92400E' }}>
              {memberOrders.length} 間 · ${fmt(memberTotal)}
            </span>
          </div>
          {showMember ? <ChevronUp className="h-4 w-4" style={{ color: '#a1a1aa' }} /> : <ChevronDown className="h-4 w-4" style={{ color: '#a1a1aa' }} />}
        </button>
        {showMember && (
          <div style={{ borderTop: '1px solid #f4f4f5' }}>
            {memberOrders.length === 0 ? (
              <p className="px-4 py-4 text-sm text-center" style={{ color: '#a1a1aa' }}>尚未設定服務店家</p>
            ) : (
              memberOrders.map(o => (
                <CrossCheckRow key={o.store_id}
                  order={o}
                  ckDailyRecordId={existing?.id ?? null}
                  disabled={isLocked}
                />
              ))
            )}
            <div className="flex items-center justify-between px-4 py-3" style={{ background: '#fafafa', borderTop: '1px solid #f4f4f5' }}>
              <span className="text-xs font-bold uppercase" style={{ color: '#a1a1aa' }}>體系內合計</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(memberTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* 體系外店家叫貨 */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
        <button type="button" onClick={() => setShowExternal(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: '#18181b' }}>體系外店家叫貨</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#f4f4f5', color: '#52525b' }}>
              ${fmt(extTotal)}
            </span>
          </div>
          {showExternal ? <ChevronUp className="h-4 w-4" style={{ color: '#a1a1aa' }} /> : <ChevronDown className="h-4 w-4" style={{ color: '#a1a1aa' }} />}
        </button>
        {showExternal && (
          <div style={{ borderTop: '1px solid #f4f4f5' }}>
            {extOrders.map(o => (
              <div key={o.name} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #f9f9f9' }}>
                <span className="flex-1 text-sm font-medium" style={{ color: '#18181b' }}>{o.name}</span>
                {isLocked ? (
                  <span className="text-sm font-bold tabular-nums" style={{ color: o.amount > 0 ? '#18181b' : '#a1a1aa' }}>
                    {o.amount > 0 ? `$${fmt(o.amount)}` : '—'}
                  </span>
                ) : (
                  <input type="number" min="0" placeholder="0"
                    className={INPUT} style={{ ...INPUT_STYLE, width: '120px', textAlign: 'right' }}
                    value={o.amount || ''}
                    onChange={e => updateExtAmount(o.name, e.target.value)}
                  />
                )}
              </div>
            ))}
            {!isLocked && (
              <div className="px-4 py-3" style={{ borderTop: extOrders.length > 0 ? '1px solid #f4f4f5' : 'none' }}>
                <p className="text-xs" style={{ color: '#a1a1aa' }}>
                  體系外店家清單請至「店家管理」設定，避免每日帳目異動影響 Excel 匯出欄位。
                </p>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-3" style={{ background: '#fafafa', borderTop: '1px solid #f4f4f5' }}>
              <span className="text-xs font-bold uppercase" style={{ color: '#a1a1aa' }}>體系外合計</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(extTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* 支出明細 */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
        <button type="button" onClick={() => setShowExpenses(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: '#18181b' }}>支出明細</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#fff1f2', color: '#dc2626' }}>
              {expenses.length} 筆 · ${fmt(expenseTotal)}
            </span>
          </div>
          {showExpenses ? <ChevronUp className="h-4 w-4" style={{ color: '#a1a1aa' }} /> : <ChevronDown className="h-4 w-4" style={{ color: '#a1a1aa' }} />}
        </button>
        {showExpenses && (
          <div style={{ borderTop: '1px solid #f4f4f5' }}>
            {expenses.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #f9f9f9' }}>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: CAT_COLORS[e.category]?.bg, color: CAT_COLORS[e.category]?.text }}>
                  {e.category}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm" style={{ color: '#18181b' }}>
                    {e.item_name}
                    {e.payer_name && <span className="ml-1.5 text-xs" style={{ color: '#a1a1aa' }}>（{e.payer_name}付）</span>}
                  </div>
                  {(e.vendor_group || e.doc_type) && (
                    <div className="text-[11px] mt-0.5" style={{ color: '#a1a1aa' }}>
                      {e.vendor_group || '未分類'}{e.doc_type ? ` · ${e.doc_type}` : ''}
                    </div>
                  )}
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: '#18181b' }}>${fmt(e.amount)}</span>
                {!isLocked && (
                  <button type="button" onClick={() => removeExpense(e.id)} style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {!isLocked && (
              <div className="px-4 py-4 space-y-2" style={{ borderTop: expenses.length > 0 ? '1px solid #f4f4f5' : 'none', background: '#fafafa' }}>
                {/* 類別 tab（廠商類別/雜項/其他） */}
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, receiptCategories.length)}, 1fr)` }}>
                  {receiptCategories.map(c => (
                    <button key={c.id} type="button"
                      onClick={() => {
                        setActiveCat(c.name); setActiveVendor('')
                        setNewExpense(p => ({ ...p, item_name: '', vendor_group: '' }))
                      }}
                      className="py-2 rounded-xl text-sm font-semibold"
                      style={{
                        background: activeCat === c.name ? '#FEF3C7' : 'white',
                        color: activeCat === c.name ? '#92400E' : '#52525b',
                        border: `1.5px solid ${activeCat === c.name ? 'transparent' : '#e4e4e7'}`,
                      }}>
                      {c.name}
                    </button>
                  ))}
                </div>
                {/* 廠商 dropdown（依當前類別動態） */}
                <select className={INPUT} style={INPUT_STYLE}
                  value={activeVendor}
                  onChange={e => {
                    const v = e.target.value
                    setActiveVendor(v)
                    const vgRec = vendorGroups.find(g => g.name === v)
                    const fallbackCategory = activeCat === '耗材' ? '耗材' : activeCat === '其他' || activeCat === '雜項' ? '雜項' : '食材'
                    if (activeCat === '雜項') {
                      setNewExpense(p => ({
                        ...p,
                        item_name: v,
                        vendor_group: v,
                        category: '雜項',
                        doc_type: vgRec?.doc_type ?? p.doc_type,
                      }))
                      return
                    }
                    setNewExpense(p => ({
                      ...p,
                      item_name: '',
                      vendor_group: v,
                      category: fallbackCategory,
                      doc_type: vgRec?.doc_type ?? p.doc_type,
                    }))
                  }}>
                  <option value="">— 選擇廠商/群組 —</option>
                  {vendorOptions.map(v => (
                    <option key={v.id} value={v.name}>{v.name}</option>
                  ))}
                </select>
                {/* 品項選擇：所有類別都可以選；無對應時用群組名稱當品項，避免無法新增 */}
                {!useVendorAsItem && (
                  <select className={INPUT} style={INPUT_STYLE}
                    value={newExpense.item_name}
                    disabled={!activeVendor}
                    onChange={e => {
                      const name = e.target.value
                      const m = expenseItemOptions.find(x => x.item_name === name)
                      const vgRec = vendorGroups.find(g => g.name === activeVendor)
                      const cat = (m?.item_category === '食材' || m?.item_category === '耗材' || m?.item_category === '雜項')
                        ? m.item_category as '食材' | '耗材' | '雜項'
                        : (activeCat === '耗材' ? '耗材' : activeCat === '其他' ? '雜項' : '食材') as '食材' | '耗材' | '雜項'
                      setNewExpense(p => ({
                        ...p,
                        item_name: name,
                        vendor_group: activeVendor,
                        category: cat,
                        doc_type: vgRec?.doc_type ?? p.doc_type,
                      }))
                    }}>
                    <option value="">{activeVendor ? '— 選擇品項 —' : '（先選廠商）'}</option>
                    {activeVendor && hasMappedExpenseItems
                      ? expenseItemOptions.map(m => <option key={m.item_name} value={m.item_name}>{m.item_name}</option>)
                      : activeVendor && <option value={activeVendor}>{activeVendor}</option>
                    }
                  </select>
                )}
                {activeVendor && useVendorAsItem && (
                  <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
                    雜項會直接以「{activeVendor}」作為品項名稱。
                  </p>
                )}
                {activeVendor && !useVendorAsItem && !hasMappedExpenseItems && (
                  <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
                    此群組尚未設定細項，會先以「{activeVendor}」作為品項名稱。
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min="0" className={INPUT} style={INPUT_STYLE} placeholder="金額"
                    value={newExpense.amount} onChange={e => setNewExpense(p => ({ ...p, amount: e.target.value }))} />
                  <input className={INPUT} style={INPUT_STYLE} placeholder="誰付（選填）"
                    value={newExpense.payer_name} onChange={e => setNewExpense(p => ({ ...p, payer_name: e.target.value }))} />
                </div>
                <input className={INPUT} style={INPUT_STYLE} placeholder="備注（選填，會顯示在 Excel 附註）"
                  value={newExpense.note} onChange={e => setNewExpense(p => ({ ...p, note: e.target.value }))} />
                <button type="button" onClick={addExpense}
                  className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl"
                  style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: 'white' }}>
                  <Plus className="h-3.5 w-3.5" />新增支出
                </button>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-3" style={{ background: '#fafafa', borderTop: '1px solid #f4f4f5' }}>
              <span className="text-xs font-bold uppercase" style={{ color: '#a1a1aa' }}>支出合計</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#dc2626' }}>${fmt(expenseTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* 收據照片 */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: '#18181b' }}>收據照片</span>
            {photoUrls.length > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#f0fdf4', color: '#15803d' }}>
                {photoUrls.length} 張
              </span>
            )}
          </div>
          {!isLocked && (
            <button type="button" onClick={() => photoInputRef.current?.click()}
              disabled={photoUploading}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl"
              style={{ background: '#fafafa', border: '1px solid #e4e4e7', color: '#52525b' }}>
              {photoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {photoUploading ? '上傳中…' : '新增照片'}
            </button>
          )}
        </div>
        <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => handlePhotoUpload(e.target.files)} />
        {photoUrls.length > 0 && (
          <div className="px-4 pb-4 grid grid-cols-3 gap-2" style={{ borderTop: '1px solid #f4f4f5' }}>
            {photoUrls.map((url, i) => (
              <div key={url} className="relative group" style={{ aspectRatio: '1' }}>
                <img src={url} alt={`收據 ${i + 1}`}
                  onClick={() => setLightboxUrl(url)}
                  className="w-full h-full object-cover rounded-xl cursor-pointer"
                  style={{ border: '1px solid #e4e4e7' }} />
                <button type="button"
                  onClick={() => setLightboxUrl(url)}
                  className="absolute bottom-1 right-1 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(0,0,0,0.5)' }}>
                  <ZoomIn className="h-3 w-3 text-white" />
                </button>
                {!isLocked && (
                  <button type="button"
                    onClick={() => setPhotoUrls(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <X className="h-3 w-3 text-white" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {photoUrls.length === 0 && (
          <p className="px-4 pb-4 text-sm text-center" style={{ color: '#a1a1aa' }}>尚未上傳收據照片</p>
        )}
      </div>

      {/* 圖片 Lightbox */}
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

      {/* 貨款代墊人 + 備註 */}
      {!isLocked && (
        <div className="bg-white rounded-2xl px-4 py-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#52525b' }}>今日貨款代墊人</label>
            <p className="text-[11px] mb-1.5" style={{ color: '#a1a1aa' }}>今日支出由誰先墊付，總公司隔天補款給此人</p>
            <input className={INPUT} style={INPUT_STYLE} placeholder="如：世輝"
              value={payerName} onChange={e => setPayerName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#52525b' }}>備註</label>
            <input className={INPUT} style={INPUT_STYLE} placeholder="其他備註"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
      )}
      {isLocked && (payerName || note) && (
        <div className="bg-white rounded-2xl px-4 py-4 space-y-2" style={{ border: '1px solid #f4f4f5' }}>
          {payerName && <p className="text-sm" style={{ color: '#18181b' }}>貨款代墊：<b>{payerName}</b></p>}
          {note && <p className="text-sm" style={{ color: '#52525b' }}>{note}</p>}
        </div>
      )}

      {/* 操作按鈕 */}
      {!isLocked && (
        <div className="flex gap-3">
          <button type="button" onClick={() => handleSave(false)} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold"
            style={{ background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b' }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            儲存草稿
          </button>
          <button type="button" onClick={() => handleSave(true)} disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            送出今日帳目
          </button>
        </div>
      )}
    </div>
  )
}
