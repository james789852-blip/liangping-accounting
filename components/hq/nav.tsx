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
  {
    label: '營運',
    items: [
      { href: '/hq/dashboard',     label: '即時儀表板', icon: LayoutDashboard },
      { href: '/hq/payouts',       label: '平台匯款',   icon: CreditCard },
      { href: '/hq/reviews',       label: '審核中心',   icon: CheckSquare },
      { href: '/hq/videos',        label: '影片庫',     icon: Video },
      { href: '/hq/stores',        label: '店家管理',   icon: Store },
    ],
  },
  {
    label: '分析',
    items: [
      { href: '/hq/reports',       label: '月度報表',   icon: BarChart3 },
      { href: '/hq/excel',         label: 'Excel 匯出', icon: FileSpreadsheet },
      { href: '/hq/audit',         label: '稽核中心',   icon: Shield },
      { href: '/hq/item-mappings', label: '品項對應',   icon: FileText },
    ],
  },
  {
    label: '設定',
    items: [
      { href: '/hq/settings', label: '系統設定', icon: Settings },
      { href: '/hq/users',    label: '帳號管理', icon: Users },
    ],
  },
]

const managerSections = [
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

const mobileHQTabs = [
  { href: '/hq/dashboard',  label: '儀表板', icon: LayoutDashboard },
  { href: '/hq/reviews',    label: '審核',   icon: CheckSquare },
  { href: '/hq/stores',     label: '店家',   icon: Store },
  { href: '/hq/settings',   label: '設定',   icon: Settings },
  { href: '/hq/users',      label: '帳號',   icon: Users },
]
const mobileManagerTabs = [
  { href: '/manager/dashboard', label: '今日', icon: LayoutDashboard },
  { href: '/manager/closing',   label: '結帳', icon: ClipboardList },
  { href: '/manager/cash',      label: '現金', icon: Wallet },
  { href: '/manager/receipts',  label: '收據', icon: FileText },
  { href: '/manager/summary',   label: '結算', icon: BarChart3 },
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

  const hasStores = allStores.length > 0
  const initial = userName ? userName.slice(0, 1) : '?'
  const mobileTabs = isManagerPath ? mobileManagerTabs : mobileHQTabs

  const activeSections = isManagerPath ? managerSections : hqSections
  const activeColor = isManagerPath ? '#b45309' : '#4338ca'
  const activeBg = isManagerPath ? '#fef3c7' : '#eef2ff'
  const mobileActiveColor = isManagerPath ? '#d97706' : '#4f46e5'

  return (
    <>
      {/* ── 桌機側欄 */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white" style={{ borderRight: '1px solid #f4f4f5' }}>

        {/* 品牌 */}
        <div className="flex items-center gap-3 px-5 pt-6 pb-4">
          <div className="h-9 w-9 rounded-[10px] flex items-center justify-center text-white font-extrabold text-base shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#ec4899 100%)' }}>
            梁
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900" style={{ letterSpacing: '-0.01em' }}>梁平-作帳</p>
            <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>{isManagerPath ? '店長端' : '總公司端'}</p>
          </div>
        </div>

        {/* 時鐘 */}
        {time && (
          <div className="px-5 pb-3">
            <p className="text-2xl font-bold tabular-nums" style={{ color: '#18181b', letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>{time}</p>
          </div>
        )}

        {/* 切換按鈕 */}
        {hasStores && (
          <div className="px-4 pb-3">
            <Link
              href={isManagerPath ? '/hq/dashboard' : '/manager/dashboard'}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-[10px] text-xs font-semibold transition-all hover:opacity-80"
              style={isManagerPath
                ? { backgroundColor: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' }
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
                const active = pathname.startsWith(href)
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

        {/* 使用者 */}
        <div className="px-4 py-4" style={{ borderTop: '1px solid #f4f4f5' }}>
          <div className="flex items-center gap-3 px-2">
            <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{userName}</p>
              <p className="text-xs truncate" style={{ color: '#a1a1aa' }}>{role}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── 手機頂部 */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white flex items-center justify-between px-4"
        style={{ height: '56px', borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-[8px] flex items-center justify-center text-white font-extrabold text-sm shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899)' }}>
            梁
          </div>
          {isManagerPath && hasStores ? (
            <>
              <Link href="/hq/dashboard" className="text-xs font-medium transition-opacity hover:opacity-60" style={{ color: '#a1a1aa' }}>總公司</Link>
              <span style={{ color: '#e4e4e7' }}>/</span>
              {allStores.length > 1 ? (
                <StoreSwitcher stores={allStores} currentStoreId={currentStoreId}
                  className="text-sm font-bold text-slate-900 rounded-lg px-2 py-0.5 focus:outline-none max-w-[140px]"
                  style={{ border: '1px solid #e4e4e7', backgroundColor: 'white' }} />
              ) : (
                <span className="font-bold text-sm text-slate-900 truncate">{allStores[0]?.name}</span>
              )}
            </>
          ) : (
            <span className="font-bold text-sm text-slate-900">梁平-作帳 · 總公司</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {time && <span className="text-sm font-bold tabular-nums" style={{ color: '#18181b' }}>{time}</span>}
          {!isManagerPath && hasStores && (
            <Link href="/manager/dashboard"
              className="text-xs font-bold text-white rounded-lg px-2.5 py-1.5"
              style={{ background: 'linear-gradient(135deg,#f97316,#f59e0b)' }}>
              店長端
            </Link>
          )}
          {isManagerPath && hasStores && (
            <Link href="/hq/dashboard"
              className="text-xs font-bold text-white rounded-lg px-2.5 py-1.5"
              style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
              總公司
            </Link>
          )}
          <button onClick={handleLogout} className="transition-opacity hover:opacity-60" style={{ color: '#a1a1aa' }}>
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
        </div>
      </nav>
    </>
  )
}
