import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getBusinessDate } from '@/lib/business-date'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CheckSquare, AlertTriangle, Clock,
  TrendingUp, Store, BarChart3, FileText, CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const STATUS_STYLE: Record<string, { label: string; dot: string; dotBg: string; badge: string }> = {
  verified:  { label: '已審核', dot: 'bg-emerald-500', dotBg: 'bg-emerald-500/10', badge: 'bg-emerald-100 text-emerald-700' },
  submitted: { label: '待審核', dot: 'bg-blue-500',    dotBg: 'bg-blue-500/10',    badge: 'bg-blue-100 text-blue-700' },
  disputed:  { label: '退回中', dot: 'bg-orange-500',  dotBg: 'bg-orange-500/10',  badge: 'bg-orange-100 text-orange-700' },
  draft:     { label: '草稿',   dot: 'bg-slate-400',   dotBg: 'bg-slate-400/10',   badge: 'bg-slate-100 text-slate-500' },
  none:      { label: '未結帳', dot: 'bg-slate-200',   dotBg: 'bg-slate-100',      badge: 'bg-slate-100 text-slate-400' },
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
      .select('id', { count: 'exact', head: true })
      .eq('status', 'submitted'),
    admin.from('receipts')
      .select('store_id, total_amount')
      .eq('business_date', today),
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

  const submittedToday = (todayClosings ?? [])
    .filter(c => ['submitted', 'verified'].includes(c.status)).length

  const storeList = stores ?? []
  const totalStores = storeList.length

  const twHour = new Date(Date.now() + 8 * 3600000).getUTCHours()
  const greeting = twHour < 12 ? '早安' : twHour < 18 ? '午安' : '晚安'
  const pendingN = (pendingCount as any)?.count ?? 0

  return (
    <div className="max-w-3xl mx-auto pb-24 lg:pb-8">
      {/* 頂部漸層橫幅 */}
      <div className="px-5 pt-6 pb-10"
        style={{ background: 'linear-gradient(135deg,#0c0f1e 0%,#0f2057 50%,#1a3a8f 100%)' }}>
        <div className="flex items-center gap-2 text-blue-400/80 text-sm mb-3">
          <LayoutDashboard className="h-4 w-4" />
          <span>即時儀表板</span>
        </div>
        <h1 className="text-2xl font-bold text-white">
          {greeting}，{profile?.name ?? ''}
        </h1>
        <p className="text-blue-300/70 text-sm mt-1">業務日 {today}</p>
      </div>

      <div className="px-4 -mt-5 space-y-5">
        {/* 待審核提示 */}
        {pendingN > 0 && (
          <Link href="/hq/reviews"
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-orange-500/30 transition-all active:scale-[0.98]">
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">有 {pendingN} 筆帳目待審核</p>
              <p className="text-xs text-white/75">點此前往審核中心</p>
            </div>
            <span className="text-white/70 text-sm">→</span>
          </Link>
        )}

        {/* 今日統計 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 p-4 text-white shadow-md shadow-indigo-500/25">
            <p className="text-xs font-medium text-indigo-200">今日結帳進度</p>
            <p className="text-3xl font-bold tabular-nums mt-1">
              {submittedToday}
              <span className="text-lg font-normal text-indigo-300">/{totalStores}</span>
            </p>
            <p className="text-xs text-indigo-200 mt-0.5">家已送出</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 p-4 text-white shadow-md shadow-violet-500/25">
            <p className="text-xs font-medium text-violet-200">今日營業額</p>
            <p className="text-2xl font-bold tabular-nums mt-1">${fmt(todayRevenue)}</p>
            <p className="text-xs text-violet-200 mt-0.5">已送出合計</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 p-4 text-white shadow-md shadow-cyan-500/25">
            <p className="text-xs font-medium text-cyan-200">本月累計</p>
            <p className="text-2xl font-bold tabular-nums mt-1">${fmt(monthTotal)}</p>
            <p className="text-xs text-cyan-200 mt-0.5">{parseInt(m)} 月總計</p>
          </div>
          <div className={cn(
            'rounded-2xl p-4 text-white shadow-md',
            bigVarianceCount > 0
              ? 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/25'
              : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/25'
          )}>
            <p className={cn('text-xs font-medium', bigVarianceCount > 0 ? 'text-red-200' : 'text-emerald-200')}>
              大誤差警示
            </p>
            <p className="text-3xl font-bold tabular-nums mt-1">{bigVarianceCount}</p>
            <p className={cn('text-xs mt-0.5', bigVarianceCount > 0 ? 'text-red-200' : 'text-emerald-200')}>
              {bigVarianceCount > 0 ? '筆誤差 >$200' : '今日無大誤差'}
            </p>
          </div>
        </div>

        {/* 各店今日狀態 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Store className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-700">各店今日狀態</h2>
          </div>
          <div className="rounded-2xl overflow-hidden border border-slate-100 bg-white shadow-sm">
            {storeList.map((store, idx) => {
              const closing = closingByStore[store.id]
              const st = closing ? STATUS_STYLE[closing.status] : STATUS_STYLE.none
              const rcptAmt = receiptByStore[store.id] || 0
              const varColor = closing
                ? Math.abs(closing.variance) === 0 ? 'text-emerald-600'
                : Math.abs(closing.variance) <= 200 ? 'text-amber-600' : 'text-red-600'
                : ''

              return (
                <div key={store.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3',
                    idx !== storeList.length - 1 && 'border-b border-slate-100'
                  )}>
                  <div className={cn('h-8 w-8 rounded-xl flex items-center justify-center shrink-0', st.dotBg)}>
                    <div className={cn('h-2.5 w-2.5 rounded-full', st.dot)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{store.name}</span>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', st.badge)}>
                        {st.label}
                      </span>
                    </div>
                    {rcptAmt > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">今日單據 ${fmt(rcptAmt)}</p>
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
              <BarChart3 className="h-4 w-4 text-indigo-500" />
              <h2 className="text-sm font-bold text-slate-700">{parseInt(m)} 月各店營業額</h2>
            </div>
            <div className="rounded-2xl overflow-hidden border border-slate-100 bg-white shadow-sm">
              {storeList.map((store, idx) => {
                const rev = monthByStore[store.id] || 0
                const maxRev = Math.max(...Object.values(monthByStore), 1)
                const pct = Math.round((rev / maxRev) * 100)
                return (
                  <div key={store.id}
                    className={cn('px-4 py-3', idx !== storeList.length - 1 && 'border-b border-slate-100')}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">{store.name}</span>
                      <span className="text-sm font-bold tabular-nums text-slate-800">
                        {rev > 0 ? `$${fmt(rev)}` : '—'}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: 'linear-gradient(90deg,#6366f1,#818cf8)',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="px-4 py-3 bg-indigo-50 border-t border-indigo-100 flex justify-between items-center">
                <span className="text-xs text-indigo-600 font-medium">月份合計</span>
                <span className="text-sm font-bold tabular-nums text-indigo-700">${fmt(monthTotal)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 快捷連結 */}
        <div className="grid grid-cols-2 gap-3 pb-2">
          <Link href="/hq/reviews"
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-blue-100 bg-blue-50 hover:bg-blue-100 transition-colors">
            <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <CheckSquare className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-blue-700">審核中心</p>
              <p className="text-xs text-blue-500">核准 / 退回帳目</p>
            </div>
          </Link>
          <Link href="/hq/excel"
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-emerald-100 bg-emerald-50 hover:bg-emerald-100 transition-colors">
            <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-700">Excel 匯出</p>
              <p className="text-xs text-emerald-500">下載各店報表</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
