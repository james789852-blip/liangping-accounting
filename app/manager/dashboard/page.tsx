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

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const STATUS_CONFIG = {
  none:      { label: '尚未結帳', desc: '今日結帳尚未開始',   Icon: Clock,        iconBg: 'bg-slate-100',   iconColor: 'text-slate-500',   borderColor: '#e2e8f0', badgeBg: 'bg-slate-100',    badgeText: 'text-slate-500'   },
  draft:     { label: '草稿中',   desc: '已存草稿，尚未送出', Icon: Clock,        iconBg: 'bg-amber-50',    iconColor: 'text-amber-500',   borderColor: '#fbbf24', badgeBg: 'bg-amber-100',    badgeText: 'text-amber-700'   },
  submitted: { label: '待審核',   desc: '等待總公司審核中',   Icon: CheckCircle2, iconBg: 'bg-blue-50',     iconColor: 'text-blue-500',    borderColor: '#3b82f6', badgeBg: 'bg-blue-100',     badgeText: 'text-blue-700'    },
  verified:  { label: '已審核',   desc: '今日結帳已完成',     Icon: CheckCircle2, iconBg: 'bg-emerald-50',  iconColor: 'text-emerald-500', borderColor: '#10b981', badgeBg: 'bg-emerald-100',  badgeText: 'text-emerald-700' },
  disputed:  { label: '異議中',   desc: '請查看並修正帳目',   Icon: AlertTriangle, iconBg: 'bg-red-50',     iconColor: 'text-red-500',     borderColor: '#ef4444', badgeBg: 'bg-red-100',      badgeText: 'text-red-700'     },
}

const RECENT_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  draft:     { label: '草稿',   bg: 'bg-slate-100',    text: 'text-slate-500'   },
  submitted: { label: '待審核', bg: 'bg-blue-100',     text: 'text-blue-700'    },
  verified:  { label: '已審核', bg: 'bg-emerald-100',  text: 'text-emerald-700' },
  disputed:  { label: '異議中', bg: 'bg-red-100',      text: 'text-red-700'     },
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

  const statusKey = (!todayClosing ? 'none' : todayClosing.status) as keyof typeof STATUS_CONFIG
  const cfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.none
  const { Icon: StatusIcon } = cfg

  const actionHref = !todayClosing || todayClosing.status === 'draft' ? '/manager/closing'
    : todayClosing.status === 'disputed' ? `/manager/edit/${todayClosing.id}`
    : '/manager/summary'

  const actionLabel = !todayClosing ? '開始今日結帳'
    : todayClosing.status === 'draft' ? '繼續填寫結帳'
    : todayClosing.status === 'disputed' ? '修正退回帳目'
    : '查看今日結帳'

  const varColor = !todayClosing ? 'text-slate-400'
    : Math.abs(todayClosing.variance) === 0 ? 'text-emerald-600'
    : Math.abs(todayClosing.variance) <= 200 ? 'text-amber-600' : 'text-red-600'

  const recentFiltered = recentClosings.filter(c => c.business_date !== today).slice(0, 4)
  const isDisputed = todayClosing?.status === 'disputed'

  return (
    <div className="min-h-full bg-slate-50">
      {/* 頁面標頭 */}
      <div className="bg-white border-b border-slate-200 px-5 py-5">
        <h1 className="text-xl font-bold text-slate-900">{greeting}，{profile?.name ?? '店長'}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {store?.name} · {todayLabel}
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 pb-24 space-y-4 lg:pb-8">

        {/* 今日狀態卡 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-4 px-5 py-4" style={{ borderLeft: `4px solid ${cfg.borderColor}` }}>
            <div className={cn('h-12 w-12 rounded-2xl flex items-center justify-center shrink-0', cfg.iconBg)}>
              <StatusIcon className={cn('h-6 w-6', cfg.iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900">{cfg.label}</span>
                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', cfg.badgeBg, cfg.badgeText)}>
                  {today}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">{cfg.desc}</p>
            </div>
            {todayClosing && (
              <div className="text-right shrink-0">
                <p className="text-xs text-slate-400 mb-0.5">營業額</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">${fmt(todayClosing.total_revenue)}</p>
              </div>
            )}
          </div>
          {todayClosing && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
              <span className="text-sm text-slate-500">現金誤差</span>
              <span className={cn('text-sm font-bold tabular-nums', varColor)}>
                {todayClosing.variance >= 0 ? '+' : ''}{fmt(todayClosing.variance)} 元
              </span>
            </div>
          )}
        </div>

        {/* 主要操作按鈕 */}
        <Link href={actionHref}>
          <div className={cn(
            'flex items-center gap-4 px-4 py-4 rounded-2xl transition-all shadow-sm',
            isDisputed ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
          )}>
            <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">{actionLabel}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>業務日 {today}</p>
            </div>
            <ChevronRight className="h-5 w-5" style={{ color: 'rgba(255,255,255,0.5)' }} />
          </div>
        </Link>

        {/* 快捷功能 */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { href: '/manager/receipts', Icon: FileText,  label: '發票收據', bg: 'bg-violet-50',  ring: 'hover:border-violet-200', iconBg: 'bg-violet-100',  iconColor: 'text-violet-600' },
            { href: '/manager/cash',     Icon: Wallet,     label: '現金清點', bg: 'bg-emerald-50', ring: 'hover:border-emerald-200', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
            { href: '/manager/summary',  Icon: TrendingUp, label: '結算結果', bg: 'bg-blue-50',    ring: 'hover:border-blue-200',   iconBg: 'bg-blue-100',    iconColor: 'text-blue-600' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className={cn('flex flex-col items-center gap-2.5 p-4 bg-white rounded-2xl border border-slate-200 transition-all shadow-sm', item.ring, 'hover:shadow-md')}>
              <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', item.iconBg)}>
                <item.Icon className={cn('h-5 w-5', item.iconColor)} />
              </div>
              <span className="text-xs font-semibold text-slate-600">{item.label}</span>
            </Link>
          ))}
        </div>

        {/* 近期紀錄 */}
        {recentFiltered.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <History className="h-4 w-4 text-slate-400" />
                近期紀錄
              </h2>
              <Link href="/manager/history" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                全部查看
              </Link>
            </div>
            {recentFiltered.map((c, idx) => {
              const vc = Math.abs(c.variance) === 0 ? 'text-emerald-600'
                : Math.abs(c.variance) <= 200 ? 'text-amber-600' : 'text-red-600'
              const st = RECENT_STATUS[c.status]
              return (
                <Link key={c.id} href={`/manager/history/${c.id}`}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors',
                    idx !== recentFiltered.length - 1 && 'border-b border-slate-100'
                  )}>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-700">{c.business_date}</span>
                  </div>
                  {st && (
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', st.bg, st.text)}>
                      {st.label}
                    </span>
                  )}
                  <div className="text-right shrink-0 w-[72px]">
                    <p className="text-sm font-semibold text-slate-700 tabular-nums">${fmt(c.total_revenue)}</p>
                    <p className={cn('text-xs tabular-nums', vc)}>
                      {c.variance >= 0 ? '+' : ''}{fmt(c.variance)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                </Link>
              )
            })}
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
