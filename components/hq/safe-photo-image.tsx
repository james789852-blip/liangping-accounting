'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEventHandler } from 'react'
import { FileText } from 'lucide-react'

function supabaseThumbUrl(src: string, width: number, height: number) {
  try {
    const url = new URL(src)
    if (url.pathname.includes('/storage/v1/object/public/')) {
      url.pathname = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
    } else if (!url.pathname.includes('/storage/v1/render/image/public/')) {
      return src
    }
    url.searchParams.set('width', String(width))
    url.searchParams.set('height', String(height))
    url.searchParams.set('resize', 'cover')
    url.searchParams.set('quality', '45')
    return url.toString()
  } catch {
    return src
  }
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
  const imgRef = useRef<HTMLImageElement | HTMLDivElement | null>(null)
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
    const node = imgRef.current
    if (!node || visible) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '240px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loading, visible])

  if (!src && !failed) {
    return (
      <div
        ref={imgRef}
        className={className}
        onClick={onClick}
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 3,
          background: '#f8fafc',
          color: '#94a3b8',
          fontSize: 10,
          fontWeight: 700,
          textAlign: 'center',
          lineHeight: 1.25,
        }}
      >
        <FileText style={{ width: 18, height: 18 }} />
        <span>{fallbackText}</span>
      </div>
    )
  }

  if (!currentSrc && !failed) {
    return (
      <div
        ref={imgRef}
        className={className}
        onClick={onClick}
        style={{
          ...style,
          background: '#f1f5f9',
          color: '#94a3b8',
        }}
      />
    )
  }

  if (failed) {
    return (
      <div
        ref={imgRef}
        className={className}
        onClick={onClick}
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 3,
          background: '#f8fafc',
          color: '#94a3b8',
          fontSize: 10,
          fontWeight: 700,
          textAlign: 'center',
          lineHeight: 1.25,
        }}
      >
        <FileText style={{ width: 18, height: 18 }} />
        <span>{fallbackText}</span>
      </div>
    )
  }

  return (
    <img
      ref={imgRef as React.RefObject<HTMLImageElement>}
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
        if (step <= 1 && /^https?:\/\//.test(currentSrc)) {
          setStep(2)
          setCurrentSrc(`${currentSrc}${currentSrc.includes('?') ? '&' : '?'}img_retry=${Date.now()}`)
          return
        }
        setFailed(true)
      }}
    />
  )
}
