'use client'

import { useEffect, useState, useRef, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'
import { saveReceipt } from '@/app/actions/receipts'
import { saveItemMappingsBatch } from '@/app/actions/item-mappings'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import { Camera, Loader2, CheckCircle2, Plus, Trash2, X, Sparkles } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { storePhotoPath } from '@/lib/storage-paths'

interface MappingMap {
  [itemName: string]: { excel_column: string; item_category: string }
}

interface NewReceiptData {
  id: string; business_date: string; vendor_name: string; actual_vendor_name?: string | null; receipt_type: string
  total_amount: number; tax_amount: number; photo_url: string; notes: string
  status: string; created_at: string
  receipt_items: { id: string; item_name: string; amount: number; excel_column: string; item_category: string }[]
}

interface Props {
  storeId: string
  today: string
  mappings: MappingMap
  onSaved: (receipt: NewReceiptData) => void
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
  const [actualVendorName, setActualVendorName] = useState('')
  const [receiptType, setReceiptType] = useState('receipt')
  const [totalAmount, setTotalAmount] = useState(0)
  const [taxAmount, setTaxAmount] = useState(0)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<FormItem[]>([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [openItemIdx, setOpenItemIdx] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const draftKey = `receipt_upload_draft_${storeId}_${today}`

  function handleCancel() {
    try { localStorage.removeItem(draftKey) } catch {}
    onCancel()
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft?.storeId !== storeId || draft?.date !== today) { localStorage.removeItem(draftKey); return }
      if (typeof draft.photoUrl === 'string' && draft.photoUrl) {
        setPhotoUrl(draft.photoUrl)
        setPhotoPreview(draft.photoUrl)
        setStep('review')
      }
      if (typeof draft.vendorName === 'string') setVendorName(draft.vendorName)
      if (typeof draft.actualVendorName === 'string') setActualVendorName(draft.actualVendorName)
      if (typeof draft.receiptType === 'string') setReceiptType(draft.receiptType)
      if (typeof draft.totalAmount === 'number') setTotalAmount(draft.totalAmount)
      if (typeof draft.taxAmount === 'number') setTaxAmount(draft.taxAmount)
      if (typeof draft.notes === 'string') setNotes(draft.notes)
      if (Array.isArray(draft.items)) setItems(draft.items)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const hasDraft = photoUrl || vendorName.trim() || actualVendorName.trim() || totalAmount > 0 || taxAmount > 0 || notes.trim() || items.length > 0
        if (!hasDraft || step === 'saving') {
          localStorage.removeItem(draftKey)
          return
        }
        localStorage.setItem(draftKey, JSON.stringify({
          storeId,
          date: today,
          photoUrl,
          vendorName,
          actualVendorName,
          receiptType,
          totalAmount,
          taxAmount,
          notes,
          items,
          savedAt: new Date().toISOString(),
        }))
      } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [actualVendorName, draftKey, items, notes, photoUrl, receiptType, step, storeId, taxAmount, today, totalAmount, vendorName])

  function selectMappedItem(i: number, name: string) {
    const m = mappings[name]
    setItems(prev => prev.map((item, idx) => idx !== i ? item : {
      ...item, name,
      excel_column: m?.excel_column ?? '',
      item_category: m?.item_category ?? '食材',
    }))
    setOpenItemIdx(null)
  }

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
    const rawFile = e.target.files?.[0]
    if (!rawFile) return
    setError('')

    const file = await compressImage(rawFile)

    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    setStep('recognizing')
    const supabase = createClient()
    const ext = file.name.split('.').pop() || 'jpg'
    const path = storePhotoPath(storeId, today, 'receipts', `${Date.now()}.${ext}`)
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
        storeId, businessDate: today, vendorName, actualVendorName, receiptType,
        totalAmount, taxAmount, photoUrl, notes,
        items: validItems.map(it => ({
          item_name: it.name, item_category: it.item_category,
          amount: it.amount, excel_column: it.excel_column,
        })),
      })
      if (result?.error) { setError(result.error); setStep('review') }
      else {
        try { localStorage.removeItem(draftKey) } catch {}
        onSaved({
        id: result.id!,
        business_date: today,
        vendor_name: vendorName,
        actual_vendor_name: actualVendorName.trim() || null,
        receipt_type: receiptType,
        total_amount: totalAmount,
        tax_amount: taxAmount,
        photo_url: photoUrl,
        notes: notes,
        status: 'draft',
        created_at: new Date().toISOString(),
        receipt_items: validItems.map((it, idx) => ({
          id: `new-${result.id}-${idx}`,
          item_name: it.name,
          amount: it.amount,
          excel_column: it.excel_column,
          item_category: it.item_category,
        })),
      })
      }
    })
  }

  if (step === 'upload') return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">新增收據 / 發票</h2>
        <button onClick={handleCancel}><X className="h-5 w-5 text-slate-400" /></button>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-800">確認辨識結果</h2>
          <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            <Sparkles className="h-3 w-3" /> AI 已辨識
          </span>
        </div>
        <button onClick={handleCancel}><X className="h-5 w-5 text-slate-400" /></button>
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
          <label className="text-xs text-slate-500 mb-1 block">實際廠商（可空）</label>
          <input className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500"
            value={actualVendorName} onChange={e => setActualVendorName(e.target.value)} placeholder="例：昇威、有厲、某某菜行" />
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

        {/* 表頭 */}
        <div className="grid grid-cols-[1fr_5rem_1.5rem] gap-x-1.5 text-[10px] text-slate-400 mb-1 px-0.5">
          <span>品項名稱</span><span className="text-right">金額</span><span />
        </div>

        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_1.5rem] gap-x-1.5 items-start">
              <div style={{ position: 'relative' }}>
                <input
                  className="h-9 px-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 min-w-0 w-full"
                  value={item.name} placeholder="搜尋或輸入品項名稱"
                  onFocus={() => setOpenItemIdx(i)}
                  onChange={e => { updateItem(i, 'name', e.target.value); setOpenItemIdx(i) }}
                  onBlur={() => setTimeout(() => setOpenItemIdx(null), 200)}
                />
                {item.excel_column && (
                  <p className="text-[10px] mt-0.5 px-0.5" style={{ color: '#F59E0B' }}>→ {item.excel_column}</p>
                )}
                {openItemIdx === i && (() => {
                  const q = item.name.trim()
                  const allNames = Object.keys(mappings)
                  const filtered = q ? allNames.filter(n => n.includes(q)) : allNames
                  if (filtered.length === 0) return null
                  const grouped = (['食材', '耗材', '雜項'] as const)
                    .map(cat => ({ cat, cols: filtered.filter(n => mappings[n]?.item_category === cat) }))
                    .filter(g => g.cols.length > 0)
                  return (
                    <div style={{ position: 'absolute', top: '38px', left: 0, right: 0, zIndex: 50, background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: '220px', overflowY: 'auto' }}>
                      {grouped.map(({ cat, cols }) => (
                        <div key={cat}>
                          <p style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', padding: '6px 12px 2px', letterSpacing: '0.05em' }}>{cat}</p>
                          {cols.map(name => (
                            <button key={name}
                              onMouseDown={e => { e.preventDefault(); selectMappedItem(i, name) }}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: '13px', background: 'none', border: 'none', borderBottom: '1px solid #f8fafc', cursor: 'pointer', color: '#1e293b', fontFamily: 'inherit' }}>
                              {name}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <input type="number" min="0"
                className="h-9 px-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-500 text-right tabular-nums"
                value={item.amount || ''} placeholder="0"
                onChange={e => updateItem(i, 'amount', parseInt(e.target.value) || 0)} />
              <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-400 mt-2">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-slate-400 text-center py-2">尚無品項，點上方新增</p>}
        </div>
      </div>

      {/* 品項合計防呆 */}
      {items.length > 0 && (() => {
        const sum = items.reduce((s, i) => s + (i.amount || 0), 0)
        const diff = totalAmount - sum
        const ok = diff === 0
        return (
          <div className={cn(
            'flex justify-between items-center px-3 py-2 rounded-xl text-xs font-medium',
            ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
          )}>
            <span>品項合計</span>
            <span className="tabular-nums">
              ${sum.toLocaleString('zh-TW')}
              {!ok && `　差 ${diff > 0 ? '+' : ''}${diff.toLocaleString('zh-TW')}`}
              {ok && '　✓ 與總金額相符'}
            </span>
          </div>
        )
      })()}

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
