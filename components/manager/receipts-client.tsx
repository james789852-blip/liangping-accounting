'use client'

import { useState } from 'react'
import { FileText, Plus, Trash2, ChevronDown, ChevronUp, Edit2, Check, X, Receipt } from 'lucide-react'
import { deleteReceipt, updateReceipt } from '@/app/actions/receipts'
import ReceiptUpload from './receipt-upload'
import { useRouter } from 'next/navigation'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'

interface ReceiptItem {
  id: string; item_name: string; amount: number; excel_column: string; item_category: string
}
interface ReceiptData {
  id: string; business_date: string; vendor_name: string; receipt_type: string
  total_amount: number; tax_amount: number; photo_url: string; status: string
  notes: string; created_at: string; receipt_items: ReceiptItem[]
}
interface MappingMap { [k: string]: { excel_column: string; item_category: string } }
interface Props {
  storeId: string; storeName: string; today: string; receipts: ReceiptData[]; mappings: MappingMap
}

const TYPE_LABEL: Record<string, string> = {
  invoice: '統一發票', receipt: '收據', delivery_note: '估價單',
}
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  draft:     { bg: '#f1f5f9', color: '#475569' },
  submitted: { bg: '#eef2ff', color: '#4338ca' },
  verified:  { bg: '#d1fae5', color: '#065f46' },
}
const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', submitted: '已送出', verified: '已確認',
}

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

function formatDate(d: string) {
  const dt = new Date(d + 'T00:00:00+08:00')
  return `${dt.getMonth() + 1}/${dt.getDate()}（${['日','一','二','三','四','五','六'][dt.getDay()]}）`
}

interface EditItem { item_name: string; amount: number; excel_column: string; item_category: string }

function inputStyle(extra?: object) {
  return {
    padding: '9px 12px', border: '1.5px solid #e4e4e7', borderRadius: '10px',
    fontSize: '14px', background: 'white', outline: 'none', fontFamily: 'inherit',
    width: '100%', ...extra,
  }
}

function ReceiptCard({ receipt, onDelete, onUpdated }: {
  receipt: ReceiptData; onDelete: () => void; onUpdated: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showPhoto, setShowPhoto] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [editVendor, setEditVendor] = useState(receipt.vendor_name)
  const [editType, setEditType] = useState(receipt.receipt_type)
  const [editDate, setEditDate] = useState(receipt.business_date)
  const [editTotal, setEditTotal] = useState(receipt.total_amount)
  const [editTax, setEditTax] = useState(receipt.tax_amount)
  const [editNotes, setEditNotes] = useState(receipt.notes ?? '')
  const [editItems, setEditItems] = useState<EditItem[]>(
    receipt.receipt_items.map(i => ({
      item_name: i.item_name, amount: i.amount,
      excel_column: i.excel_column ?? '', item_category: i.item_category ?? '食材',
    }))
  )

  function startEdit() {
    setEditVendor(receipt.vendor_name); setEditType(receipt.receipt_type)
    setEditDate(receipt.business_date); setEditTotal(receipt.total_amount)
    setEditTax(receipt.tax_amount); setEditNotes(receipt.notes ?? '')
    setEditItems(receipt.receipt_items.map(i => ({
      item_name: i.item_name, amount: i.amount,
      excel_column: i.excel_column ?? '', item_category: i.item_category ?? '食材',
    })))
    setEditing(true); setExpanded(true)
  }

  async function handleSave() {
    setSaving(true)
    const result = await updateReceipt(receipt.id, {
      businessDate: editDate, vendorName: editVendor, receiptType: editType,
      totalAmount: editTotal, taxAmount: editTax, photoUrl: receipt.photo_url,
      notes: editNotes, items: editItems.filter(i => i.item_name.trim()),
    })
    setSaving(false)
    if (result?.error) { alert('儲存失敗：' + result.error); return }
    setEditing(false); onUpdated()
  }

  async function handleDelete() {
    if (!confirm('確定要刪除這筆收據嗎？')) return
    setDeleting(true); await deleteReceipt(receipt.id); onDelete()
  }

  const st = STATUS_STYLE[receipt.status] ?? STATUS_STYLE.draft

  return (
    <div className="bg-white rounded-2xl overflow-hidden transition-all"
      style={{ border: editing ? '1.5px solid #6366f1' : '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-sm font-semibold" style={{ color: '#18181b' }}>
              {receipt.vendor_name || '（未填廠商）'}
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
              style={{ background: '#f8fafc', color: '#52525b' }}>
              {TYPE_LABEL[receipt.receipt_type] ?? receipt.receipt_type}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ background: st.bg, color: st.color }}>
              {STATUS_LABEL[receipt.status] ?? receipt.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tabular-nums" style={{ color: '#18181b' }}>
              ${fmt(receipt.total_amount)}
            </span>
            {receipt.tax_amount > 0 && (
              <span className="text-xs" style={{ color: '#a1a1aa' }}>含稅 ${fmt(receipt.tax_amount)}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {receipt.photo_url && (
            <button onClick={() => setShowPhoto(!showPhoto)}
              className="h-8 w-8 flex items-center justify-center rounded-xl transition-colors"
              style={{ color: showPhoto ? '#4338ca' : '#a1a1aa', background: showPhoto ? '#eef2ff' : 'transparent' }}>
              <FileText className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)}
            className="h-8 w-8 flex items-center justify-center rounded-xl transition-colors hover:bg-slate-50"
            style={{ color: '#a1a1aa' }}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button onClick={startEdit}
            className="h-8 w-8 flex items-center justify-center rounded-xl transition-colors hover:bg-indigo-50"
            style={{ color: editing ? '#4338ca' : '#a1a1aa' }}>
            <Edit2 className="h-4 w-4" />
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="h-8 w-8 flex items-center justify-center rounded-xl transition-colors hover:bg-red-50 disabled:opacity-40"
            style={{ color: '#a1a1aa' }}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Photo */}
      {showPhoto && receipt.photo_url && (
        <div className="px-4 pb-3">
          <img src={receipt.photo_url} alt="receipt"
            className="w-full max-h-64 object-contain rounded-xl"
            style={{ background: '#f8fafc', border: '1px solid #f4f4f5' }} />
        </div>
      )}

      {/* View mode */}
      {expanded && !editing && (
        <div className="px-4 pb-4 pt-3 space-y-2" style={{ borderTop: '1px solid #f4f4f5' }}>
          {receipt.receipt_items.length > 0 ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>品項明細</p>
              {receipt.receipt_items.map(item => (
                <div key={item.id} className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: '#52525b' }}>{item.item_name}</span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: '#18181b' }}>${fmt(item.amount)}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="text-xs" style={{ color: '#a1a1aa' }}>無品項明細</p>
          )}
          {receipt.notes && (
            <p className="text-xs px-3 py-2 rounded-xl" style={{ color: '#52525b', background: '#f8fafc' }}>{receipt.notes}</p>
          )}
          <p className="text-[10px]" style={{ color: '#a1a1aa' }}>
            {new Date(receipt.created_at).toLocaleString('zh-TW', {
              timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            })}
          </p>
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="px-4 pb-4 pt-4 space-y-3" style={{ borderTop: '1.5px solid #eef2ff', background: '#fafbff' }}>
          <p className="text-xs font-bold" style={{ color: '#4338ca' }}>編輯單據</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: '#71717a' }}>廠商名稱</label>
              <input style={inputStyle()} value={editVendor} onChange={e => setEditVendor(e.target.value)} placeholder="廠商" />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: '#71717a' }}>單據類型</label>
              <select style={inputStyle()} value={editType} onChange={e => setEditType(e.target.value)}>
                <option value="invoice">統一發票</option>
                <option value="receipt">收據</option>
                <option value="delivery_note">估價單</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: '#71717a' }}>業務日期</label>
              <input type="date" style={inputStyle()} value={editDate} onChange={e => setEditDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: '#71717a' }}>總金額</label>
              <input type="number" style={inputStyle({ textAlign: 'right' })}
                value={editTotal || ''} onChange={e => setEditTotal(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: '#71717a' }}>稅額</label>
              <input type="number" style={inputStyle({ textAlign: 'right' })}
                value={editTax || ''} placeholder="0" onChange={e => setEditTax(parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>品項明細</p>
              <button onClick={() => setEditItems(prev => [...prev, { item_name: '', amount: 0, excel_column: '', item_category: '食材' }])}
                className="text-xs font-semibold flex items-center gap-1" style={{ color: '#4338ca' }}>
                <Plus className="h-3 w-3" /> 新增品項
              </button>
            </div>
            <div className="space-y-1.5">
              {editItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_5rem_1fr_1.5rem] gap-1.5 items-center">
                  <input style={inputStyle({ padding: '7px 10px', fontSize: '13px' })}
                    placeholder="品項名稱" value={item.item_name}
                    onChange={e => setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, item_name: e.target.value } : it))} />
                  <input type="number" style={inputStyle({ padding: '7px 10px', fontSize: '13px', textAlign: 'right' })}
                    placeholder="金額" value={item.amount || ''}
                    onChange={e => setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, amount: parseFloat(e.target.value) || 0 } : it))} />
                  <select style={inputStyle({ padding: '7px 6px', fontSize: '12px' })}
                    value={item.excel_column}
                    onChange={e => setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, excel_column: e.target.value } : it))}>
                    <option value="">欄位</option>
                    {Object.entries(EXCEL_COLUMNS).map(([cat, cols]) => (
                      <optgroup key={cat} label={cat}>
                        {(cols as string[]).map(col => <option key={col} value={col}>{col}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <button onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))}
                    className="flex items-center justify-center h-8 w-8 rounded-lg transition-colors hover:bg-red-50"
                    style={{ color: '#a1a1aa' }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {editItems.length === 0 && (
                <p className="text-xs text-center py-2" style={{ color: '#a1a1aa' }}>無品項（點上方新增）</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: '#71717a' }}>備註</label>
            <textarea style={{ ...inputStyle(), height: '64px', resize: 'none' }}
              value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="備註（選填）" />
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 12px rgba(99,102,241,0.25)' }}>
              <Check className="h-4 w-4" />{saving ? '儲存中...' : '儲存修改'}
            </button>
            <button onClick={() => setEditing(false)}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReceiptsClient({ storeId, storeName, today, receipts: initial, mappings }: Props) {
  const [receipts, setReceipts] = useState(initial)
  const [showUpload, setShowUpload] = useState(false)
  const router = useRouter()

  function handleSaved() { setShowUpload(false); router.refresh() }

  const grouped = receipts.reduce<Record<string, ReceiptData[]>>((acc, r) => {
    if (!acc[r.business_date]) acc[r.business_date] = []
    acc[r.business_date].push(r); return acc
  }, {})
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const todayCount = receipts.filter(r => r.business_date === today).length
  const todayTotal = receipts.filter(r => r.business_date === today).reduce((s, r) => s + r.total_amount, 0)

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* 頁首 */}
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between max-w-xl mx-auto">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
              <Receipt className="h-3.5 w-3.5" />
              發票收據
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>
              {storeName}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>{today}</p>
          </div>
          {!showUpload && (
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 12px rgba(99,102,241,0.25)' }}>
              <Plus className="h-4 w-4" /> 新增
            </button>
          )}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4 pb-28">

        {/* 今日統計 */}
        {!showUpload && todayCount > 0 && (
          <div className="bg-white rounded-2xl p-4 relative overflow-hidden"
            style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div className="absolute left-0 top-0 w-1 h-full rounded-l-2xl" style={{ background: '#6366f1' }} />
            <div className="flex items-center justify-between pl-2">
              <div>
                <p className="text-xs font-medium" style={{ color: '#71717a' }}>今日單據</p>
                <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>共 {todayCount} 筆</p>
              </div>
              <p className="text-2xl font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(todayTotal)}</p>
            </div>
          </div>
        )}

        {/* 上傳表單 */}
        {showUpload && (
          <div className="bg-white rounded-2xl p-5" style={{ border: '1.5px solid #6366f1', boxShadow: '0 4px 16px rgba(99,102,241,0.1)' }}>
            <ReceiptUpload storeId={storeId} today={today} mappings={mappings}
              onSaved={handleSaved} onCancel={() => setShowUpload(false)} />
          </div>
        )}

        {/* 收據列表 */}
        {dates.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-20 w-20 rounded-3xl flex items-center justify-center mx-auto mb-4"
              style={{ background: '#f1f5f9' }}>
              <Receipt className="h-9 w-9" style={{ color: '#a1a1aa' }} />
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: '#52525b' }}>尚無單據紀錄</p>
            <p className="text-xs" style={{ color: '#a1a1aa' }}>點右上角「新增」上傳第一張收據</p>
          </div>
        ) : (
          dates.map(date => (
            <div key={date} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-bold" style={{ color: '#a1a1aa' }}>
                  {date === today ? `今天 ${formatDate(date)}` : formatDate(date)}
                </p>
                <p className="text-xs font-semibold tabular-nums" style={{ color: '#52525b' }}>
                  ${fmt(grouped[date].reduce((s, r) => s + r.total_amount, 0))}
                </p>
              </div>
              {grouped[date].map(r => (
                <ReceiptCard key={r.id} receipt={r}
                  onDelete={() => router.refresh()} onUpdated={() => router.refresh()} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
