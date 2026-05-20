'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { FileText, Plus, Trash2, Image, ChevronDown, ChevronUp, Receipt, Edit2, Check, X } from 'lucide-react'
import { deleteReceipt, updateReceipt } from '@/app/actions/receipts'
import ReceiptUpload from './receipt-upload'
import { useRouter } from 'next/navigation'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'

interface ReceiptItem {
  id: string
  item_name: string
  amount: number
  excel_column: string
  item_category: string
}

interface Receipt {
  id: string
  business_date: string
  vendor_name: string
  receipt_type: string
  total_amount: number
  tax_amount: number
  photo_url: string
  status: string
  notes: string
  created_at: string
  receipt_items: ReceiptItem[]
}

interface MappingMap { [k: string]: { excel_column: string; item_category: string } }

interface Props {
  storeId: string
  storeName: string
  today: string
  receipts: Receipt[]
  mappings: MappingMap
}

const TYPE_LABEL: Record<string, string> = {
  invoice: '統一發票',
  receipt: '收據',
  delivery_note: '估價單',
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  submitted: 'bg-blue-100 text-blue-700',
  verified: 'bg-green-100 text-green-700',
}

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  submitted: '已送出',
  verified: '已確認',
}

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

function formatDate(d: string) {
  const dt = new Date(d + 'T00:00:00+08:00')
  return `${dt.getMonth() + 1}/${dt.getDate()}（${['日','一','二','三','四','五','六'][dt.getDay()]}）`
}

interface EditItem { item_name: string; amount: number; excel_column: string; item_category: string }

function ReceiptCard({ receipt, onDelete, onUpdated }: {
  receipt: Receipt
  onDelete: () => void
  onUpdated: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showPhoto, setShowPhoto] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // edit state
  const [editVendor, setEditVendor] = useState(receipt.vendor_name)
  const [editType, setEditType] = useState(receipt.receipt_type)
  const [editDate, setEditDate] = useState(receipt.business_date)
  const [editTotal, setEditTotal] = useState(receipt.total_amount)
  const [editTax, setEditTax] = useState(receipt.tax_amount)
  const [editNotes, setEditNotes] = useState(receipt.notes ?? '')
  const [editItems, setEditItems] = useState<EditItem[]>(
    receipt.receipt_items.map(i => ({
      item_name: i.item_name,
      amount: i.amount,
      excel_column: i.excel_column ?? '',
      item_category: i.item_category ?? '食材',
    }))
  )

  function startEdit() {
    setEditVendor(receipt.vendor_name)
    setEditType(receipt.receipt_type)
    setEditDate(receipt.business_date)
    setEditTotal(receipt.total_amount)
    setEditTax(receipt.tax_amount)
    setEditNotes(receipt.notes ?? '')
    setEditItems(receipt.receipt_items.map(i => ({
      item_name: i.item_name,
      amount: i.amount,
      excel_column: i.excel_column ?? '',
      item_category: i.item_category ?? '食材',
    })))
    setEditing(true)
    setExpanded(true)
  }

  async function handleSave() {
    setSaving(true)
    const result = await updateReceipt(receipt.id, {
      businessDate: editDate,
      vendorName: editVendor,
      receiptType: editType,
      totalAmount: editTotal,
      taxAmount: editTax,
      photoUrl: receipt.photo_url,
      notes: editNotes,
      items: editItems.filter(i => i.item_name.trim()),
    })
    setSaving(false)
    if (result?.error) {
      alert('儲存失敗：' + result.error)
      return
    }
    setEditing(false)
    onUpdated()
  }

  async function handleDelete() {
    if (!confirm('確定要刪除這筆收據嗎？')) return
    setDeleting(true)
    await deleteReceipt(receipt.id)
    onDelete()
  }

  function addItem() {
    setEditItems(prev => [...prev, { item_name: '', amount: 0, excel_column: '', item_category: '食材' }])
  }

  function removeItem(idx: number) {
    setEditItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof EditItem, value: string | number) {
    setEditItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header row */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 truncate">
              {receipt.vendor_name || '（未填廠商）'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
              {TYPE_LABEL[receipt.receipt_type] ?? receipt.receipt_type}
            </span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded', STATUS_STYLE[receipt.status] ?? STATUS_STYLE.draft)}>
              {STATUS_LABEL[receipt.status] ?? receipt.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-base font-bold tabular-nums text-slate-900">${fmt(receipt.total_amount)}</span>
            {receipt.tax_amount > 0 && (
              <span className="text-xs text-slate-400">含稅 ${fmt(receipt.tax_amount)}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {receipt.photo_url && (
            <button onClick={() => setShowPhoto(!showPhoto)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors">
              <Image className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button onClick={startEdit}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors">
            <Edit2 className="h-4 w-4" />
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showPhoto && receipt.photo_url && (
        <div className="px-4 pb-3">
          <img src={receipt.photo_url} alt="receipt"
            className="w-full max-h-64 object-contain rounded-lg border border-slate-100 bg-slate-50" />
        </div>
      )}

      {/* View mode */}
      {expanded && !editing && (
        <div className="px-4 pb-3 border-t border-slate-100 pt-3 space-y-2">
          {receipt.receipt_items.length > 0 ? (
            <>
              <p className="text-xs font-semibold text-slate-500">品項明細</p>
              {receipt.receipt_items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-slate-600">{item.item_name}</span>
                  <span className="tabular-nums font-medium">${fmt(item.amount)}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="text-xs text-slate-400">無品項明細</p>
          )}
          {receipt.notes && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-2 py-1.5">{receipt.notes}</p>
          )}
          <p className="text-[10px] text-slate-400">
            {new Date(receipt.created_at).toLocaleString('zh-TW', {
              timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            })}
          </p>
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="px-4 pb-4 border-t border-blue-100 pt-3 space-y-3 bg-blue-50/30">
          <p className="text-xs font-semibold text-blue-700">編輯單據</p>

          {/* 廠商 / 類型 / 日期 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 mb-0.5 block">廠商名稱</label>
              <input className="w-full h-9 px-2 text-sm rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400"
                value={editVendor} onChange={e => setEditVendor(e.target.value)} placeholder="廠商" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-0.5 block">單據類型</label>
              <select className="w-full h-9 px-2 text-sm rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400"
                value={editType} onChange={e => setEditType(e.target.value)}>
                <option value="invoice">統一發票</option>
                <option value="receipt">收據</option>
                <option value="delivery_note">估價單</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 mb-0.5 block">業務日期</label>
              <input type="date" className="w-full h-9 px-2 text-sm rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400"
                value={editDate} onChange={e => setEditDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-0.5 block">總金額</label>
              <input type="number" className="w-full h-9 px-2 text-sm rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 text-right tabular-nums"
                value={editTotal || ''} onChange={e => setEditTotal(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-0.5 block">稅額</label>
              <input type="number" className="w-full h-9 px-2 text-sm rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 text-right tabular-nums"
                value={editTax || ''} placeholder="0" onChange={e => setEditTax(parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          {/* 品項 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-semibold text-slate-500">品項明細</p>
              <button onClick={addItem}
                className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5">
                <Plus className="h-3 w-3" /> 新增品項
              </button>
            </div>
            <div className="space-y-1.5">
              {editItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_5rem_1fr_1.5rem] gap-1 items-center">
                  <input
                    className="h-8 px-2 text-xs rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400"
                    placeholder="品項名稱"
                    value={item.item_name}
                    onChange={e => updateItem(idx, 'item_name', e.target.value)}
                  />
                  <input
                    type="number"
                    className="h-8 px-2 text-xs rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 text-right tabular-nums"
                    placeholder="金額"
                    value={item.amount || ''}
                    onChange={e => updateItem(idx, 'amount', parseFloat(e.target.value) || 0)}
                  />
                  <select
                    className="h-8 px-1 text-xs rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400"
                    value={item.excel_column}
                    onChange={e => updateItem(idx, 'excel_column', e.target.value)}
                  >
                    <option value="">欄位</option>
                    {Object.entries(EXCEL_COLUMNS).map(([cat, cols]) => (
                      <optgroup key={cat} label={cat}>
                        {cols.map(col => <option key={col} value={col}>{col}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <button onClick={() => removeItem(idx)}
                    className="text-slate-300 hover:text-red-500 flex items-center justify-center">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {editItems.length === 0 && (
                <p className="text-[10px] text-slate-400 text-center py-1">無品項（點「新增品項」加入）</p>
              )}
            </div>
          </div>

          {/* 備註 */}
          <div>
            <label className="text-[10px] text-slate-500 mb-0.5 block">備註</label>
            <textarea
              className="w-full h-16 px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 resize-none"
              value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="備註（選填）"
            />
          </div>

          {/* 儲存 / 取消 */}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              <Check className="h-4 w-4" /> {saving ? '儲存中...' : '儲存修改'}
            </button>
            <button onClick={() => setEditing(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">
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

  function handleSaved() {
    setShowUpload(false)
    router.refresh()
  }

  const grouped = receipts.reduce<Record<string, Receipt[]>>((acc, r) => {
    const d = r.business_date
    if (!acc[d]) acc[d] = []
    acc[d].push(r)
    return acc
  }, {})
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const todayTotal = receipts
    .filter(r => r.business_date === today)
    .reduce((s, r) => s + r.total_amount, 0)

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-blue-500" /> 單據管理
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{storeName} · {today}</p>
        </div>
        {!showUpload && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> 新增
          </button>
        )}
      </div>

      {/* 今日統計 */}
      {!showUpload && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex justify-between text-sm">
          <span className="text-slate-500">今日單據</span>
          <div className="text-right">
            <span className="font-bold tabular-nums text-slate-800">${fmt(todayTotal)}</span>
            <span className="text-slate-400 ml-2 text-xs">
              共 {receipts.filter(r => r.business_date === today).length} 筆
            </span>
          </div>
        </div>
      )}

      {/* 上傳表單 */}
      {showUpload && (
        <div className="rounded-xl border border-blue-200 bg-white p-4">
          <ReceiptUpload
            storeId={storeId}
            today={today}
            mappings={mappings}
            onSaved={handleSaved}
            onCancel={() => setShowUpload(false)}
          />
        </div>
      )}

      {/* 收據列表 */}
      {dates.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>尚無單據紀錄</p>
          <p className="text-xs mt-1">點右上角「新增」上傳第一張收據</p>
        </div>
      ) : (
        dates.map(date => (
          <div key={date} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">
                {date === today ? `今天 ${formatDate(date)}` : formatDate(date)}
              </p>
              <p className="text-xs text-slate-400 tabular-nums">
                ${fmt(grouped[date].reduce((s, r) => s + r.total_amount, 0))}
              </p>
            </div>
            {grouped[date].map(r => (
              <ReceiptCard
                key={r.id}
                receipt={r}
                onDelete={() => router.refresh()}
                onUpdated={() => router.refresh()}
              />
            ))}
          </div>
        ))
      )}
    </div>
  )
}
