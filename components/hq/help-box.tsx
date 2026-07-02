'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react'

/**
 * 可折疊教學說明卡
 *
 *   <HelpBox title="收據廠商設定教學" defaultOpen>
 *     <p>...</p>
 *   </HelpBox>
 */
export default function HelpBox({
  title, defaultOpen = false, children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 shrink-0" style={{ color: '#92400E' }} />
          <span className="text-sm font-bold" style={{ color: '#7c2d12' }}>{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4" style={{ color: '#92400E' }} /> : <ChevronDown className="h-4 w-4" style={{ color: '#92400E' }} />}
      </button>
      {open && (
        <div className="px-4 pb-4 text-[13px] leading-relaxed space-y-2" style={{ color: '#7c2d12' }}>
          {children}
        </div>
      )}
    </div>
  )
}
