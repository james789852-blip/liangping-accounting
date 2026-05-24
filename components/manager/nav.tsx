'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ClipboardList, Wallet, ShoppingCart,
  FileText, BarChart3, History, Download, LogOut, Store
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function useClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString('zh-TW', {
        timeZone: 'Asia/Taipei',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

const navItems = [
  { href: '/manager/dashboard', label: '今日狀態', icon: LayoutDashboard },
  { href: '/manager/closing',   label: '每日結帳', icon: ClipboardList },
  { href: '/manager/cash',      label: '現金清點', icon: Wallet },
  { href: '/manager/order',     label: '叫貨明細', icon: ShoppingCart },
  { href: '/manager/receipts',  label: '發票收據', icon: FileText },
  { href: '/manager/summary',   label: '結算結果', icon: BarChart3 },
  { href: '/manager/history',   label: '歷史紀錄', icon: History },
  { href: '/manager/export',    label: '本月匯出', icon: Download },
]

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
      <aside className="hidden lg:flex flex-col w-60 shrink-0" style={{ backgroundColor: '#0c0e1a', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* 標頭 */}
        <div className="px-4 pt-6 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(99,102,241,0.15)' }}>
              <Store className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>店長端</p>
              <p className="text-sm font-bold text-white truncate mt-0.5">{storeName || '未指派店家'}</p>
            </div>
          </div>
          {time && (
            <p className="text-3xl font-bold tabular-nums text-white tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>{time}</p>
          )}
        </div>

        {/* 導覽 */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                )}
                style={!active ? { ':hover': { backgroundColor: 'rgba(255,255,255,0.06)' } } as any : undefined}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* 底部使用者 */}
        <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-indigo-300 text-sm font-bold shrink-0" style={{ backgroundColor: 'rgba(99,102,241,0.2)' }}>
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{userName}</p>
              <p className="text-xs" style={{ color: '#64748b' }}>{role}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors text-slate-500 hover:text-white"
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
            <LogOut className="h-4 w-4" /> 登出
          </button>
        </div>
      </aside>

      {/* ── 手機頂部 */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200 flex items-center px-4" style={{ height: '56px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
            <Store className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate leading-tight">{storeName || '梁平作帳'}</p>
            <p className="text-xs text-slate-400 leading-tight">{role}</p>
          </div>
        </div>
        {time && (
          <p className="text-sm font-bold tabular-nums text-slate-700 mx-3">{time}</p>
        )}
        <button onClick={handleLogout}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* ── 手機底部 Tab */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200" style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.06)' }}>
        <div className="flex justify-around px-2 pt-2 pb-3">
          {navItems.slice(0, 5).map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className="flex flex-col items-center gap-1 flex-1">
                <div className={cn(
                  'flex items-center justify-center w-10 h-7 rounded-xl transition-colors',
                  active ? 'bg-indigo-50' : ''
                )}>
                  <Icon className={cn('h-5 w-5', active ? 'text-indigo-600' : 'text-slate-400')} />
                </div>
                <span className={cn('text-[10px] font-medium', active ? 'text-indigo-600' : 'text-slate-400')}>
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
