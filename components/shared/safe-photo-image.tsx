'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEventHandler } from 'react'
import { FileText } from 'lucide-react'

function isHttpUrl(src: string) {
  return /^https?:\/\//.test(src)
}

function isSupabasePublicObjectUrl(src: string) {
  try {
    const url = new URL(src)
    return url.pathname.includes('/storage/v1/object/public/') || url.pathname.includes('/storage/v1/render/image/public/')
  } catch {
    return false
  }
}

function supabaseImageUrl(src: string, width: number, height: number, resize: 'cover' | 'contain', quality: number) {
  try {
    const url = new URL(src)
    if (url.pathname.includes('/storage/v1/object/public/')) {
      url.pathname = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
    } else if (!url.pathname.includes('/storage/v1/render/image/public/')) {
      return src
    }
    url.searchParams.set('width', String(width))
    url.searchParams.set('height', String(height))
    url.searchParams.set('resize', resize)
    url.searchParams.set('quality', String(quality))
    return url.toString()
  } catch {
    return src
  }
}

/** Fast thumbnail URL for Supabase Storage public objects. */
export function supabaseThumbUrl(src: string, width: number, height: number) {
  return supabaseImageUrl(src, width, height, 'cover', 55)
}

function fallbackImageUrl(src: string) {
  return isSupabasePublicObjectUrl(src) ? supabaseImageUrl(src, 1600, 1600, 'contain', 78) : src
}

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
  loading?: 'eager' | 'lazy'
  fallbackText?: string
  onClick?: MouseEventHandler<HTMLElement>
}) {
  const nodeRef = useRef<HTMLImageElement | HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(loading === 'eager')
  const primarySrc = useMemo(() => {
    if (!src) return ''
    return thumb ? supabaseThumbUrl(src, width, height) : src
  }, [height, src, thumb, width])
  const [currentSrc, setCurrentSrc] = useState(primarySrc)
  const [step, setStep] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setCurrentSrc(loading === 'eager' || visible ? primarySrc : '')
    setStep(0)
    setFailed(false)
  }, [loading, primarySrc, visible])

  useEffect(() => {
    if (loading === 'eager') {
      setVisible(true)
      return
    }
    const node = nodeRef.current
    if (!node || visible || typeof IntersectionObserver === 'undefined') {
      if (!visible) setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '360px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loading, visible])

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
  if (!currentSrc && !failed) return placeholder(true)
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
        const renderUrl = fallbackImageUrl(src)
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
