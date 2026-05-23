import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  ClipboardList, CheckCircle2, Clock, AlertTriangle,
  ChevronRight, History, TrendingUp, FileText, Wallet,
} from 'lucide-react'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'

export const dynamic = 'force-dynamic'

function fmt(n: number) {
  return Math.round(n).toLocaleString('zh-TW')
}

const STATUS_CONFIG = {
  none:      { label: '尚未結帳', desc: '今日結帳尚未開始',   icon: Clock,         gradient: 'from-slate-500 to-slate-600',   ring: 'ring-slate-200' },
  draft:     { label: '草稿中',   desc: '已存草稿，尚未送出', icon: Clock,         gradient: 'from-amber-500 to-orange-500',  ring: 'ring-amber-200' },
  submitted: { label: '待審核',   desc: '等待總公司審核',     icon: CheckCircle2,  gradient: 'from-blue-500 to-indigo-500',   ring: 'ring-blue-200' },
  verified:  { label: '已審核',   desc: '今日結帳完成',       icon: CheckCircle2,  gradient: 'from-emerald-500 to-teal-500',  ring: 'ring-emerald-200' },
  disputed:  { label: '異議中',   desc: '請查看退回原因',     icon: AlertTriangle, gradient: 'from-red-500 to-rose-500',      ring: 'ring-red-200' },
}

const RECENT_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft:     { label: '草稿',   cls: 'bg-amber-100 text-amber-700' },
  submitted: { label: '待審核', cls: 'bg-blue-100 text-blue-700' },
  verified:  { label: '已審核', cls: 'bg-emerald-100 text-emerald-700' },
  disputed:  { label: '異議中', cls: 'bg-red-100 text-red-700' },
}

export default async function ManagerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, store_ids').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  const today = getBusinessDate()
  const todayDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  const todayLabel = format(todayDate, 'M 月 d 日（EEEE）', { locale: zhTW })

  // Taiwan time for greeting
  const twHour = new Date(Date.now() + 8 * 3600000).getUTCHours()
  const greeting = twHour < 12 ? '早安' : twHour < 18 ? '午安' : '晚安'

  let store = null
  let todayClosing: any = null
  let recentClosings: any[] = []

  if (storeId) {
    const [storeRes, closingRes, recentRes] = await Promise.all([
      supabase.from('stores').select('name, petty_cash').eq('id', storeId).single(),
      supabase.from('daily_closings')
        .select('id, status, total_revenue, variance, submitted_at')
        .eq('store_id', storeId).eq('business_date', today).maybeSingle(),
      supabase.from('daily_closings')
        .select('id, business_date, status, total_revenue, variance')
        .eq('store_id', storeId)
        .order('business_date', { ascending: false })
        .limit(6),
    ])
    store = storeRes.data
    todayClosing = closingRes.data
    recentClosings = recentRes.data ?? []
  }

  const statusKey = !todayClosing ? 'none' : todayClosing.status as keyof typeof STATUS_CONFIG
  const statusCfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.none
  const StatusIcon = statusCfg.icon

  const actionHref = !todayClosing || todayClosing.status === 'draft' ? '/manager/closing'
    : todayClosing.status === 'disputed' ? `/manager/edit/${todayClosing.id}`
    : '/manager/summary'

  const actionLabel = !todayClosing ? '開始今日結帳'
    : todayClosing.status === 'draft' ? '繼續填寫結帳'
    : todayClosing.status === 'disputed' ? '修正退回帳目'
    : '查看今日結帳'

  const varColor = !todayClosing ? '' :
    Math.abs(todayClosing.variance) === 0 ? 'text-emerald-400' :
    Math.abs(todayClosing.variance) <= 200 ? 'text-amber-300' : 'text-red-400'

  const recentFiltered = recentClosings.filter(c => c.business_date !== today).slice(0, 4)

  return (
    <div className="max-w-xl mx-auto pb-24 lg:pb-8">
      {/* 頂部漸層橫幅 */}
      <div className="px-4 pt-6 pb-8"
        style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#3730a3 60%,#4f46e5 100%)' }}>
        <p className="text-indigo-300 text-sm font-medium">{todayLabel}</p>
        <h1 className="text-2xl font-bold text-white mt-1">
          {greeting}，{profile?.name ?? '店長'}
        </h1>
        {store && (
          <p className="text-indigo-300/80 text-sm mt-0.5">{store.name}</p>
        )}
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* 今日狀態卡 */}
        <div className="rounded-2xl overflow-hidden shadow-lg shadow-indigo-900/20">
          <div className={cn('bg-gradient-to-r text-white px-5 py-4', statusCfg.gradient)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <StatusIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-lg leading-tight">{statusCfg.label}</p>
                  <p className="text-sm opacity-80">{statusCfg.desc}</p>
                </div>
              </div>
              {todayClosing && (
                <div className="text-right">
                  <p className="text-xs opacity-70">營業額</p>
                  <p className="text-xl font-bold tabular-nums">${fmt(todayClosing.total_revenue)}</p>
                </div>
              )}
            </div>
          </div>

          {todayClosing && (
            <div className="bg-white px-5 py-3 flex items-center justify-between border-t border-slate-100">
              <span className="text-sm text-slate-500">現金誤差</span>
              <span className={cn('text-lg font-bold tabular-nums', varColor.replace('text-emerald-400', 'text-emerald-600').replace('text-amber-300', 'text-amber-600').replace('text-red-400', 'text-red-600'))}>
                {todayClosing.variance >= 0 ? '+' : ''}{fmt(todayClosing.variance)} 元
              </span>
            </div>
          )}
        </div>

        {/* 主要行動按鈕 */}
        <Link href={actionHref}>
          <div className={cn(
            'flex items-center gap-4 p-4 rounded-2xl transition-all duration-150 active:scale-[0.98]',
            todayClosing?.status === 'disputed'
              ? 'bg-gradient-to-r from-red-500 to-rose-600 shadow-lg shadow-red-500/30'
              : todayClosing?.status === 'verified' || todayClosing?.status === 'submitted'
              ? 'bg-gradient-to-r from-indigo-500 to-blue-600 shadow-lg shadow-indigo-500/30'
              : 'bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/30'
          )}>
            <div className="h-11 w-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white text-base">{actionLabel}</p>
              <p className="text-xs mt-0.5 text-white/70">業務日 {today}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/60" />
          </div>
        </Link>

        {/* 快捷功能 */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { href: '/manager/receipts', icon: FileText,   label: '發票收據', color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
            { href: '/manager/cash',     icon: Wallet,      label: '現金清點', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
            { href: '/manager/summary',  icon: TrendingUp,  label: '結算結果', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className={cn('flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-150 active:scale-95', item.bg, item.border)}>
              <item.icon className={cn('h-5 w-5', item.color)} />
              <span className={cn('text-xs font-medium', item.color)}>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* 近期紀錄 */}
        {recentFiltered.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <History className="h-4 w-4 text-indigo-400" /> 近期紀錄
              </h2>
              <Link href="/manager/history" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                全部查看 →
              </Link>
            </div>
            <div className="rounded-2xl overflow-hidden border border-slate-100 bg-white shadow-sm">
              {recentFiltered.map((c, idx) => {
                const vc = Math.abs(c.variance) === 0 ? 'text-emerald-600' :
                  Math.abs(c.variance) <= 200 ? 'text-amber-600' : 'text-red-600'
                const badge = RECENT_STATUS_BADGE[c.status]
                return (
                  <Link key={c.id} href={`/manager/history/${c.id}`}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors',
                      idx !== recentFiltered.length - 1 && 'border-b border-slate-100'
                    )}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700">{c.business_date}</p>
                    </div>
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', badge?.cls)}>
                      {badge?.label}
                    </span>
                    <div className="text-right shrink-0 min-w-[64px]">
                      <p className="text-xs font-semibold text-slate-700 tabular-nums">${fmt(c.total_revenue)}</p>
                      <p className={cn('text-xs tabular-nums', vc)}>
                        {c.variance >= 0 ? '+' : ''}{fmt(c.variance)}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {!storeId && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-700">
            您尚未被指派到任何店家，請聯絡系統管理員。
          </div>
        )}
      </div>
    </div>
  )
}
