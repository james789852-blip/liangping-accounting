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
      {/* ── 桌機側欄 ───────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0"
        style={{ background: 'linear-gradient(180deg,#1e1b4b 0%,#3730a3 100%)' }}>

        {/* 標頭 */}
        <div className="px-5 pt-6 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-400/20 flex items-center justify-center shrink-0">
              <Store className="h-4.5 w-4.5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-indigo-300 uppercase tracking-widest">店長端</p>
              <p className="text-sm font-bold text-white truncate mt-0.5">{storeName || '未指派店家'}</p>
            </div>
          </div>
          {time && (
            <p className="text-3xl font-bold tabular-nums text-white mt-4 tracking-tight">{time}</p>
          )}
        </div>

        {/* 導覽 */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-white text-indigo-700 shadow-md shadow-indigo-950/30'
                    : 'text-indigo-200 hover:bg-white/10 hover:text-white'
                )}>
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-indigo-600' : '')} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* 底部使用者 */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2 mb-1">
            <div className="h-8 w-8 rounded-full bg-indigo-500/40 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{userName}</p>
              <p className="text-xs text-indigo-300">{role}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-sm text-indigo-300 hover:bg-white/10 hover:text-white transition-colors">
            <LogOut className="h-4 w-4" /> 登出
          </button>
        </div>
      </aside>

      {/* ── 手機頂部 ───────────────────────────────── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-100 shadow-sm flex items-center px-4 h-13" style={{ height: '52px' }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <Store className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate leading-tight">{storeName || '梁平作帳'}</p>
            <p className="text-[10px] text-indigo-500 font-medium leading-tight">{role}</p>
          </div>
        </div>
        {time && (
          <p className="text-sm font-bold tabular-nums text-indigo-600 mx-3 tracking-wide">{time}</p>
        )}
        <button onClick={handleLogout}
          className="h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* ── 手機底部 Tab ────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md"
        style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.06), 0 -4px 16px rgba(79,70,229,0.08)' }}>
        <div className="flex justify-around px-1 py-1.5">
          {navItems.slice(0, 5).map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className="flex flex-col items-center gap-0.5 flex-1 py-1">
                <div className={cn(
                  'flex items-center justify-center w-11 h-7 rounded-2xl transition-all duration-200',
                  active ? 'bg-indigo-100' : ''
                )}>
                  <Icon className={cn('h-5 w-5', active ? 'text-indigo-600' : 'text-slate-400')} />
                </div>
                <span className={cn(
                  'text-[9px] font-medium leading-tight',
                  active ? 'text-indigo-600 font-semibold' : 'text-slate-400'
                )}>
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
