import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getBusinessDate } from '@/lib/business-date'
import { cn } from '@/lib/utils'
import {
  CheckSquare, AlertTriangle, Store, BarChart3,
  FileSpreadsheet, ClipboardList, TrendingUp, Activity, LayoutDashboard,
} from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const STATUS_STYLE: Record<string, { label: string; dot: string; badgeBg: string; badgeText: string }> = {
  verified:  { label: '已審核', dot: '#10b981', badgeBg: '#d1fae5', badgeText: '#065f46' },
  submitted: { label: '待審核', dot: '#3b82f6', badgeBg: '#dbeafe', badgeText: '#1e40af' },
  disputed:  { label: '退回中', dot: '#f59e0b', badgeBg: '#fef3c7', badgeText: '#92400e' },
  draft:     { label: '草稿',   dot: '#94a3b8', badgeBg: '#f1f5f9', badgeText: '#475569' },
  none:      { label: '未結帳', dot: '#cbd5e1', badgeBg: '#f1f5f9', badgeText: '#94a3b8' },
}

const STAT_CARDS = [
  { key: 'progress', grad: 'linear-gradient(135deg,#6366f1,#4f46e5)', shadow: 'rgba(99,102,241,0.4)',   Icon: ClipboardList },
  { key: 'revenue',  grad: 'linear-gradient(135deg,#10b981,#059669)', shadow: 'rgba(16,185,129,0.4)',  Icon: TrendingUp    },
  { key: 'month',    grad: 'linear-gradient(135deg,#3b82f6,#2563eb)', shadow: 'rgba(59,130,246,0.4)',  Icon: BarChart3     },
  { key: 'variance', grad: 'linear-gradient(135deg,#ef4444,#dc2626)', shadow: 'rgba(239,68,68,0.4)',   Icon: Activity      },
]

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
    admin.from('daily_closings').select('id, store_id, status, total_revenue, variance').eq('business_date', today),
    admin.from('daily_closings').select('store_id, total_revenue, status')
      .gte('business_date', firstOfMonth).lte('business_date', today).in('status', ['submitted', 'verified']),
    admin.from('daily_closings').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
    admin.from('receipts').select('store_id, total_amount').eq('business_date', today),
  ])

  const closingByStore = Object.fromEntries((todayClosings ?? []).map(c => [c.store_id, c]))
  const receiptByStore: Record<string, number> = {}
  for (const r of receiptsToday ?? []) receiptByStore[r.store_id] = (receiptByStore[r.store_id] || 0) + r.total_amount

  const todayRevenue = (todayClosings ?? []).filter(c => ['submitted', 'verified'].includes(c.status)).reduce((s, c) => s + c.total_revenue, 0)
  const bigVarianceCount = (todayClosings ?? []).filter(c => ['submitted', 'verified'].includes(c.status) && Math.abs(c.variance) > 200).length
  const monthByStore: Record<string, number> = {}
  for (const c of monthClosings ?? []) monthByStore[c.store_id] = (monthByStore[c.store_id] || 0) + c.total_revenue
  const monthTotal = Object.values(monthByStore).reduce((s, v) => s + v, 0)
  const submittedToday = (todayClosings ?? []).filter(c => ['submitted', 'verified'].includes(c.status)).length

  const storeList = stores ?? []
  const totalStores = storeList.length
  const twHour = new Date(Date.now() + 8 * 3600000).getUTCHours()
  const greeting = twHour < 12 ? '早安' : twHour < 18 ? '午安' : '晚安'
  const pendingN = (pendingCount as any)?.count ?? 0

  const statItems = [
    { label: '今日進度',    val: `${submittedToday}`, sub: `/ ${totalStores} 家已送出`, ...STAT_CARDS[0] },
    { label: '今日營業額',  val: `$${fmt(todayRevenue)}`, sub: '已送出合計', ...STAT_CARDS[1] },
    { label: `${parseInt(m)} 月累計`, val: `$${fmt(monthTotal)}`, sub: '本月總計', ...STAT_CARDS[2] },
    { label: '大誤差警示',  val: `${bigVarianceCount}`, sub: bigVarianceCount > 0 ? '筆誤差 > $200' : '今日無大誤差', ...STAT_CARDS[3] },
  ]

  return (
    <div className="min-h-full" style={{ background: '#f0f5ff' }}>

      {/* 頁面標頭 */}
      <div className="bg-white px-6 py-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2 text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">
          <LayoutDashboard className="h-3.5 w-3.5" />
          即時儀表板
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{greeting}，{profile?.name ?? ''}</h1>
        <p className="text-sm text-slate-400 mt-0.5">業務日 {today}</p>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5 pb-24 lg:pb-8">

        {/* 待審核提示 */}
        {pendingN > 0 && (
          <Link href="/hq/reviews"
            className="flex items-center gap-4 px-5 py-4 bg-white rounded-2xl transition-all hover:scale-[1.01]"
            style={{ border: '2px solid #fed7aa', boxShadow: '0 4px 16px rgba(245,158,11,0.15)' }}>
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 4px 12px rgba(245,158,11,0.4)' }}>
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-900">有 {pendingN} 筆帳目待審核</p>
              <p className="text-sm text-slate-400 mt-0.5">點此前往審核中心處理</p>
            </div>
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl shrink-0" style={{ background: '#fef3c7', color: '#92400e' }}>
              立即前往 →
            </span>
          </Link>
        )}

        {/* 統計卡片 */}
        <div className="grid grid-cols-2 gap-3">
          {statItems.map((item, i) => (
            <div key={item.key} className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="h-11 w-11 rounded-2xl flex items-center justify-center" style={{ background: i === 3 && bigVarianceCount === 0 ? 'linear-gradient(135deg,#94a3b8,#64748b)' : item.grad, boxShadow: i === 3 && bigVarianceCount === 0 ? 'rgba(100,116,139,0.3)' : item.shadow }}>
                  <item.Icon className="h-5 w-5 text-white" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums leading-none">
                {item.val}
                {item.key === 'progress' && <span className="text-xl font-normal text-slate-300 ml-1">{item.sub.split(' ')[0]}</span>}
              </p>
              <p className="text-xs font-semibold text-slate-400 mt-2 uppercase tracking-wide">
                {item.key === 'progress' ? `${item.sub.slice(2)}` : item.key === 'variance' ? item.sub : item.label}
              </p>
            </div>
          ))}
        </div>

        {/* 各店今日狀態 */}
        <div>
          <div className="flex items-center gap-2 px-1 mb-3">
            <Store className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-700">各店今日狀態</h2>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)' }}>
            {storeList.map((store, idx) => {
              const closing = closingByStore[store.id]
              const st = closing ? STATUS_STYLE[closing.status] : STATUS_STYLE.none
              const rcptAmt = receiptByStore[store.id] || 0
              const vc = closing
                ? Math.abs(closing.variance) === 0 ? '#059669' : Math.abs(closing.variance) <= 200 ? '#d97706' : '#dc2626'
                : '#94a3b8'

              return (
                <div key={store.id}
                  className={cn('flex items-center gap-3 px-5 py-4', idx !== storeList.length - 1 && 'border-b border-slate-50')}>
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: st.dot }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{store.name}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: st.badgeBg, color: st.badgeText }}>
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
                      <p className="text-xs tabular-nums font-semibold" style={{ color: vc }}>
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
            <div className="flex items-center gap-2 px-1 mb-3">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-700">{parseInt(m)} 月各店營業額</h2>
            </div>
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)' }}>
              {storeList.map((store, idx) => {
                const rev = monthByStore[store.id] || 0
                const maxRev = Math.max(...Object.values(monthByStore), 1)
                const pct = Math.round((rev / maxRev) * 100)
                return (
                  <div key={store.id} className={cn('px-5 py-4', idx !== storeList.length - 1 && 'border-b border-slate-50')}>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-sm font-semibold text-slate-700">{store.name}</span>
                      <span className="text-sm font-bold tabular-nums text-slate-800">{rev > 0 ? `$${fmt(rev)}` : '—'}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#6366f1,#818cf8)' }} />
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center justify-between px-5 py-3.5" style={{ borderTop: '1px solid #f1f5f9', background: '#fafbff' }}>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">月份合計</span>
                <span className="text-base font-bold tabular-nums text-indigo-700">${fmt(monthTotal)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 快捷連結 */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/hq/reviews"
            className="flex items-center gap-4 px-4 py-4 bg-white rounded-2xl transition-all hover:scale-[1.01]"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)' }}>
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)', boxShadow: '0 4px 12px rgba(59,130,246,0.4)' }}>
              <CheckSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">審核中心</p>
              <p className="text-xs text-slate-400 mt-0.5">核准 / 退回帳目</p>
            </div>
          </Link>
          <Link href="/hq/excel"
            className="flex items-center gap-4 px-4 py-4 bg-white rounded-2xl transition-all hover:scale-[1.01]"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)' }}>
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 4px 12px rgba(16,185,129,0.4)' }}>
              <FileSpreadsheet className="h-5 w-5 text-white" />
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
