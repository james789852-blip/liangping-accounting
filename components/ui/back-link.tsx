'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

interface Props {
  /** 指定回到的路徑；若省略則 router.back() */
  href?: string
  label?: string
  className?: string
}

/** 通用「上一步 / 返回」按鈕，放在頁面標題上方 */
export default function BackLink({ href, label = '返回', className }: Props) {
  const router = useRouter()
  const cls = className ?? 'text-xs inline-flex items-center gap-1 mb-2 hover:opacity-70 transition-opacity'
  const style: React.CSSProperties = { color: '#71717a', cursor: 'pointer' }

  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        <ArrowLeft className="h-3.5 w-3.5" /> {label}
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => router.back()} className={cls} style={{ ...style, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }}>
      <ArrowLeft className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
