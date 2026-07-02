'use client'

import { useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

/** 全螢幕照片瀏覽器（支援左右箭頭 / 觸控滑動 / ESC 關閉） */
export default function PhotoLightbox({
  photos, index, onClose, onPrev, onNext,
}: {
  photos: { url: string; label?: string }[]
  index: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  const photo = photos[index]
  if (!photo) return null
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (touchStartX.current === null) return
        const diff = e.changedTouches[0].clientX - touchStartX.current
        if (diff > 50 && hasPrev) onPrev()
        else if (diff < -50 && hasNext) onNext()
        touchStartX.current = null
      }}>
      <button className="absolute top-4 right-4 z-10 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.15)' }}
        onClick={e => { e.stopPropagation(); onClose() }}>
        <X className="h-6 w-6 text-white" />
      </button>
      {photos.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ background: 'rgba(0,0,0,0.45)' }}>
          {index + 1} / {photos.length}
        </div>
      )}
      {hasPrev && (
        <button className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-opacity hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.18)' }}
          onClick={e => { e.stopPropagation(); onPrev() }}>
          <ChevronLeft className="h-7 w-7 text-white" />
        </button>
      )}
      {hasNext && (
        <button className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-opacity hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.18)' }}
          onClick={e => { e.stopPropagation(); onNext() }}>
          <ChevronRight className="h-7 w-7 text-white" />
        </button>
      )}
      <img src={photo.url} alt={photo.label ?? ''}
        className="max-w-[88vw] max-h-[88vh] object-contain rounded-xl"
        onClick={e => e.stopPropagation()} />
      {photo.label && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs text-white font-medium"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          {photo.label}
        </div>
      )}
    </div>
  )
}
