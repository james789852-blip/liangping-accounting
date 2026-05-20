import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getBusinessDate } from '@/lib/business-date'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CheckSquare, AlertTriangle, Clock,
  TrendingUp, Store, BarChart3, FileText,
} from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const STATUS_STYLE: Record<string, { label: string; dot: string; card: string }> = {
  verified:  { label: '已審核', dot: 'bg-green-500',  card: 'border-green-200 bg-green-50' },
  submitted: { label: '待審核', dot: 'bg-blue-500',   card: 'border-blue-200 bg-blue-50' },
  disputed:  { label: '退回中', dot: 'bg-orange-500', card: 'border-orange-200 bg-orange-50' },
  draft:     { label: '草稿',   dot: 'bg-slate-400',  card: 'border-slate-200 bg-slate-50' },
  none:      { label: '未結帳', dot: 'bg-slate-200',  card: 'border-slate-100 bg-white' },
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
      .gte('business_date', firstOfMonth)
      .lte('business_date', today)
      .in('status', ['submitted', 'verified']),
    admin.from('daily_closings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'submitted'),
    admin.from('receipts')
      .select('store_id, total_amount')
      .eq('business_date', today),
  ])

  // 今日各店狀態
  const closingByStore = Object.fromEntries(
    (todayClosings ?? []).map(c => [c.store_id, c])
  )

  // 今日收據加總（by store）
  const receiptByStore: Record<string, number> = {}
  for (const r of receiptsToday ?? []) {
    receiptByStore[r.store_id] = (receiptByStore[r.store_id] || 0) + r.total_amount
  }

  // 今日已送出/已審核的總營業額
  const todayRevenue = (todayClosings ?? [])
    .filter(c => ['submitted', 'verified'].includes(c.status))
    .reduce((s, c) => s + c.total_revenue, 0)

  // 今日有大誤差的店數
  const bigVarianceCount = (todayClosings ?? [])
    .filter(c => ['submitted', 'verified'].includes(c.status) && Math.abs(c.variance) > 200).length

  // 本月各店合計
  const monthByStore: Record<string, number> = {}
  for (const c of monthClosings ?? []) {
    monthByStore[c.store_id] = (monthByStore[c.store_id] || 0) + c.total_revenue
  }
  const monthTotal = Object.values(monthByStore).reduce((s, v) => s + v, 0)
  const monthDays = (monthClosings ?? []).filter(c => c.status === 'verified').length

  // 今日已結帳店數
  const submittedToday = (todayClosings ?? []).filter(c =>
    ['submitted', 'verified'].includes(c.status)
  ).length

  const storeList = stores ?? []
  const totalStores = storeList.length

  // Taiwan time for greeting
  const twHour = new Date(Date.now() + 8 * 3600000).getUTCHours()
  const greeting = twHour < 12 ? '早安' : twHour < 18 ? '午安' : '晚安'

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-blue-500" /> 即時儀表板
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {greeting}，{profile?.name ?? ''}　業務日 {today}
        </p>
      </div>

      {/* 待審核提示 */}
      {(pendingCount as any)?.count > 0 && (
        <Link href="/hq/reviews"
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors">
          <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-700">
              有 {(pendingCount as any).count} 筆帳目待審核
            </p>
            <p className="text-xs text-orange-500">點此前往審核中心</p>
          </div>
          <span className="text-orange-400 text-xs">→</span>
        </Link>
      )}

      {/* 今日快覽 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-400">今日結帳進度</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900 mt-1">
            {submittedToday}<span className="text-base font-normal text-slate-400">/{totalStores}</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">家已送出</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-400">今日營業額</p>
          <p className="text-xl font-bold tabular-nums text-slate-900 mt-1">
            ${fmt(todayRevenue)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">已送出合計</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-400">本月累計</p>
          <p className="text-xl font-bold tabular-nums text-slate-900 mt-1">
            ${fmt(monthTotal)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{parseInt(m)} 月總計</p>
        </div>
        <div className={cn(
          'rounded-xl border px-4 py-3',
          bigVarianceCount > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'
        )}>
          <p className={cn('text-xs', bigVarianceCount > 0 ? 'text-red-400' : 'text-slate-400')}>大誤差警示</p>
          <p className={cn('text-2xl font-bold tabular-nums mt-1', bigVarianceCount > 0 ? 'text-red-600' : 'text-slate-900')}>
            {bigVarianceCount}
          </p>
          <p className={cn('text-xs mt-0.5', bigVarianceCount > 0 ? 'text-red-400' : 'text-slate-400')}>
            {bigVarianceCount > 0 ? '筆誤差 &gt;$200' : '今日無大誤差'}
          </p>
        </div>
      </div>

      {/* 各店今日狀態 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Store className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">各店今日狀態</h2>
        </div>
        <div className="space-y-2">
          {storeList.map(store => {
            const closing = closingByStore[store.id]
            const st = closing ? STATUS_STYLE[closing.status] : STATUS_STYLE.none
            const rcptAmt = receiptByStore[store.id] || 0
            const varColor = closing
              ? Math.abs(closing.variance) === 0 ? 'text-green-600'
              : Math.abs(closing.variance) <= 200 ? 'text-yellow-600' : 'text-red-600'
              : ''

            return (
              <div key={store.id}
                className={cn('rounded-xl border px-4 py-3 flex items-center gap-3', st.card)}>
                <div className={cn('h-2 w-2 rounded-full shrink-0', st.dot)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{store.name}</span>
                    <span className="text-xs text-slate-500">{st.label}</span>
                  </div>
                  {rcptAmt > 0 && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      今日單據 ${fmt(rcptAmt)}
                    </p>
                  )}
                </div>
                {closing && ['submitted', 'verified'].includes(closing.status) && (
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums text-slate-800">
                      ${fmt(closing.total_revenue)}
                    </p>
                    <p className={cn('text-xs tabular-nums', varColor)}>
                      誤差 {closing.variance >= 0 ? '+' : ''}{fmt(closing.variance)}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 本月各店累計 */}
      {storeList.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">
              {parseInt(m)} 月各店營業額
            </h2>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {storeList.map((store, idx) => {
              const rev = monthByStore[store.id] || 0
              const maxRev = Math.max(...Object.values(monthByStore), 1)
              const pct = Math.round((rev / maxRev) * 100)
              return (
                <div key={store.id}
                  className={cn('px-4 py-3', idx !== storeList.length - 1 && 'border-b border-slate-100')}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-700">{store.name}</span>
                    <span className="text-sm font-bold tabular-nums text-slate-800">
                      {rev > 0 ? `$${fmt(rev)}` : '—'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex justify-between text-xs text-slate-500">
              <span>月份合計</span>
              <span className="font-semibold text-slate-700 tabular-nums">${fmt(monthTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 快捷連結 */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/hq/reviews"
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
          <CheckSquare className="h-5 w-5 text-blue-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-700">審核中心</p>
            <p className="text-xs text-slate-400">核准 / 退回帳目</p>
          </div>
        </Link>
        <Link href="/hq/excel"
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
          <FileText className="h-5 w-5 text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-700">Excel 匯出</p>
            <p className="text-xs text-slate-400">下載各店報表</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
