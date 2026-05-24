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

  const mobileHQTabs = [hqNavItems[0], hqNavItems[2], hqNavItems[4], hqNavItems[8], hqNavItems[9]]
  const mobileTabs = isManagerPath ? managerNavItems.slice(0, 5) : mobileHQTabs
  const hasStores = allStores.length > 0
  const initial = userName ? userName.slice(0, 1) : '?'

  const activeAccent = isManagerPath
    ? { bg: 'bg-amber-500', shadow: 'shadow-amber-900/40', tab: 'text-amber-500', tabBg: 'bg-amber-500' }
    : { bg: 'bg-blue-600', shadow: 'shadow-blue-900/40', tab: 'text-blue-600', tabBg: 'bg-blue-600' }

  return (
    <>
      {/* ── 桌機側欄 */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0" style={{ background: '#0f1117', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* 品牌標頭 */}
        <div className="relative px-5 pt-7 pb-6 overflow-hidden" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="absolute -top-8 -left-8 h-36 w-36 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.16) 0%, transparent 70%)' }} />

          <div className="relative flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)', boxShadow: '0 4px 12px rgba(59,130,246,0.45)' }}>
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                {isManagerPath ? '店長端' : '總公司端'}
              </p>
              <p className="text-sm font-bold text-white truncate mt-0.5">梁平作帳系統</p>
            </div>
          </div>

          {time && (
            <p className="relative text-4xl font-bold text-white tabular-nums" style={{ letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>{time}</p>
          )}

          {/* 切換按鈕 */}
          {hasStores && (
            <Link
              href={isManagerPath ? '/hq/dashboard' : '/manager/dashboard'}
              className="relative mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all hover:opacity-90"
              style={isManagerPath
                ? { background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.25)' }
                : { background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.25)' }
              }>
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {isManagerPath ? '切換到總公司端' : '切換到店長端'}
            </Link>
          )}
        </div>

        {/* 導覽 */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
          {/* 總公司 */}
          <div>
            <p className="px-3.5 mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#475569' }}>總公司端</p>
            <div className="space-y-0.5">
              {hqNavItems.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href)
                return (
                  <Link key={href} href={href}
                    className={cn(
                      'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                      active ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/50' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
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
              <div className="flex items-center gap-2 px-3.5 mb-2">
                <p className="flex-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#475569' }}>店長端</p>
                {allStores.length > 1 ? (
                  <StoreSwitcher
                    stores={allStores}
                    currentStoreId={currentStoreId}
                    className="text-xs rounded-lg px-2 py-1 text-slate-300 focus:outline-none max-w-[90px] truncate"
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
                        'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                        active ? 'bg-amber-500 text-white shadow-sm shadow-amber-900/50' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
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

        {/* 使用者 */}
        <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 px-3 py-2 mb-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
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
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white flex items-center justify-between px-4" style={{ height: '60px', borderBottom: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          {isManagerPath && hasStores ? (
            <Link href="/hq/dashboard" className="flex items-center gap-1.5 shrink-0 transition-opacity hover:opacity-70">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)' }}>
                <Building2 className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-xs text-slate-400">總公司</span>
            </Link>
          ) : (
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)', boxShadow: '0 3px 8px rgba(59,130,246,0.35)' }}>
              <Building2 className="h-4 w-4 text-white" />
            </div>
          )}

          {isManagerPath && hasStores ? (
            <>
              <span className="text-slate-300">/</span>
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
          {time && <span className="text-sm font-bold tabular-nums text-slate-600">{time}</span>}
          {!isManagerPath && hasStores && (
            <Link href="/manager/dashboard"
              className="text-xs font-bold text-white rounded-xl px-3 py-1.5 transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 2px 8px rgba(245,158,11,0.35)' }}>
              店長端
            </Link>
          )}
          {isManagerPath && hasStores && (
            <Link href="/hq/dashboard"
              className="text-xs font-bold text-white rounded-xl px-3 py-1.5 transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)', boxShadow: '0 2px 8px rgba(59,130,246,0.35)' }}>
              總公司
            </Link>
          )}
          <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── 手機底部 Tab */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' }}>
        <div className="flex px-2 pt-2 pb-3">
          {mobileTabs.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className="flex flex-col items-center gap-1 flex-1">
                <div className={cn(
                  'flex items-center justify-center w-11 h-8 rounded-xl transition-all duration-200',
                  active ? activeAccent.tabBg + ' shadow-sm' : ''
                )}
                  style={active ? { boxShadow: isManagerPath ? '0 2px 8px rgba(245,158,11,0.3)' : '0 2px 8px rgba(59,130,246,0.3)' } : undefined}>
                  <Icon className={cn('h-5 w-5', active ? 'text-white' : 'text-slate-400')} />
                </div>
                <span className={cn('text-[10px] font-semibold', active ? activeAccent.tab : 'text-slate-400')}>
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
