'use client'

import { useState, useRef, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { saveReceipt } from '@/app/actions/receipts'
import { saveItemMappingsBatch } from '@/app/actions/item-mappings'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import { Camera, Loader2, CheckCircle2, Plus, Trash2, X, Sparkles, AlertCircle } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

interface MappingMap {
  [itemName: string]: { excel_column: string; item_category: string }
}

interface Props {
  storeId: string
  today: string
  mappings: MappingMap
  onSaved: () => void
  onCancel: () => void
}

interface FormItem {
  name: string
  amount: number
  excel_column: string
  item_category: string
}

export default function ReceiptUpload({ storeId, today, mappings, onSaved, onCancel }: Props) {
  const [step, setStep] = useState<'upload' | 'recognizing' | 'review' | 'saving'>('upload')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [receiptType, setReceiptType] = useState('receipt')
  const [totalAmount, setTotalAmount] = useState(0)
  const [taxAmount, setTaxAmount] = useState(0)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<FormItem[]>([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function applyMappings(rawItems: { name: string; amount: number }[]): FormItem[] {
    return rawItems.map(item => {
      const m = mappings[item.name]
      return {
        name: item.name,
        amount: item.amount,
        excel_column: m?.excel_column ?? '',
        item_category: m?.item_category ?? '食材',
      }
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    setStep('recognizing')
    const supabase = createClient()
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${storeId}/${today}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('receipts').upload(path, file)
    if (upErr) { setError('上傳失敗：' + upErr.message); setStep('upload'); return }

    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
    setPhotoUrl(publicUrl)

    try {
      const res = await fetch('/api/recognize-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: publicUrl }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setVendorName(data.vendor_name ?? '')
      setReceiptType(data.receipt_type ?? 'receipt')
      setTotalAmount(data.total_amount ?? 0)
      setTaxAmount(data.tax_amount ?? 0)
      setItems(applyMappings(data.items ?? []))
    } catch (err: any) {
      setError('AI 辨識失敗，請手動輸入：' + err.message)
      setItems([])
    }
    setStep('review')
  }

  function updateItem(i: number, field: keyof FormItem, val: string | number) {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item
      const updated = { ...item, [field]: val }
      // auto-set category when column is selected
      if (field === 'excel_column') {
        const cat = Object.entries(EXCEL_COLUMNS).find(([, cols]) =>
          cols.includes(val as string)
        )?.[0] ?? item.item_category
        updated.item_category = cat
      }
      return updated
    }))
  }

  function handleSave() {
    startTransition(async () => {
      setStep('saving')
      const validItems = items.filter(it => it.name.trim())

      // Save new mappings for items that now have a column assigned
      const newMappings = validItems
        .filter(it => it.excel_column && !mappings[it.name])
        .map(it => ({ item_name: it.name, excel_column: it.excel_column, item_category: it.item_category }))
      if (newMappings.length) await saveItemMappingsBatch(newMappings)

      const result = await saveReceipt({
        storeId, businessDate: today, vendorName, receiptType,
        totalAmount, taxAmount, photoUrl, notes,
        items: validItems.map(it => ({
          item_name: it.name, item_category: it.item_category,
          amount: it.amount, excel_column: it.excel_column,
        })),
      })
      if (result?.error) { setError(result.error); setStep('review') }
      else onSaved()
    })
  }

  if (step === 'upload') return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">新增收據 / 發票</h2>
        <button onClick={onCancel}><X className="h-5 w-5 text-slate-400" /></button>
      </div>
      <button onClick={() => fileRef.current?.click()}
        className="w-full h-40 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors bg-slate-50"
      >
        <Camera className="h-8 w-8" />
        <span className="text-sm">點擊拍照或選擇圖片</span>
        <span className="text-xs">支援 JPG、PNG</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )

  if (step === 'recognizing') return (
    <div className="py-12 flex flex-col items-center gap-3 text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      <p className="text-sm">AI 辨識中，請稍候…</p>
      {photoPreview && <img src={photoPreview} alt="preview" className="w-32 h-32 object-cover rounded-xl opacity-50" />}
    </div>
  )

  const unmappedCount = items.filter(it => it.name.trim() && !it.excel_column).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-800">確認辨識結果</h2>
          <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            <Sparkles className="h-3 w-3" /> AI 已辨識
          </span>
        </div>
        <button onClick={onCancel}><X className="h-5 w-5 text-slate-400" /></button>
      </div>

      {photoPreview && (
        <img src={photoPreview} alt="receipt" className="w-full max-h-48 object-contain rounded-xl border border-slate-200 bg-slate-50" />
      )}
      {error && <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">{error}</div>}

      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">廠商名稱</label>
          <input className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500"
            value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="例：菜商、央廚配送" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">單據類型</label>
          <select className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 bg-white"
            value={receiptType} onChange={e => setReceiptType(e.target.value)}>
            <option value="invoice">統一發票</option>
            <option value="receipt">收據</option>
            <option value="delivery_note">估價單／送貨單</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">總金額</label>
            <input type="number" min="0"
              className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 text-right tabular-nums"
              value={totalAmount || ''} placeholder="0" onChange={e => setTotalAmount(parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">稅金</label>
            <input type="number" min="0"
              className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 text-right tabular-nums"
              value={taxAmount || ''} placeholder="0" onChange={e => setTaxAmount(parseInt(e.target.value) || 0)} />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-600">品項明細</span>
          <button onClick={() => setItems(p => [...p, { name: '', amount: 0, excel_column: '', item_category: '食材' }])}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
            <Plus className="h-3.5 w-3.5" /> 新增品項
          </button>
        </div>

        {unmappedCount > 0 && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{unmappedCount} 個品項尚未對應 Excel 欄位，請選擇後儲存（系統會記住，下次自動填入）</span>
          </div>
        )}

        {/* 表頭 */}
        <div className="grid grid-cols-[1fr_5rem_1fr_1.5rem] gap-x-1.5 text-[10px] text-slate-400 mb-1 px-0.5">
          <span>品項名稱</span><span className="text-right">金額</span><span>Excel 欄位</span><span />
        </div>

        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_1fr_1.5rem] gap-x-1.5 items-center">
              <input
                className="h-9 px-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 min-w-0"
                value={item.name} placeholder="品項名稱"
                onChange={e => updateItem(i, 'name', e.target.value)} />
              <input type="number" min="0"
                className="h-9 px-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 text-right tabular-nums"
                value={item.amount || ''} placeholder="0"
                onChange={e => updateItem(i, 'amount', parseInt(e.target.value) || 0)} />
              <select
                className={cn(
                  'h-9 px-2 text-xs rounded-lg border outline-none focus:border-blue-500 bg-white min-w-0',
                  item.excel_column ? 'border-slate-200 text-slate-700' : 'border-amber-300 text-slate-400'
                )}
                value={item.excel_column}
                onChange={e => updateItem(i, 'excel_column', e.target.value)}
              >
                <option value="">請選擇欄位</option>
                {Object.entries(EXCEL_COLUMNS).map(([cat, cols]) => (
                  <optgroup key={cat} label={cat}>
                    {cols.map(col => <option key={col} value={col}>{col}</option>)}
                  </optgroup>
                ))}
              </select>
              <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-slate-400 text-center py-2">尚無品項，點上方新增</p>}
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 mb-1 block">備註</label>
        <input className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500"
          value={notes} onChange={e => setNotes(e.target.value)} placeholder="選填" />
      </div>

      <button onClick={handleSave} disabled={isPending || step === 'saving'}
        className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
        {step === 'saving'
          ? <><Loader2 className="h-4 w-4 animate-spin" /> 儲存中…</>
          : <><CheckCircle2 className="h-4 w-4" /> 儲存收據</>}
      </button>
    </div>
  )
}
