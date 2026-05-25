'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ClipboardList, Wallet, ShoppingCart,
  FileText, BarChart3, History, Download, LogOut, Settings,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function useClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString('zh-TW', {
        timeZone: 'Asia/Taipei',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

const sections = [
  {
    label: '今日',
    items: [
      { href: '/manager/dashboard', label: '今日狀態', icon: LayoutDashboard },
      { href: '/manager/closing',   label: '每日結帳', icon: ClipboardList },
      { href: '/manager/cash',      label: '現金清點', icon: Wallet },
      { href: '/manager/order',     label: '叫貨明細', icon: ShoppingCart },
    ],
  },
  {
    label: '紀錄',
    items: [
      { href: '/manager/receipts', label: '發票收據', icon: FileText },
      { href: '/manager/summary',  label: '結算結果', icon: BarChart3 },
      { href: '/manager/history',  label: '歷史紀錄', icon: History },
      { href: '/manager/export',   label: '本月匯出', icon: Download },
    ],
  },
]

const allNavItems = sections.flatMap(s => s.items)

interface Props { userName: string; storeName: string; role: string }

export default function ManagerNav({ userName, storeName, role }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const time = useClock()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initial = userName ? userName.slice(0, 1) : '?'

  return (
    <>
      {/* ── 桌機側欄 */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white" style={{ borderRight: '1px solid #f4f4f5' }}>

        {/* 品牌 */}
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <img src="/icon-192.png" alt="logo" className="h-9 w-9 rounded-[10px] object-cover shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900" style={{ letterSpacing: '-0.01em' }}>梁平-作帳</p>
            <p className="text-xs mt-0.5 truncate" style={{ color: '#a1a1aa' }}>{storeName || '未指派'} · {role}</p>
          </div>
        </div>

        {/* 時鐘 */}
        {time && (
          <div className="px-5 pb-4">
            <p className="text-2xl font-bold tabular-nums" style={{ color: '#18181b', letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>{time}</p>
          </div>
        )}

        {/* 導覽 */}
        <nav className="flex-1 px-4 pb-4 overflow-y-auto">
          {sections.map(section => (
            <div key={section.label}>
              <p className="text-[11px] font-semibold uppercase px-3 pt-3 pb-1.5" style={{ color: '#a1a1aa', letterSpacing: '0.05em' }}>
                {section.label}
              </p>
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href)
                return (
                  <Link key={href} href={href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all duration-150 mb-0.5',
                      active
                        ? 'font-semibold'
                        : 'hover:bg-slate-50'
                    )}
                    style={active
                      ? { backgroundColor: '#eef2ff', color: '#4338ca' }
                      : { color: '#52525b' }
                    }>
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </div>
          ))}

          <div style={{ borderTop: '1px solid #f4f4f5', margin: '12px 0 4px' }} />
          <button onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-colors hover:bg-slate-50"
            style={{ color: '#52525b' }}>
            <LogOut className="h-[18px] w-[18px]" />
            登出
          </button>
        </nav>

      </aside>

      {/* ── 手機頂部 */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white flex items-center px-4"
        style={{ height: '56px', borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <img src="/icon-192.png" alt="logo" className="h-8 w-8 rounded-[8px] object-cover shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate leading-tight">{storeName || '梁平-作帳'}</p>
            <p className="text-[10px] leading-tight" style={{ color: '#a1a1aa' }}>{role}</p>
          </div>
        </div>
        {time && <p className="text-sm font-bold tabular-nums mx-3" style={{ color: '#18181b' }}>{time}</p>}
        <button onClick={handleLogout} className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors hover:bg-slate-50" style={{ color: '#a1a1aa' }}>
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* ── 手機底部 Tab */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md"
        style={{ borderTop: '1px solid #f4f4f5', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex px-1 pt-2 pb-2">
          {allNavItems.slice(0, 5).map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className="flex flex-col items-center gap-1 flex-1 py-1">
                <Icon className={cn('h-[22px] w-[22px]')} style={{ color: active ? '#4f46e5' : '#a1a1aa' }} />
                <span className="text-[11px] font-medium" style={{ color: active ? '#4f46e5' : '#a1a1aa' }}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
