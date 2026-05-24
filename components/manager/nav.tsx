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
      <aside className="hidden lg:flex flex-col w-64 shrink-0" style={{ background: '#0f1117', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* 品牌標頭 */}
        <div className="relative px-5 pt-7 pb-6 overflow-hidden" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {/* 背景光暈 */}
          <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)' }} />

          <div className="relative flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', boxShadow: '0 4px 12px rgba(99,102,241,0.45)' }}>
              <Store className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">店長端</p>
              <p className="text-sm font-bold text-white truncate mt-0.5">{storeName || '未指派店家'}</p>
            </div>
          </div>
          {time && (
            <p className="relative text-4xl font-bold text-white tabular-nums" style={{ letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>{time}</p>
          )}
        </div>

        {/* 導覽 */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className={cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/50'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                )}>
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* 使用者 */}
        <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 px-3 py-2 mb-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{userName}</p>
              <p className="text-xs text-slate-500">{role}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-white hover:bg-white/[0.06] transition-colors">
            <LogOut className="h-4 w-4" /> 登出
          </button>
        </div>
      </aside>

      {/* ── 手機頂部 */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white flex items-center px-4" style={{ height: '60px', borderBottom: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', boxShadow: '0 3px 8px rgba(99,102,241,0.35)' }}>
            <Store className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate leading-tight">{storeName || '梁平作帳'}</p>
            <p className="text-[10px] text-slate-400 leading-tight">{role}</p>
          </div>
        </div>
        {time && (
          <p className="text-sm font-bold tabular-nums mx-3" style={{ color: '#64748b', fontFeatureSettings: '"tnum"' }}>{time}</p>
        )}
        <button onClick={handleLogout}
          className="h-9 w-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* ── 手機底部 Tab */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' }}>
        <div className="flex px-2 pt-2 pb-3">
          {navItems.slice(0, 5).map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className="flex flex-col items-center gap-1 flex-1">
                <div className={cn(
                  'flex items-center justify-center w-11 h-8 rounded-xl transition-all duration-200',
                  active ? 'bg-indigo-600 shadow-sm shadow-indigo-500/30' : ''
                )}>
                  <Icon className={cn('h-5 w-5', active ? 'text-white' : 'text-slate-400')} />
                </div>
                <span className={cn('text-[10px] font-semibold', active ? 'text-indigo-600' : 'text-slate-400')}>
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
