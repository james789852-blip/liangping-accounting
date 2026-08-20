'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Images, X } from 'lucide-react'
import SafePhotoImage from '@/components/shared/safe-photo-image'
import {
  ACCOUNTING_DOCUMENT_CATEGORY_LABELS,
  type AccountingDocument,
  type AccountingDocumentCategory,
} from '@/lib/accounting-documents'

const CATEGORY_STYLE: Record<AccountingDocumentCategory, { background: string; color: string }> = {
  invoice: { background: '#fee2e2', color: '#b91c1c' },
  receipt: { background: '#dbeafe', color: '#1d4ed8' },
  delivery: { background: '#ffedd5', color: '#c2410c' },
  sales: { background: '#dcfce7', color: '#15803d' },
  remittance: { background: '#fef3c7', color: '#a16207' },
  void_invoice: { background: '#fce7f3', color: '#be185d' },
  note: { background: '#ede9fe', color: '#6d28d9' },
  other: { background: '#f4f4f5', color: '#52525b' },
}

function formatAmount(amount?: number) {
  return amount === undefined ? '' : `$${Math.round(amount).toLocaleString('zh-TW')}`
}

export default function AccountingDocumentsGallery({ documents }: { documents: AccountingDocument[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const active = activeIndex === null ? null : documents[activeIndex]
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<AccountingDocumentCategory, number>> = {}
    for (const document of documents) counts[document.category] = (counts[document.category] ?? 0) + 1
    return counts
  }, [documents])

  const move = useCallback((offset: number) => {
    if (documents.length === 0) return
    setActiveIndex(current => current === null
      ? null
      : (current + offset + documents.length) % documents.length)
  }, [documents.length])

  useEffect(() => {
    if (activeIndex === null) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveIndex(null)
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, move])

  if (documents.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-6 py-16 text-center" style={{ border: '1px solid #e4e4e7' }}>
        <Images className="mx-auto h-10 w-10" style={{ color: '#d4d4d8' }} />
        <p className="mt-3 text-sm font-bold" style={{ color: '#52525b' }}>這個篩選條件下沒有照片</p>
        <p className="mt-1 text-xs" style={{ color: '#a1a1aa' }}>可調整店家、日期、分類或關鍵字再查詢</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold" style={{ color: '#18181b' }}>共 {documents.length} 張</span>
        {Object.entries(categoryCounts).map(([category, count]) => (
          <span key={category} className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={CATEGORY_STYLE[category as AccountingDocumentCategory]}>
            {ACCOUNTING_DOCUMENT_CATEGORY_LABELS[category as AccountingDocumentCategory]} {count}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {documents.map((document, index) => (
          <button key={document.id} type="button" onClick={() => setActiveIndex(index)}
            className="overflow-hidden rounded-2xl bg-white text-left transition-transform hover:-translate-y-0.5"
            style={{ border: '1px solid #e4e4e7', boxShadow: '0 4px 14px rgba(15,23,42,0.05)' }}>
            <div className="relative aspect-[4/3] overflow-hidden" style={{ background: '#f4f4f5' }}>
              <SafePhotoImage
                src={document.url}
                alt={document.title}
                thumb
                width={520}
                height={390}
                className="h-full w-full object-cover"
                fallbackText="無法顯示照片"
              />
              <span className="absolute left-2 top-2 rounded-full px-2 py-1 text-[10px] font-bold shadow-sm"
                style={CATEGORY_STYLE[document.category]}>
                {ACCOUNTING_DOCUMENT_CATEGORY_LABELS[document.category]}
              </span>
            </div>
            <div className="space-y-1 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-bold" style={{ color: '#18181b' }}>{document.title}</p>
                {document.amount !== undefined && (
                  <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: '#92400E' }}>{formatAmount(document.amount)}</span>
                )}
              </div>
              <p className="truncate text-xs" style={{ color: '#71717a' }}>
                {document.locationKind === 'ck' ? '央廚' : '店面'} · {document.locationName}
              </p>
              <p className="truncate text-[11px]" style={{ color: '#a1a1aa' }}>
                {document.businessDate}{document.subtitle ? ` · ${document.subtitle}` : ''}
              </p>
            </div>
          </button>
        ))}
      </div>

      {active && activeIndex !== null && (
        <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: 'rgba(9,9,11,0.92)' }}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{active.title}</p>
              <p className="truncate text-xs text-white/65">
                {active.businessDate} · {active.locationName} · {ACCOUNTING_DOCUMENT_CATEGORY_LABELS[active.category]}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={active.url} target="_blank" rel="noreferrer"
                className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold"
                style={{ background: 'rgba(255,255,255,0.12)' }}>
                <ExternalLink className="h-4 w-4" /> 原始照片
              </a>
              <button type="button" onClick={() => setActiveIndex(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'rgba(255,255,255,0.12)' }} aria-label="關閉照片">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-4">
            <SafePhotoImage src={active.url} alt={active.title} loading="eager"
              className="max-h-full max-w-full rounded-xl object-contain" fallbackText="無法顯示照片" />
            {documents.length > 1 && (
              <>
                <button type="button" onClick={() => move(-1)} aria-label="上一張"
                  className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full text-white"
                  style={{ background: 'rgba(255,255,255,0.14)' }}>
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button type="button" onClick={() => move(1)} aria-label="下一張"
                  className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full text-white"
                  style={{ background: 'rgba(255,255,255,0.14)' }}>
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
          <p className="pb-3 text-center text-xs text-white/60">{activeIndex + 1} / {documents.length}</p>
        </div>
      )}
    </>
  )
}
