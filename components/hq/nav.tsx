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
  ArrowLeftRight,
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
      {/* ── 桌機側欄 ───────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0"
        style={{ background: 'linear-gradient(180deg,#0c0f1e 0%,#0f2057 60%,#1a3a8f 100%)' }}>

        {/* 標頭 */}
        <div className="px-4 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-blue-400/20 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-blue-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-blue-400 uppercase tracking-widest">
                {isManagerPath ? '店長端' : '總公司端'}
              </p>
              <p className="text-sm font-bold text-white truncate">梁平作帳系統</p>
            </div>
          </div>
          {time && (
            <p className="text-2xl font-bold tabular-nums text-white mt-3 tracking-tight">{time}</p>
          )}

          {/* 切換按鈕 */}
          {hasStores && (
            <Link
              href={isManagerPath ? '/hq/dashboard' : '/manager/dashboard'}
              className={cn(
                'mt-3 flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150',
                isManagerPath
                  ? 'bg-blue-500/25 text-blue-200 hover:bg-blue-500/40 border border-blue-500/30'
                  : 'bg-amber-500/25 text-amber-200 hover:bg-amber-500/40 border border-amber-500/30'
              )}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {isManagerPath ? '切換到總公司端' : '切換到店長端'}
            </Link>
          )}
        </div>

        {/* 導覽 */}
        <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-4">
          {/* 總公司端 */}
          <div>
            <p className="px-3 pb-1.5 text-[10px] font-semibold text-blue-400/70 uppercase tracking-widest">
              總公司端
            </p>
            <div className="space-y-0.5">
              {hqNavItems.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href)
                return (
                  <Link key={href} href={href}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
                      active
                        ? 'bg-blue-500 text-white shadow-md shadow-blue-900/40'
                        : 'text-blue-200/80 hover:bg-white/8 hover:text-white'
                    )}>
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
              <div className="flex items-center gap-2 px-3 pb-1.5">
                <p className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-widest flex-1">
                  店長端
                </p>
                {allStores.length > 1 ? (
                  <StoreSwitcher
                    stores={allStores}
                    currentStoreId={currentStoreId}
                    className="text-xs border border-white/20 rounded-lg px-1.5 py-0.5 bg-white/10 text-white focus:outline-none focus:ring-1 focus:ring-amber-400 max-w-[90px] truncate"
                  />
                ) : (
                  <span className="text-xs text-amber-300/70 truncate max-w-[90px]">{allStores[0]?.name}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {managerNavItems.map(({ href, label, icon: Icon }) => {
                  const active = pathname.startsWith(href)
                  return (
                    <Link key={href} href={href}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
                        active
                          ? 'bg-amber-500 text-white shadow-md shadow-amber-900/40'
                          : 'text-amber-200/80 hover:bg-white/8 hover:text-white'
                      )}>
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
        <div className="px-2.5 py-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <div className="h-7 w-7 rounded-full bg-blue-400/30 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{userName}</p>
              <p className="text-xs text-blue-300/80">{role}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-blue-200/70 hover:bg-white/8 hover:text-white transition-colors">
            <LogOut className="h-4 w-4" /> 登出
          </button>
        </div>
      </aside>

      {/* ── 手機頂部 ───────────────────────────────── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-[52px]"
        style={{ background: 'linear-gradient(90deg,#0f2057 0%,#1a3a8f 100%)', boxShadow: '0 1px 0 rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2 min-w-0">
          {isManagerPath && hasStores ? (
            <Link href="/hq/dashboard" className="flex items-center gap-1.5 shrink-0 text-blue-300/70 hover:text-white transition-colors">
              <Building2 className="h-4 w-4 text-blue-300" />
              <span className="text-xs">總公司</span>
            </Link>
          ) : (
            <Building2 className="h-4 w-4 text-blue-300 shrink-0" />
          )}

          {isManagerPath && hasStores ? (
            <>
              <span className="text-white/30 text-xs">/</span>
              <span className="text-xs text-white/60 shrink-0">店長端</span>
              {allStores.length > 1 ? (
                <StoreSwitcher
                  stores={allStores}
                  currentStoreId={currentStoreId}
                  className="text-sm font-bold border border-white/20 rounded-lg px-2 py-0.5 bg-white/10 text-white focus:outline-none max-w-[140px]"
                />
              ) : (
                <span className="font-bold text-sm text-white truncate">{allStores[0]?.name}</span>
              )}
            </>
          ) : (
            <span className="font-bold text-sm text-white">梁平作帳 · 總公司</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {time && (
            <span className="text-sm font-bold tabular-nums text-white/90 tracking-wide">{time}</span>
          )}
          {!isManagerPath && hasStores && (
            <Link href="/manager/dashboard"
              className="text-xs font-semibold bg-amber-500 text-white rounded-lg px-2.5 py-1 hover:bg-amber-400 transition-colors">
              店長端
            </Link>
          )}
          {isManagerPath && hasStores && (
            <Link href="/hq/dashboard"
              className="text-xs font-semibold bg-blue-500/40 text-blue-100 rounded-lg px-2.5 py-1 hover:bg-blue-500/60 transition-colors border border-blue-400/30">
              總公司
            </Link>
          )}
          <button onClick={handleLogout} className="text-white/60 hover:text-white transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── 手機底部 Tab ────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md"
        style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.06), 0 -4px 16px rgba(15,32,87,0.10)' }}>
        <div className="flex justify-around px-1 py-1.5">
          {mobileTabs.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            const activeColor = isManagerPath ? 'text-amber-600' : 'text-blue-600'
            const activeBg = isManagerPath ? 'bg-amber-100' : 'bg-blue-100'
            return (
              <Link key={href} href={href}
                className="flex flex-col items-center gap-0.5 flex-1 py-1">
                <div className={cn(
                  'flex items-center justify-center w-11 h-7 rounded-2xl transition-all duration-200',
                  active ? activeBg : ''
                )}>
                  <Icon className={cn('h-5 w-5', active ? activeColor : 'text-slate-400')} />
                </div>
                <span className={cn(
                  'text-[9px] font-medium leading-tight',
                  active ? cn(activeColor, 'font-semibold') : 'text-slate-400'
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
