'use client'

import { useState, useRef, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { saveReceipt } from '@/app/actions/receipts'
import { Camera, Loader2, CheckCircle2, Plus, Trash2, X, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface Props {
  storeId: string
  today: string
  onSaved: () => void
  onCancel: () => void
}

interface RecognizedItem {
  name: string
  amount: number
}

interface RecognizedData {
  vendor_name: string | null
  receipt_type: string | null
  total_amount: number | null
  tax_amount: number | null
  items: RecognizedItem[]
}

const RECEIPT_TYPE_LABEL: Record<string, string> = {
  invoice: '統一發票',
  receipt: '收據',
  delivery_note: '估價單／送貨單',
}

export default function ReceiptUpload({ storeId, today, onSaved, onCancel }: Props) {
  const [step, setStep] = useState<'upload' | 'recognizing' | 'review' | 'saving'>('upload')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')
  const [recognized, setRecognized] = useState<RecognizedData | null>(null)
  const [vendorName, setVendorName] = useState('')
  const [receiptType, setReceiptType] = useState('receipt')
  const [totalAmount, setTotalAmount] = useState(0)
  const [taxAmount, setTaxAmount] = useState(0)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<RecognizedItem[]>([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    // Preview
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    // Upload to Supabase Storage
    setStep('recognizing')
    const supabase = createClient()
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${storeId}/${today}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('receipts').upload(path, file)
    if (upErr) { setError('上傳失敗：' + upErr.message); setStep('upload'); return }

    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
    setPhotoUrl(publicUrl)

    // Call AI recognition
    try {
      const res = await fetch('/api/recognize-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: publicUrl }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setRecognized(data)
      setVendorName(data.vendor_name ?? '')
      setReceiptType(data.receipt_type ?? 'receipt')
      setTotalAmount(data.total_amount ?? 0)
      setTaxAmount(data.tax_amount ?? 0)
      setItems(data.items ?? [])
    } catch (err: any) {
      setError('AI 辨識失敗，請手動輸入：' + err.message)
    }
    setStep('review')
  }

  function updateItem(i: number, field: keyof RecognizedItem, val: string | number) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item))
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function addItem() {
    setItems(prev => [...prev, { name: '', amount: 0 }])
  }

  function handleSave() {
    startTransition(async () => {
      setStep('saving')
      const result = await saveReceipt({
        storeId,
        businessDate: today,
        vendorName,
        receiptType,
        totalAmount,
        taxAmount,
        photoUrl,
        notes,
        items: items.filter(it => it.name.trim()).map(it => ({
          item_name: it.name,
          item_category: '',
          amount: it.amount,
          excel_column: '',
        })),
      })
      if (result?.error) {
        setError(result.error)
        setStep('review')
      } else {
        onSaved()
      }
    })
  }

  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">新增收據 / 發票</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <button
          onClick={() => fileRef.current?.click()}
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
  }

  if (step === 'recognizing') {
    return (
      <div className="py-12 flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm">AI 辨識中，請稍候…</p>
        {photoPreview && (
          <img src={photoPreview} alt="preview" className="w-32 h-32 object-cover rounded-xl opacity-50" />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-800">確認辨識結果</h2>
          {recognized && (
            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              <Sparkles className="h-3 w-3" /> AI 已辨識
            </span>
          )}
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* 照片縮圖 */}
      {photoPreview && (
        <img src={photoPreview} alt="receipt" className="w-full max-h-48 object-contain rounded-xl border border-slate-200 bg-slate-50" />
      )}

      {error && (
        <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* 基本資訊 */}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">廠商名稱</label>
          <input
            className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500"
            value={vendorName} onChange={e => setVendorName(e.target.value)}
            placeholder="例：菜商、央廚配送"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1 block">單據類型</label>
          <select
            className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 bg-white"
            value={receiptType} onChange={e => setReceiptType(e.target.value)}
          >
            <option value="invoice">統一發票</option>
            <option value="receipt">收據</option>
            <option value="delivery_note">估價單／送貨單</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">總金額</label>
            <input
              type="number" min="0"
              className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 text-right tabular-nums"
              value={totalAmount || ''} placeholder="0"
              onChange={e => setTotalAmount(parseInt(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">稅金</label>
            <input
              type="number" min="0"
              className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 text-right tabular-nums"
              value={taxAmount || ''} placeholder="0"
              onChange={e => setTaxAmount(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* 品項列表 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-600">品項明細</span>
          <button
            onClick={addItem}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> 新增品項
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="flex-1 h-9 px-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500"
                value={item.name} placeholder="品項名稱"
                onChange={e => updateItem(i, 'name', e.target.value)}
              />
              <input
                type="number" min="0"
                className="w-24 h-9 px-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 text-right tabular-nums"
                value={item.amount || ''} placeholder="0"
                onChange={e => updateItem(i, 'amount', parseInt(e.target.value) || 0)}
              />
              <button onClick={() => removeItem(i)} className="text-slate-300 hover:text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">尚無品項，點上方新增</p>
          )}
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 mb-1 block">備註</label>
        <input
          className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500"
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="選填"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={isPending || step === 'saving'}
        className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {step === 'saving' ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> 儲存中…</>
        ) : (
          <><CheckCircle2 className="h-4 w-4" /> 儲存收據</>
        )}
      </button>
    </div>
  )
}
