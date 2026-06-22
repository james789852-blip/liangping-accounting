'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CheckSquare,
  Store, Users, LogOut,
  ClipboardList, History, LineChart,
  ArrowRightLeft, Package, BookOpen, Settings, FileBarChart2, ChefHat, ExternalLink,
  Menu, X,
} from 'lucide-react'

const HR_SYSTEM_URL = 'https://eric0w0chn-hue.github.io/hr-system/'
import { createClient } from '@/lib/supabase/client'
import StoreSwitcher from '@/components/manager/store-switcher'

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

const hqSections = [
  // ── 每日工作 ─────────────
  {
    label: '帳目審核',
    items: [
      { href: '/hq/closings', label: '店面帳目', icon: BookOpen },
      { href: '/hq/ck',       label: '央廚帳目', icon: ChefHat },
    ],
  },
  // ── 數據總覽 ─────────────
  {
    label: '數據分析',
    items: [
      { href: '/hq/dashboard',         label: '即時儀表板', icon: LayoutDashboard },
      { href: '/hq/food-cost-preview', label: '食耗成本',   icon: FileBarChart2 },
    ],
  },
  // ── 結帳規則 ─────────────
  {
    label: '結帳設定',
    items: [
      { href: '/hq/system-config', label: '品項 / 分類', icon: Settings },
      { href: '/hq/store-items',   label: '店家品項',    icon: Package },
      { href: '/hq/ck-prices',     label: '央廚單價',    icon: Package },
      { href: '/hq/native-export', label: 'Excel 匯出',  icon: FileBarChart2 },
    ],
  },
  // ── 系統與權限 ─────────────
  {
    label: '系統管理',
    items: [
      { href: '/hq/stores', label: '店家管理', icon: Store },
      { href: '/hq/users',  label: '帳號管理', icon: Users },
      { href: '/hq/audit',  label: '操作軌跡', icon: History },
    ],
  },
]

const managerSections = [
  {
    label: '日常',
    items: [
      { href: '/manager/closing',    label: '今日結帳', icon: ClipboardList },
      { href: '/manager/dashboard',  label: '今日狀態', icon: LayoutDashboard },
      { href: '/manager/history',    label: '歷史紀錄', icon: History },
      { href: '/manager/analytics',  label: '營運洞察', icon: LineChart },
    ],
  },
  {
    label: '設定',
    items: [
      { href: '/manager/settings', label: '收據設定', icon: Settings },
    ],
  },
]

const mobileHQTabs = [
  { href: '/hq/closings',  label: '店面',   icon: BookOpen },
  { href: '/hq/ck',        label: '央廚',   icon: ChefHat },
  { href: '/hq/dashboard', label: '儀表板', icon: LayoutDashboard },
  { href: '/hq/stores',    label: '店家',   icon: Store },
  // 「更多」由 nav 內部用 menu 處理
]
const mobileManagerTabs = [
  { href: '/manager/closing',    label: '今日結帳', icon: ClipboardList },
  { href: '/manager/dashboard',  label: '今日狀態', icon: LayoutDashboard },
  { href: '/manager/history',    label: '歷史紀錄', icon: History },
  { href: '/manager/analytics',  label: '營運洞察', icon: LineChart },
]

interface Props {
  userName: string
  role: string
  allStores?: { id: string; name: string; type?: string }[]
  currentStoreId?: string
}

export default function HQNav({ userName, role, allStores = [], currentStoreId = '' }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const isManagerPath = pathname.startsWith('/manager')
  const time = useClock()

  function isActive(href: string): boolean {
    const [path, query] = href.split('?')
    if (!pathname.startsWith(path)) return false
    // 模板設定的店面/央廚靠 ?type 區分
    if (path === '/hq/food-cost-preview') {
      const isCKLink = query?.includes('type=ck')
      const isOnCK = searchParams?.get('type') === 'ck'
      return isCKLink ? isOnCK : !isOnCK
    }
    return true
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const hasStores = allStores.length > 0
  const initial = userName ? userName.slice(0, 1) : '?'
  const mobileTabs = isManagerPath ? mobileManagerTabs : mobileHQTabs
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)

  const activeSections = isManagerPath ? managerSections : hqSections
  const activeColor = isManagerPath ? '#b45309' : '#92400E'
  const activeBg = isManagerPath ? '#fef3c7' : '#FFFBEB'
  const mobileActiveColor = isManagerPath ? '#d97706' : '#D97706'

  // 關閉抽屜當路由變化
  useEffect(() => { setMobileSheetOpen(false) }, [pathname])

  return (
    <>
      {/* ── 桌機側欄 */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white" style={{ borderRight: '1px solid #f4f4f5' }}>

        {/* 品牌 */}
        <div className="flex items-center gap-3 px-5 pt-6 pb-4">
          <img src="/icon-192.png" alt="logo" className="h-9 w-9 rounded-[10px] object-cover shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900" style={{ letterSpacing: '-0.01em' }}>結帳系統</p>
            <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>{isManagerPath ? '店長端' : '總公司端'}</p>
          </div>
        </div>

        {/* 時鐘 */}
        {time && (
          <div className="px-5 pb-3">
            <p className="text-2xl font-bold tabular-nums" style={{ color: '#18181b', letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>{time}</p>
          </div>
        )}

        {/* 輔助管理系統連結 */}
        <div className="px-4 pb-2">
          <a
            href={HR_SYSTEM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2 rounded-[10px] text-xs font-semibold transition-all hover:opacity-80"
            style={{ backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
            <ExternalLink className="h-3.5 w-3.5" />
            輔助管理系統
          </a>
        </div>

        {/* 切換按鈕 */}
        {hasStores && (
          <div className="px-4 pb-3">
            <Link
              href={isManagerPath ? '/hq/dashboard' : '/manager/dashboard'}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-[10px] text-xs font-semibold transition-all hover:opacity-80"
              style={isManagerPath
                ? { backgroundColor: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }
                : { backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }
              }>
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {isManagerPath ? '切換到總公司端' : '切換到店長端'}
            </Link>
          </div>
        )}

        <div style={{ borderTop: '1px solid #f4f4f5', margin: '0 16px' }} />

        {/* 導覽 */}
        <nav className="flex-1 px-4 py-2 overflow-y-auto">
          {activeSections.map(section => (
            <div key={section.label}>
              <p className="text-[11px] font-semibold uppercase px-3 pt-3 pb-1.5" style={{ color: '#a1a1aa', letterSpacing: '0.05em' }}>
                {section.label}
              </p>
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href)
                return (
                  <Link key={href} href={href}
                    className={cn('flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all duration-150 mb-0.5', !active && 'hover:bg-slate-50')}
                    style={active ? { backgroundColor: activeBg, color: activeColor, fontWeight: 600 } : { color: '#52525b' }}>
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </div>
          ))}

          {/* 切換店家（有多店時顯示） */}
          {hasStores && allStores.length > 1 && (
            <div className="mt-3 px-3">
              <p className="text-[11px] font-semibold uppercase mb-2" style={{ color: '#a1a1aa', letterSpacing: '0.05em' }}>切換店家</p>
              <StoreSwitcher
                stores={allStores}
                currentStoreId={currentStoreId}
                className="w-full text-sm rounded-[10px] px-3 py-2 border font-medium focus:outline-none focus:ring-2 focus:ring-indigo-300"
                style={{ borderColor: '#e4e4e7', color: '#18181b', backgroundColor: '#fafafa' }}
              />
            </div>
          )}

          <div style={{ borderTop: '1px solid #f4f4f5', margin: '12px 0 4px' }} />
          <button onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-colors hover:bg-slate-50 mb-0.5"
            style={{ color: '#52525b' }}>
            <LogOut className="h-[18px] w-[18px]" />
            登出
          </button>
        </nav>

      </aside>

      {/* ── 手機頂部 */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white flex items-center px-4 gap-2"
        style={{ height: '56px', borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <img src="/icon-192.png" alt="logo" className="h-8 w-8 rounded-[8px] object-cover shrink-0" />
        {/* 中間標題區，flex-1 + min-w-0 確保可截斷 */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
          {isManagerPath && hasStores ? (
            <>
              <Link href="/hq/dashboard" className="text-xs font-medium shrink-0 transition-opacity hover:opacity-60" style={{ color: '#a1a1aa' }}>總公司</Link>
              <span className="shrink-0" style={{ color: '#e4e4e7' }}>/</span>
              {allStores.length > 1 ? (
                <StoreSwitcher stores={allStores} currentStoreId={currentStoreId}
                  className="text-sm font-bold text-slate-900 rounded-lg px-1.5 py-0.5 focus:outline-none min-w-0 max-w-[120px]"
                  style={{ border: '1px solid #e4e4e7', backgroundColor: 'white' }} />
              ) : (
                <span className="font-bold text-sm text-slate-900 truncate">{allStores[0]?.name}</span>
              )}
            </>
          ) : (
            <span className="font-bold text-sm text-slate-900 truncate">總公司後台</span>
          )}
        </div>
        {/* 右側操作區，shrink-0 不壓縮 */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={HR_SYSTEM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold rounded-lg px-2 py-1.5 whitespace-nowrap flex items-center gap-1"
            style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
            <ExternalLink className="h-3 w-3" />HR
          </a>
          {!isManagerPath && hasStores && (
            <Link href="/manager/dashboard"
              className="text-xs font-bold text-white rounded-lg px-2 py-1.5 whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg,#f97316,#f59e0b)' }}>
              店長端
            </Link>
          )}
          {isManagerPath && hasStores && (
            <Link href="/hq/dashboard"
              className="text-xs font-bold text-white rounded-lg px-2 py-1.5 whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)' }}>
              總公司
            </Link>
          )}
          <button onClick={handleLogout} className="h-8 w-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-60" style={{ color: '#a1a1aa' }}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── 手機底部 Tab */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md"
        style={{ borderTop: '1px solid #f4f4f5', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex px-1 pt-2 pb-2">
          {mobileTabs.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className="flex flex-col items-center gap-1 flex-1 py-1">
                <Icon className="h-[22px] w-[22px]" style={{ color: active ? mobileActiveColor : '#a1a1aa' }} />
                <span className="text-[11px] font-medium" style={{ color: active ? mobileActiveColor : '#a1a1aa' }}>
                  {label}
                </span>
              </Link>
            )
          })}
          {/* 更多 (展開所有頁面) */}
          <button type="button" onClick={() => setMobileSheetOpen(true)}
            className="flex flex-col items-center gap-1 flex-1 py-1">
            <Menu className="h-[22px] w-[22px]" style={{ color: '#a1a1aa' }} />
            <span className="text-[11px] font-medium" style={{ color: '#a1a1aa' }}>更多</span>
          </button>
        </div>
      </nav>

      {/* ── 手機更多選單（bottom sheet） */}
      {mobileSheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setMobileSheetOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
            onClick={e => e.stopPropagation()}
            style={{ boxShadow: '0 -8px 32px rgba(0,0,0,0.15)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
              <p className="text-base font-bold" style={{ color: '#18181b' }}>選單</p>
              <button type="button" onClick={() => setMobileSheetOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-full"
                style={{ background: '#f4f4f5' }}>
                <X className="h-4 w-4" style={{ color: '#52525b' }} />
              </button>
            </div>
            <div className="px-3 py-3 space-y-1">
              {activeSections.map(section => (
                <div key={section.label}>
                  <p className="text-[11px] font-semibold uppercase px-3 pt-2 pb-1" style={{ color: '#a1a1aa', letterSpacing: '0.05em' }}>
                    {section.label}
                  </p>
                  {section.items.map(({ href, label, icon: Icon }) => {
                    const active = isActive(href)
                    return (
                      <Link key={href} href={href}
                        className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium"
                        style={active ? { backgroundColor: activeBg, color: activeColor, fontWeight: 600 } : { color: '#52525b' }}>
                        <Icon className="h-5 w-5 shrink-0" />
                        {label}
                      </Link>
                    )
                  })}
                </div>
              ))}
              <div style={{ borderTop: '1px solid #f4f4f5', margin: '8px 0 4px' }} />
              <a href={HR_SYSTEM_URL} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium"
                style={{ color: '#0369a1' }}>
                <ExternalLink className="h-5 w-5 shrink-0" />
                輔助管理系統
              </a>
              <button onClick={handleLogout}
                className="flex w-full items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium"
                style={{ color: '#52525b' }}>
                <LogOut className="h-5 w-5 shrink-0" />
                登出
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
