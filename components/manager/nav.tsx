'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { LayoutDashboard, History, LogOut, ChefHat, ClipboardList, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const HR_SYSTEM_URL = 'https://eric0w0chn-hue.github.io/hr-system/'

function useTaipeiNow() {
  const [now, setNow] = useState({ date: '', time: '' })
  useEffect(() => {
    function tick() {
      const current = new Date()
      setNow({
        date: current.toLocaleDateString('zh-TW', {
          timeZone: 'Asia/Taipei',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }),
        time: current.toLocaleTimeString('zh-TW', {
          timeZone: 'Asia/Taipei',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

const STORE_NAV_ITEMS = [
  { href: '/manager/closing',        label: '今日結帳', icon: ClipboardList },
  { href: '/manager/dashboard',      label: '今日狀態', icon: LayoutDashboard },
  { href: '/manager/history',        label: '歷史紀錄', icon: History },
]

const CK_NAV_ITEMS = [
  { href: '/manager/ck',         label: '今日帳目', icon: ChefHat },
  { href: '/manager/dashboard',  label: '今日狀態', icon: LayoutDashboard },
  { href: '/manager/history',    label: '歷史紀錄', icon: History },
]

interface Props { userName: string; storeName: string; role: string; storeType?: string }

export default function ManagerNav({ userName, storeName, role, storeType }: Props) {
  const isCK = storeType === '央廚'
  const NAV_ITEMS = isCK ? CK_NAV_ITEMS : STORE_NAV_ITEMS
  const pathname = usePathname()
  const router = useRouter()
  const { date, time } = useTaipeiNow()

  useEffect(() => {
    for (const href of ['/manager/dashboard', '/manager/closing', '/manager/ck', '/manager/history']) {
      router.prefetch(href)
    }
  }, [router])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* ── 桌機側欄 */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-white" style={{ borderRight: '1px solid #f4f4f5' }}>

        {/* 品牌 */}
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <img src="/icon-192.png" alt="logo" className="h-9 w-9 rounded-[10px] object-cover shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900" style={{ letterSpacing: '-0.01em' }}>結帳系統</p>
            <p className="text-xs mt-0.5 truncate" style={{ color: '#a1a1aa' }}>{storeName || '未指派'} · {role}</p>
          </div>
        </div>

        {/* 時鐘 */}
        {time && (
          <div className="px-5 pb-3">
            <p className="text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>{date}</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: '#18181b', letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>{time}</p>
          </div>
        )}

        <div className="px-4 pb-3">
          <a
            href={HR_SYSTEM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2 rounded-[10px] text-xs font-semibold transition-all hover:opacity-80"
            style={{ backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            輔助管理系統
          </a>
        </div>

        {/* 導覽 */}
        <nav className="flex-1 px-4 pb-4 space-y-0.5">
          <p className="text-[10px] font-bold uppercase px-3 pb-2" style={{ color: '#a1a1aa', letterSpacing: '0.08em' }}>日常</p>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all duration-150',
                  active ? 'font-semibold' : 'hover:bg-slate-50'
                )}
                style={active ? { backgroundColor: '#FFFBEB', color: '#92400E' } : { color: '#52525b' }}>
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {label}
              </Link>
            )
          })}

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
            <p className="text-sm font-bold text-slate-900 truncate leading-tight">{storeName || '結帳系統'}</p>
            <p className="text-[10px] leading-tight" style={{ color: '#a1a1aa' }}>{role}</p>
          </div>
        </div>
        {time && (
          <div className="mx-2 text-right shrink-0">
            <p className="text-[10px] leading-tight" style={{ color: '#a1a1aa' }}>{date}</p>
            <p className="text-sm font-bold tabular-nums leading-tight" style={{ color: '#18181b' }}>{time}</p>
          </div>
        )}
        <a
          href={HR_SYSTEM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="h-8 px-2 flex items-center justify-center gap-1 rounded-lg text-xs font-semibold shrink-0"
          style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}
        >
          <ExternalLink className="h-3 w-3" />
          HR
        </a>
        <button onClick={handleLogout} className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors hover:bg-slate-50" style={{ color: '#a1a1aa' }}>
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* ── 手機底部 Tab（3 項） */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md"
        style={{ borderTop: '1px solid #f4f4f5', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex px-2 pt-2 pb-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href} className="flex flex-col items-center gap-1 flex-1 py-1">
                <Icon className="h-[22px] w-[22px]" style={{ color: active ? '#D97706' : '#a1a1aa' }} />
                <span className="text-[11px] font-medium" style={{ color: active ? '#D97706' : '#a1a1aa' }}>
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
