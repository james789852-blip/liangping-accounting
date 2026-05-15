'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ClipboardList, Wallet, ShoppingCart,
  FileText, BarChart3, History, Download, LogOut, Store
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/manager/dashboard', label: '今日狀態', icon: LayoutDashboard },
  { href: '/manager/closing', label: '每日結帳', icon: ClipboardList },
  { href: '/manager/cash', label: '現金清點', icon: Wallet },
  { href: '/manager/order', label: '叫貨明細', icon: ShoppingCart },
  { href: '/manager/receipts', label: '發票收據', icon: FileText },
  { href: '/manager/summary', label: '結算結果', icon: BarChart3 },
  { href: '/manager/history', label: '歷史紀錄', icon: History },
  { href: '/manager/export', label: '本月匯出', icon: Download },
]

interface Props {
  userName: string
  storeName: string
  role: string
}

export default function ManagerNav({ userName, storeName, role }: Props) {
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
      <aside className="hidden lg:flex flex-col w-56 bg-white border-r border-slate-200 shrink-0">
        <div className="p-4 border-b border-slate-200">
          <h1 className="font-bold text-slate-900 text-sm">梁平作帳系統</h1>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Store className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs text-slate-600">{storeName || '未指派店家'}</span>
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
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-2 border-t border-slate-200">
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-slate-900 truncate">{userName}</p>
            <p className="text-xs text-slate-400">{role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            登出
          </button>
        </div>
      </aside>

      {/* 手機頂部 bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-40 flex items-center justify-between px-4 h-12">
        <div>
          <span className="font-bold text-sm text-slate-900">梁平作帳</span>
          {storeName && <span className="text-xs text-slate-500 ml-2">{storeName}</span>}
        </div>
        <button onClick={handleLogout} className="text-slate-500">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* 手機底部 Tab */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40">
        <div className="flex justify-around py-1">
          {navItems.slice(0, 5).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1.5',
                pathname.startsWith(href) ? 'text-blue-600' : 'text-slate-400'
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
