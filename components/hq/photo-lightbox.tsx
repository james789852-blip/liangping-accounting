'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Minus, Plus, RotateCcw } from 'lucide-react'
import SafePhotoImage from './safe-photo-image'

const MIN_SCALE = 1
const MAX_SCALE = 5
const SCALE_STEP = 0.5

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

function pointerDistance(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return 0
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
}

/** 全螢幕照片瀏覽器（支援按鈕、滾輪、拖曳、雙指縮放、鍵盤與滑動切換） */
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
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const dragStart = useRef<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null)
  const pinchDistance = useRef<number | null>(null)
  const [scale, setScale] = useState(MIN_SCALE)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  function resetView() {
    setScale(MIN_SCALE)
    setOffset({ x: 0, y: 0 })
    pointers.current.clear()
    dragStart.current = null
    pinchDistance.current = null
  }

  function updateScale(nextScale: number) {
    const clamped = clampScale(nextScale)
    setScale(clamped)
    if (clamped === MIN_SCALE) setOffset({ x: 0, y: 0 })
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = Array.from(pointers.current.values())
    if (points.length >= 2) {
      pinchDistance.current = pointerDistance(points)
      dragStart.current = null
      return
    }
    dragStart.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = Array.from(pointers.current.values())

    if (points.length >= 2) {
      const nextDistance = pointerDistance(points)
      const previousDistance = pinchDistance.current
      if (previousDistance && nextDistance) {
        setScale(current => clampScale(current * (nextDistance / previousDistance)))
      }
      pinchDistance.current = nextDistance
      return
    }

    if (scale <= MIN_SCALE || !dragStart.current) return
    setOffset({
      x: dragStart.current.offsetX + event.clientX - dragStart.current.pointerX,
      y: dragStart.current.offsetY + event.clientY - dragStart.current.pointerY,
    })
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    const remaining = Array.from(pointers.current.values())
    pinchDistance.current = remaining.length >= 2 ? pointerDistance(remaining) : null
    if (remaining.length === 1) {
      dragStart.current = {
        pointerX: remaining[0].x,
        pointerY: remaining[0].y,
        offsetX: offset.x,
        offsetY: offset.y,
      }
    } else if (remaining.length === 0) {
      dragStart.current = null
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    const neighbors = [photos[index - 1]?.url, photos[index + 1]?.url].filter(Boolean) as string[]
    neighbors.forEach(url => {
      const image = new Image()
      image.decoding = 'async'
      image.src = url
    })
    return () => window.removeEventListener('keydown', onKey)
  }, [index, onClose, onPrev, onNext, photos])

  useEffect(() => {
    resetView()
  }, [index])

  const photo = photos[index]
  if (!photo) return null
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="照片放大檢視"
      onTouchStart={e => {
        touchStartX.current = scale === MIN_SCALE && e.touches.length === 1
          ? e.touches[0].clientX
          : null
      }}
      onTouchEnd={e => {
        if (touchStartX.current === null) return
        const diff = e.changedTouches[0].clientX - touchStartX.current
        if (diff > 50 && hasPrev) onPrev()
        else if (diff < -50 && hasNext) onNext()
        touchStartX.current = null
      }}>
      <button type="button" aria-label="關閉照片" className="absolute top-4 right-4 z-20 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.15)' }}
        onClick={e => { e.stopPropagation(); onClose() }}>
        <X className="h-6 w-6 text-white" />
      </button>
      {photos.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ background: 'rgba(0,0,0,0.45)' }}>
          {index + 1} / {photos.length}
        </div>
      )}
      {hasPrev && (
        <button type="button" aria-label="上一張照片" className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full transition-opacity hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.18)' }}
          onClick={e => { e.stopPropagation(); resetView(); onPrev() }}>
          <ChevronLeft className="h-7 w-7 text-white" />
        </button>
      )}
      {hasNext && (
        <button type="button" aria-label="下一張照片" className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full transition-opacity hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.18)' }}
          onClick={e => { e.stopPropagation(); resetView(); onNext() }}>
          <ChevronRight className="h-7 w-7 text-white" />
        </button>
      )}

      <div
        className="flex h-full w-full items-center justify-center p-4 sm:p-10"
        style={{ touchAction: 'none', cursor: scale > MIN_SCALE ? 'grab' : 'zoom-in' }}
        onClick={event => event.stopPropagation()}
        onDoubleClick={() => updateScale(scale > MIN_SCALE ? MIN_SCALE : 2)}
        onWheel={event => {
          event.preventDefault()
          updateScale(scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP))
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <SafePhotoImage src={photo.url} alt={photo.label ?? ''}
          draggable={false}
          className="max-w-[88vw] max-h-[82vh] select-none object-contain rounded-xl"
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            transformOrigin: 'center',
            transition: pointers.current.size > 0 ? 'none' : 'transform 120ms ease-out',
          }}
          loading="eager"
          fallbackText="照片載入中斷" />
      </div>

      <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full px-2 py-1.5 text-white"
        style={{ background: 'rgba(0,0,0,0.62)' }}
        onClick={event => event.stopPropagation()}>
        <button type="button" aria-label="縮小照片" disabled={scale <= MIN_SCALE}
          className="rounded-full p-2 disabled:opacity-35" onClick={() => updateScale(scale - SCALE_STEP)}>
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-12 text-center text-xs font-semibold tabular-nums">{Math.round(scale * 100)}%</span>
        <button type="button" aria-label="放大照片" disabled={scale >= MAX_SCALE}
          className="rounded-full p-2 disabled:opacity-35" onClick={() => updateScale(scale + SCALE_STEP)}>
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" aria-label="恢復原始大小" disabled={scale === MIN_SCALE && offset.x === 0 && offset.y === 0}
          className="rounded-full p-2 disabled:opacity-35" onClick={resetView}>
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      {photo.label && (
        <div className="absolute bottom-20 left-1/2 z-20 -translate-x-1/2 px-3 py-1 rounded-full text-xs text-white font-medium"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          {photo.label}
        </div>
      )}
    </div>
  )
}
