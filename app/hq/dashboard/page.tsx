import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getBusinessDate } from '@/lib/business-date'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CheckSquare, AlertTriangle,
  Store, BarChart3, FileSpreadsheet,
  ClipboardCheck, TrendingUp, Activity,
} from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const STATUS_STYLE: Record<string, { label: string; dotColor: string; badgeBg: string; badgeText: string }> = {
  verified:  { label: '已審核', dotColor: 'bg-emerald-500', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-700' },
  submitted: { label: '待審核', dotColor: 'bg-blue-500',    badgeBg: 'bg-blue-100',    badgeText: 'text-blue-700'    },
  disputed:  { label: '退回中', dotColor: 'bg-orange-500',  badgeBg: 'bg-orange-100',  badgeText: 'text-orange-700'  },
  draft:     { label: '草稿',   dotColor: 'bg-slate-400',   badgeBg: 'bg-slate-100',   badgeText: 'text-slate-500'   },
  none:      { label: '未結帳', dotColor: 'bg-slate-300',   badgeBg: 'bg-slate-100',   badgeText: 'text-slate-400'   },
}

export default async function HQDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') redirect('/manager/dashboard')

  const admin = createAdminClient()
  const today = getBusinessDate()
  const [y, m] = today.split('-')
  const firstOfMonth = `${y}-${m}-01`

  const [
    { data: stores },
    { data: todayClosings },
    { data: monthClosings },
    { data: pendingCount },
    { data: receiptsToday },
  ] = await Promise.all([
    admin.from('stores').select('id, name').order('name'),
    admin.from('daily_closings')
      .select('id, store_id, status, total_revenue, variance, submitted_at')
      .eq('business_date', today),
    admin.from('daily_closings')
      .select('store_id, total_revenue, status')
      .gte('business_date', firstOfMonth).lte('business_date', today)
      .in('status', ['submitted', 'verified']),
    admin.from('daily_closings')
      .select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
    admin.from('receipts').select('store_id, total_amount').eq('business_date', today),
  ])

  const closingByStore = Object.fromEntries((todayClosings ?? []).map(c => [c.store_id, c]))
  const receiptByStore: Record<string, number> = {}
  for (const r of receiptsToday ?? []) {
    receiptByStore[r.store_id] = (receiptByStore[r.store_id] || 0) + r.total_amount
  }

  const todayRevenue = (todayClosings ?? [])
    .filter(c => ['submitted', 'verified'].includes(c.status))
    .reduce((s, c) => s + c.total_revenue, 0)

  const bigVarianceCount = (todayClosings ?? [])
    .filter(c => ['submitted', 'verified'].includes(c.status) && Math.abs(c.variance) > 200).length

  const monthByStore: Record<string, number> = {}
  for (const c of monthClosings ?? []) {
    monthByStore[c.store_id] = (monthByStore[c.store_id] || 0) + c.total_revenue
  }
  const monthTotal = Object.values(monthByStore).reduce((s, v) => s + v, 0)
  const submittedToday = (todayClosings ?? []).filter(c => ['submitted', 'verified'].includes(c.status)).length

  const storeList = stores ?? []
  const totalStores = storeList.length
  const twHour = new Date(Date.now() + 8 * 3600000).getUTCHours()
  const greeting = twHour < 12 ? '早安' : twHour < 18 ? '午安' : '晚安'
  const pendingN = (pendingCount as any)?.count ?? 0

  return (
    <div className="min-h-full bg-slate-50">
      {/* 頁面標頭 */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
          <LayoutDashboard className="h-3.5 w-3.5" />
          <span>即時儀表板</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{greeting}，{profile?.name ?? ''}</h1>
        <p className="text-sm text-slate-500 mt-0.5">業務日 {today}</p>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5 pb-24 lg:pb-8">

        {/* 待審核提示 */}
        {pendingN > 0 && (
          <Link href="/hq/reviews"
            className="flex items-center gap-4 px-4 py-4 bg-white rounded-2xl border-2 border-orange-200 shadow-sm hover:border-orange-300 hover:shadow-md transition-all">
            <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-900">有 {pendingN} 筆帳目待審核</p>
              <p className="text-sm text-slate-500 mt-0.5">點此前往審核中心處理</p>
            </div>
            <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2.5 py-1 rounded-lg">
              立即審核 →
            </span>
          </Link>
        )}

        {/* 統計卡片 */}
        <div className="grid grid-cols-2 gap-3">
          {/* 今日進度 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                <ClipboardCheck className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">今日進度</p>
            </div>
            <p className="text-3xl font-bold text-slate-900 tabular-nums">
              {submittedToday}
              <span className="text-xl font-normal text-slate-400">/{totalStores}</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">家已送出結帳</p>
          </div>

          {/* 今日營業額 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">今日營業</p>
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">${fmt(todayRevenue)}</p>
            <p className="text-xs text-slate-400 mt-1">已送出合計</p>
          </div>

          {/* 本月累計 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-blue-600" />
              </div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{parseInt(m)} 月累計</p>
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">${fmt(monthTotal)}</p>
            <p className="text-xs text-slate-400 mt-1">本月總計</p>
          </div>

          {/* 誤差警示 */}
          <div className={cn(
            'rounded-2xl border shadow-sm p-5',
            bigVarianceCount > 0 ? 'bg-white border-red-200' : 'bg-white border-slate-200'
          )}>
            <div className="flex items-center gap-3 mb-3">
              <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center', bigVarianceCount > 0 ? 'bg-red-50' : 'bg-slate-50')}>
                <Activity className={cn('h-4 w-4', bigVarianceCount > 0 ? 'text-red-500' : 'text-slate-400')} />
              </div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">大誤差警示</p>
            </div>
            <p className={cn('text-3xl font-bold tabular-nums', bigVarianceCount > 0 ? 'text-red-600' : 'text-slate-900')}>
              {bigVarianceCount}
            </p>
            <p className={cn('text-xs mt-1', bigVarianceCount > 0 ? 'text-red-400' : 'text-slate-400')}>
              {bigVarianceCount > 0 ? '筆誤差 > $200' : '今日無大誤差'}
            </p>
          </div>
        </div>

        {/* 各店今日狀態 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Store className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-700">各店今日狀態</h2>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {storeList.map((store, idx) => {
              const closing = closingByStore[store.id]
              const st = closing ? STATUS_STYLE[closing.status] : STATUS_STYLE.none
              const rcptAmt = receiptByStore[store.id] || 0
              const varColor = closing
                ? Math.abs(closing.variance) === 0 ? 'text-emerald-600'
                : Math.abs(closing.variance) <= 200 ? 'text-amber-600' : 'text-red-600'
                : 'text-slate-400'

              return (
                <div key={store.id}
                  className={cn('flex items-center gap-3 px-4 py-3.5', idx !== storeList.length - 1 && 'border-b border-slate-100')}>
                  <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', st.dotColor)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{store.name}</span>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', st.badgeBg, st.badgeText)}>
                        {st.label}
                      </span>
                    </div>
                    {rcptAmt > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">單據 ${fmt(rcptAmt)}</p>
                    )}
                  </div>
                  {closing && ['submitted', 'verified'].includes(closing.status) && (
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums text-slate-800">${fmt(closing.total_revenue)}</p>
                      <p className={cn('text-xs tabular-nums font-medium', varColor)}>
                        {closing.variance >= 0 ? '+' : ''}{fmt(closing.variance)}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 本月各店營業額 */}
        {storeList.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-700">{parseInt(m)} 月各店營業額</h2>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {storeList.map((store, idx) => {
                const rev = monthByStore[store.id] || 0
                const maxRev = Math.max(...Object.values(monthByStore), 1)
                const pct = Math.round((rev / maxRev) * 100)
                return (
                  <div key={store.id}
                    className={cn('px-4 py-3.5', idx !== storeList.length - 1 && 'border-b border-slate-100')}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">{store.name}</span>
                      <span className="text-sm font-bold tabular-nums text-slate-800">
                        {rev > 0 ? `$${fmt(rev)}` : '—'}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
                <span className="text-xs font-semibold text-slate-500">月份合計</span>
                <span className="text-sm font-bold tabular-nums text-slate-800">${fmt(monthTotal)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 快捷連結 */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/hq/reviews"
            className="flex items-center gap-3 px-4 py-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <CheckSquare className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">審核中心</p>
              <p className="text-xs text-slate-400 mt-0.5">核准 / 退回帳目</p>
            </div>
          </Link>
          <Link href="/hq/excel"
            className="flex items-center gap-3 px-4 py-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-200 hover:shadow-md transition-all">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Excel 匯出</p>
              <p className="text-xs text-slate-400 mt-0.5">下載各店報表</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
