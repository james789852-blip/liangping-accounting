'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CreditCard, CheckSquare, Video,
  Store, BarChart3, FileSpreadsheet, Shield,
  Settings, Users, LogOut, Building2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/hq/dashboard', label: '即時儀表板', icon: LayoutDashboard },
  { href: '/hq/payouts', label: '平台匯款', icon: CreditCard },
  { href: '/hq/reviews', label: '審核中心', icon: CheckSquare },
  { href: '/hq/videos', label: '影片庫', icon: Video },
  { href: '/hq/stores', label: '店家管理', icon: Store },
  { href: '/hq/reports', label: '月度報表', icon: BarChart3 },
  { href: '/hq/excel', label: 'Excel 匯出', icon: FileSpreadsheet },
  { href: '/hq/audit', label: '稽核中心', icon: Shield },
  { href: '/hq/settings', label: '系統設定', icon: Settings },
  { href: '/hq/users', label: '帳號管理', icon: Users },
]

interface Props {
  userName: string
  role: string
}

export default function HQNav({ userName, role }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* 桌機側邊欄 */}
      <aside className="hidden lg:flex flex-col w-56 bg-slate-900 shrink-0">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-400" />
            <div>
              <h1 className="font-bold text-white text-sm">梁平作帳系統</h1>
              <p className="text-xs text-slate-400">總公司端</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                pathname.startsWith(href)
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-2 border-t border-slate-700">
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-slate-400">{role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            登出
          </button>
        </div>
      </aside>

      {/* 手機頂部 */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-slate-900 z-40 flex items-center justify-between px-4 h-12">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-blue-400" />
          <span className="font-bold text-sm text-white">梁平作帳 · 總公司</span>
        </div>
        <button onClick={handleLogout} className="text-slate-300">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* 手機底部 Tab */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 z-40">
        <div className="flex justify-around py-1">
          {navItems.slice(0, 5).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1.5',
                pathname.startsWith(href) ? 'text-blue-400' : 'text-slate-400'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[9px]">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
