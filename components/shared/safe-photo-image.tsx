'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEventHandler } from 'react'
import { FileText } from 'lucide-react'
import { fallbackPhotoUrl, supabaseResizedImageUrl, supabaseThumbUrl } from '@/lib/photo-image-url'

function isHttpUrl(src: string) {
  return /^https?:\/\//.test(src)
}

export { supabaseThumbUrl } from '@/lib/photo-image-url'

function Placeholder({
  className,
  style,
  onClick,
  text,
  empty = false,
  ref,
}: {
  className?: string
  style?: CSSProperties
  onClick?: MouseEventHandler<HTMLDivElement>
  text: string
  empty?: boolean
  ref: React.Ref<HTMLDivElement>
}) {
  return (
    <div ref={ref} className={className} onClick={onClick} style={{
      ...style,
      ...(empty ? { background: '#f1f5f9', color: '#94a3b8' } : {
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        gap: 3, background: '#f8fafc', color: '#94a3b8', fontSize: 10, fontWeight: 700,
        textAlign: 'center', lineHeight: 1.25,
      }),
    }}>
      {!empty && <FileText style={{ width: 18, height: 18 }} />}
      {!empty && <span>{text}</span>}
    </div>
  )
}

export default function SafePhotoImage({
  src,
  alt,
  className,
  style,
  thumb = false,
  width = 180,
  height = 180,
  resize = 'cover',
  quality = 55,
  loading = 'lazy',
  fallbackText = '照片',
  onClick,
}: {
  src?: string | null
  alt: string
  className?: string
  style?: CSSProperties
  thumb?: boolean
  width?: number
  height?: number
  resize?: 'cover' | 'contain'
  quality?: number
  loading?: 'eager' | 'lazy'
  fallbackText?: string
  onClick?: MouseEventHandler<HTMLElement>
}) {
  const nodeRef = useRef<HTMLImageElement | HTMLDivElement | null>(null)
  const primarySrc = useMemo(() => {
    if (!src) return ''
    return thumb ? supabaseResizedImageUrl(src, width, height, resize, quality) : src
  }, [height, quality, resize, src, thumb, width])
  const [currentSrc, setCurrentSrc] = useState(primarySrc)
  const [step, setStep] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // Let the browser handle lazy loading. A custom IntersectionObserver can
    // miss images inside nested scroll containers and leave them blank.
    setCurrentSrc(primarySrc)
    setStep(0)
    setFailed(false)
  }, [primarySrc])

  const placeholder = (empty = false) => (
    <Placeholder
      ref={nodeRef as React.Ref<HTMLDivElement>}
      className={className}
      style={style}
      onClick={onClick as MouseEventHandler<HTMLDivElement>}
      text={fallbackText}
      empty={empty}
    />
  )

  if (!src) return placeholder()
  if (failed) return placeholder()

  return (
    <img
      ref={nodeRef as React.Ref<HTMLImageElement>}
      src={currentSrc}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick as MouseEventHandler<HTMLImageElement>}
      loading={loading}
      decoding="async"
      fetchPriority={loading === 'eager' ? 'high' : 'low'}
      onError={() => {
        if (step === 0 && src && currentSrc !== src) {
          setStep(1)
          setCurrentSrc(src)
          return
        }
        const renderUrl = fallbackPhotoUrl(src)
        if (step <= 1 && renderUrl !== currentSrc) {
          setStep(2)
          setCurrentSrc(renderUrl)
          return
        }
        if (step <= 2 && isHttpUrl(currentSrc)) {
          setStep(3)
          setCurrentSrc(`${currentSrc}${currentSrc.includes('?') ? '&' : '?'}img_retry=${Date.now()}`)
          return
        }
        setFailed(true)
      }}
    />
  )
}
