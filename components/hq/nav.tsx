'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CreditCard, CheckSquare, Video,
  Store, BarChart3, FileSpreadsheet, Shield,
  Settings, Users, LogOut, Building2,
  ClipboardList, Wallet, ShoppingCart, FileText, History, Download,
  ArrowRightLeft,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import StoreSwitcher from '@/components/manager/store-switcher'

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

const hqNavItems = [
  { href: '/hq/dashboard',     label: '即時儀表板', icon: LayoutDashboard },
  { href: '/hq/payouts',       label: '平台匯款',   icon: CreditCard },
  { href: '/hq/reviews',       label: '審核中心',   icon: CheckSquare },
  { href: '/hq/videos',        label: '影片庫',     icon: Video },
  { href: '/hq/stores',        label: '店家管理',   icon: Store },
  { href: '/hq/reports',       label: '月度報表',   icon: BarChart3 },
  { href: '/hq/excel',         label: 'Excel 匯出', icon: FileSpreadsheet },
  { href: '/hq/audit',         label: '稽核中心',   icon: Shield },
  { href: '/hq/settings',      label: '系統設定',   icon: Settings },
  { href: '/hq/users',         label: '帳號管理',   icon: Users },
  { href: '/hq/item-mappings', label: '品項對應',   icon: FileText },
]

const managerNavItems = [
  { href: '/manager/dashboard', label: '今日狀態', icon: LayoutDashboard },
  { href: '/manager/closing',   label: '每日結帳', icon: ClipboardList },
  { href: '/manager/cash',      label: '現金清點', icon: Wallet },
  { href: '/manager/order',     label: '叫貨明細', icon: ShoppingCart },
  { href: '/manager/receipts',  label: '發票收據', icon: FileText },
  { href: '/manager/summary',   label: '結算結果', icon: BarChart3 },
  { href: '/manager/history',   label: '歷史紀錄', icon: History },
  { href: '/manager/export',    label: '本月匯出', icon: Download },
]

interface Props {
  userName: string
  role: string
  allStores?: { id: string; name: string }[]
  currentStoreId?: string
}

export default function HQNav({ userName, role, allStores = [], currentStoreId = '' }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const isManagerPath = pathname.startsWith('/manager')
  const time = useClock()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const mobileHQTabs = [
    hqNavItems[0],
    hqNavItems[2],
    hqNavItems[4],
    hqNavItems[8],
    hqNavItems[9],
  ]
  const mobileTabs = isManagerPath ? managerNavItems.slice(0, 5) : mobileHQTabs
  const hasStores = allStores.length > 0
  const initial = userName ? userName.slice(0, 1) : '?'

  return (
    <>
      {/* ── 桌機側欄 */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0" style={{ backgroundColor: '#0c0e1a', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* 標頭 */}
        <div className="px-4 pt-6 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.15)' }}>
              <Building2 className="h-4 w-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>
                {isManagerPath ? '店長端' : '總公司端'}
              </p>
              <p className="text-sm font-bold text-white truncate mt-0.5">梁平作帳系統</p>
            </div>
          </div>
          {time && (
            <p className="text-3xl font-bold tabular-nums text-white tracking-tight">{time}</p>
          )}

          {/* 切換按鈕 */}
          {hasStores && (
            <Link
              href={isManagerPath ? '/hq/dashboard' : '/manager/dashboard'}
              className="mt-4 flex items-center justify-center gap-2 w-full py-2 rounded-xl text-xs font-semibold transition-colors"
              style={{
                backgroundColor: isManagerPath ? 'rgba(59,130,246,0.12)' : 'rgba(245,158,11,0.12)',
                color: isManagerPath ? '#93c5fd' : '#fcd34d',
                border: isManagerPath ? '1px solid rgba(59,130,246,0.2)' : '1px solid rgba(245,158,11,0.2)',
              }}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {isManagerPath ? '切換到總公司端' : '切換到店長端'}
            </Link>
          )}
        </div>

        {/* 導覽 */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
          {/* 總公司 */}
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>
              總公司端
            </p>
            <div className="space-y-0.5">
              {hqNavItems.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href)
                return (
                  <Link key={href} href={href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                      active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    )}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.06)' }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>

          {/* 店長端 */}
          {hasStores && (
            <div>
              <div className="flex items-center gap-2 px-3 mb-1.5">
                <p className="flex-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>
                  店長端
                </p>
                {allStores.length > 1 ? (
                  <StoreSwitcher
                    stores={allStores}
                    currentStoreId={currentStoreId}
                    className="text-xs rounded-lg px-2 py-0.5 text-slate-300 focus:outline-none max-w-[90px] truncate"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                ) : (
                  <span className="text-xs text-slate-500 truncate max-w-[90px]">{allStores[0]?.name}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {managerNavItems.map(({ href, label, icon: Icon }) => {
                  const active = pathname.startsWith(href)
                  return (
                    <Link key={href} href={href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                        active ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'
                      )}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.06)' }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </nav>

        {/* 底部使用者 */}
        <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-blue-300 text-sm font-bold shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.2)' }}>
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{userName}</p>
              <p className="text-xs" style={{ color: '#64748b' }}>{role}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-white transition-colors"
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
            <LogOut className="h-4 w-4" /> 登出
          </button>
        </div>
      </aside>

      {/* ── 手機頂部 */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200 flex items-center justify-between px-4" style={{ height: '56px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          {isManagerPath && hasStores ? (
            <Link href="/hq/dashboard" className="flex items-center gap-1.5 shrink-0 text-slate-400 hover:text-slate-700 transition-colors">
              <Building2 className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-slate-500">總公司</span>
            </Link>
          ) : (
            <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-white" />
            </div>
          )}

          {isManagerPath && hasStores ? (
            <>
              <span className="text-slate-300 text-sm">/</span>
              {allStores.length > 1 ? (
                <StoreSwitcher stores={allStores} currentStoreId={currentStoreId}
                  className="text-sm font-bold text-slate-900 border border-slate-200 rounded-lg px-2 py-0.5 bg-white focus:outline-none max-w-[150px]" />
              ) : (
                <span className="font-bold text-sm text-slate-900 truncate">{allStores[0]?.name}</span>
              )}
            </>
          ) : (
            <span className="font-bold text-sm text-slate-900">梁平作帳 · 總公司</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {time && <span className="text-sm font-bold tabular-nums text-slate-700">{time}</span>}
          {!isManagerPath && hasStores && (
            <Link href="/manager/dashboard"
              className="text-xs font-semibold bg-amber-500 text-white rounded-lg px-2.5 py-1.5 hover:bg-amber-600 transition-colors">
              店長端
            </Link>
          )}
          {isManagerPath && hasStores && (
            <Link href="/hq/dashboard"
              className="text-xs font-semibold bg-blue-600 text-white rounded-lg px-2.5 py-1.5 hover:bg-blue-700 transition-colors">
              總公司
            </Link>
          )}
          <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── 手機底部 Tab */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200" style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.06)' }}>
        <div className="flex justify-around px-2 pt-2 pb-3">
          {mobileTabs.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            const activeColor = isManagerPath ? 'text-amber-600' : 'text-blue-600'
            const activeBg = isManagerPath ? 'bg-amber-50' : 'bg-blue-50'
            return (
              <Link key={href} href={href}
                className="flex flex-col items-center gap-1 flex-1">
                <div className={cn('flex items-center justify-center w-10 h-7 rounded-xl transition-colors', active ? activeBg : '')}>
                  <Icon className={cn('h-5 w-5', active ? activeColor : 'text-slate-400')} />
                </div>
                <span className={cn('text-[10px] font-medium', active ? activeColor : 'text-slate-400')}>
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
