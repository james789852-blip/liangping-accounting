import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getBusinessDate } from '@/lib/business-date'
import {
  CheckSquare, AlertTriangle, BarChart3, TrendingUp,
  Clock, ChevronRight, Calendar, FileText, LayoutDashboard,
} from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const AVATAR_GRADS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#f97316,#f59e0b)',
  'linear-gradient(135deg,#06b6d4,#6366f1)',
  'linear-gradient(135deg,#10b981,#06b6d4)',
  'linear-gradient(135deg,#ec4899,#f43f5e)',
  'linear-gradient(135deg,#8b5cf6,#ec4899)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#6366f1,#06b6d4)',
  'linear-gradient(135deg,#10b981,#6366f1)',
  'linear-gradient(135deg,#f97316,#ec4899)',
]

const DOT_STYLE: Record<string, { dot: string; ring: string; label: string }> = {
  verified:  { dot: '#10b981', ring: '#d1fae5', label: '已審核' },
  submitted: { dot: '#10b981', ring: '#d1fae5', label: '已送出' },
  disputed:  { dot: '#f59e0b', ring: '#fef3c7', label: '退回中' },
  draft:     { dot: '#a1a1aa', ring: '#f4f4f5', label: '草稿'   },
  none:      { dot: '#a1a1aa', ring: '#f4f4f5', label: '未送出' },
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
  ] = await Promise.all([
    admin.from('stores').select('id, name').order('name'),
    admin.from('daily_closings').select('id, store_id, status, total_revenue, variance').eq('business_date', today),
    admin.from('daily_closings').select('store_id, total_revenue, status')
      .gte('business_date', firstOfMonth).lte('business_date', today).in('status', ['submitted', 'verified']),
    admin.from('daily_closings').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
  ])

  const storeList = stores ?? []
  const closingByStore = Object.fromEntries((todayClosings ?? []).map(c => [c.store_id, c]))
  const storeMap = Object.fromEntries(storeList.map(s => [s.id, s.name]))

  const monthByStore: Record<string, number> = {}
  for (const c of monthClosings ?? []) monthByStore[c.store_id] = (monthByStore[c.store_id] || 0) + c.total_revenue

  const monthTotal = Object.values(monthByStore).reduce((s, v) => s + v, 0)
  const submittedToday = (todayClosings ?? []).filter(c => ['submitted', 'verified'].includes(c.status)).length
  const bigVarianceStores = (todayClosings ?? []).filter(c =>
    ['submitted', 'verified'].includes(c.status) && Math.abs(c.variance) > 200
  )
  const bigVarianceCount = bigVarianceStores.length
  const totalStores = storeList.length
  const pendingN = (pendingCount as any)?.count ?? 0
  const twHour = new Date(Date.now() + 8 * 3600000).getUTCHours()
  const greeting = twHour < 12 ? '早安' : twHour < 18 ? '午安' : '晚安'

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* 頁面標頭 */}
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
              <LayoutDashboard className="h-3.5 w-3.5" />
              總公司 · 即時儀表板
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>
              {greeting}，{profile?.name ?? ''}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold" style={{ color: '#18181b' }}>{profile?.name ?? ''}</p>
              <p className="text-xs" style={{ color: '#a1a1aa' }}>總公司 · {profile?.role ?? ''}</p>
            </div>
            <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              {profile?.role ?? '?'}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5 pb-24 lg:pb-8">

        {/* Hero — 深色漸層 */}
        <div className="rounded-3xl p-8 relative overflow-hidden text-white"
          style={{ background: 'linear-gradient(135deg,#18181b 0%,#4338ca 60%,#ec4899 100%)', boxShadow: '0 20px 50px -10px rgba(99,102,241,0.3)' }}>
          <div className="absolute rounded-full pointer-events-none"
            style={{ top: '-50%', right: '-10%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(255,255,255,0.12), transparent)' }} />
          <div className="flex items-center gap-2 text-sm mb-2 relative" style={{ opacity: 0.85 }}>
            <Calendar className="h-3.5 w-3.5" />
            {today} · {totalStores} 家店即時概覽
          </div>
          <div className="font-extrabold tabular-nums leading-none mb-2 relative"
            style={{ fontSize: 'clamp(40px,6vw,56px)', letterSpacing: '-0.03em' }}>
            $ {fmt(monthTotal)}
          </div>
          <div className="text-sm mb-5 relative" style={{ opacity: 0.7 }}>本月累積營業額</div>
          <div className="flex gap-7 flex-wrap relative">
            <div>
              <p className="text-xs mb-1" style={{ opacity: 0.7 }}>已送出</p>
              <p className="text-2xl font-bold tabular-nums">{submittedToday} / {totalStores} 店</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ opacity: 0.7 }}>待審核</p>
              <p className="text-2xl font-bold tabular-nums">{pendingN} 件</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ opacity: 0.7 }}>誤差警示</p>
              <p className="text-2xl font-bold tabular-nums">{bigVarianceCount} 件</p>
            </div>
          </div>
        </div>

        {/* 4 統計卡片 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            {
              color: '#6366f1' as string, Icon: TrendingUp, label: '今日進度',
              num: <>{submittedToday}<span className="text-xl font-normal ml-1" style={{ color: '#a1a1aa' }}>/ {totalStores}</span></> as ReactNode,
              sub: '店已送出',
            },
            {
              color: '#10b981' as string, Icon: BarChart3, label: `${parseInt(m)} 月累積`,
              num: `$${fmt(monthTotal)}` as ReactNode,
              sub: '本月總計',
            },
            {
              color: '#f97316' as string, Icon: Clock, label: '未送出',
              num: (totalStores - submittedToday) as ReactNode,
              sub: totalStores - submittedToday > 0 ? '店未送出' : '全部完成',
            },
            {
              color: '#8b5cf6' as string, Icon: AlertTriangle, label: '誤差警示',
              num: bigVarianceCount as ReactNode,
              sub: bigVarianceCount > 0 ? '筆誤差 > $200' : '今日無異常',
            },
          ]).map(({ color, Icon, label, num, sub }) => (
            <div key={label} className="bg-white rounded-2xl p-5 relative overflow-hidden"
              style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="absolute left-0 top-0 w-1 h-full rounded-l-2xl" style={{ background: color }} />
              <div className="flex items-center gap-1.5 text-xs font-medium mb-2 pl-2" style={{ color: '#71717a' }}>
                <Icon className="h-3.5 w-3.5" style={{ color: '#a1a1aa' }} />
                {label}
              </div>
              <div className="text-3xl font-bold tabular-nums pl-2" style={{ letterSpacing: '-0.02em', color: '#18181b' }}>
                {num}
              </div>
              <div className="text-xs font-semibold mt-1.5 pl-2" style={{ color: '#a1a1aa' }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* 雙欄主內容 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* 左欄：各店今日狀態 (2/3) */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6"
            style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold flex items-center gap-2.5" style={{ color: '#18181b' }}>
                <span className="h-8 w-8 rounded-xl flex items-center justify-center text-base" style={{ background: '#eef2ff' }}>🏪</span>
                {totalStores} 店今日狀態
              </h3>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#eef2ff', color: '#4338ca' }}>即時</span>
            </div>
            <div className="space-y-2">
              {storeList.map((store, idx) => {
                const closing = closingByStore[store.id]
                const statusKey = closing?.status ?? 'none'
                const st = DOT_STYLE[statusKey] ?? DOT_STYLE.none
                const hasRevenue = closing && ['submitted', 'verified'].includes(closing.status)
                return (
                  <div key={store.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:translate-x-1 hover:border-indigo-100 hover:shadow-sm"
                    style={{ borderColor: '#f4f4f5', opacity: hasRevenue ? 1 : 0.55 }}>
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: AVATAR_GRADS[idx % AVATAR_GRADS.length] }}>
                      {store.name.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: '#18181b' }}>{store.name}</p>
                      {hasRevenue && closing!.variance !== 0 && (
                        <p className="text-xs tabular-nums" style={{ color: Math.abs(closing!.variance) > 200 ? '#dc2626' : '#d97706' }}>
                          誤差 {closing!.variance >= 0 ? '+' : ''}{fmt(closing!.variance)}
                        </p>
                      )}
                    </div>
                    <div className="text-base font-bold tabular-nums shrink-0" style={{ color: hasRevenue ? '#18181b' : '#a1a1aa' }}>
                      {hasRevenue ? `$${fmt(closing!.total_revenue)}` : '—'}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0" style={{ minWidth: '64px' }}>
                      <div className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: st.dot, boxShadow: `0 0 0 3px ${st.ring}` }} />
                      <span className="text-xs font-semibold" style={{ color: '#52525b' }}>{st.label}</span>
                    </div>
                    <ChevronRight className="h-[18px] w-[18px] shrink-0" style={{ color: '#a1a1aa' }} />
                  </div>
                )
              })}
            </div>
          </div>

          {/* 右欄：通知 + 月度圖表 */}
          <div className="space-y-4">

            {/* 需要關注 */}
            <div className="bg-white rounded-2xl p-5"
              style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="h-8 w-8 rounded-xl flex items-center justify-center text-base" style={{ background: '#ffedd5' }}>🔔</span>
                <h3 className="text-base font-semibold" style={{ color: '#18181b' }}>需要關注</h3>
              </div>

              {bigVarianceStores.map(c => (
                <div key={c.store_id} className="flex gap-3 p-3 rounded-xl mb-2" style={{ background: '#f8fafc' }}>
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: '#ffe4e6', color: '#be123c' }}>
                    <AlertTriangle className="h-[18px] w-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0 text-sm leading-snug">
                    <b className="block mb-0.5" style={{ color: '#18181b' }}>
                      {storeMap[c.store_id]} 誤差 {c.variance >= 0 ? '+' : ''}{fmt(c.variance)}
                    </b>
                    <span className="text-[11px]" style={{ color: '#a1a1aa' }}>今日 · 請聯絡店長確認</span>
                  </div>
                </div>
              ))}

              {pendingN > 0 && (
                <Link href="/hq/reviews"
                  className="flex gap-3 p-3 rounded-xl mb-2 transition-opacity hover:opacity-80"
                  style={{ background: '#f8fafc' }}>
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: '#fef3c7', color: '#b45309' }}>
                    <FileText className="h-[18px] w-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0 text-sm leading-snug">
                    <b className="block mb-0.5" style={{ color: '#18181b' }}>{pendingN} 張帳目待審核</b>
                    <span className="text-[11px]" style={{ color: '#a1a1aa' }}>點此前往審核中心 →</span>
                  </div>
                </Link>
              )}

              {bigVarianceCount === 0 && pendingN === 0 && (
                <div className="flex gap-3 p-3 rounded-xl" style={{ background: '#f8fafc' }}>
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: '#d1fae5', color: '#047857' }}>
                    <CheckSquare className="h-[18px] w-[18px]" />
                  </div>
                  <div className="flex-1 text-sm leading-snug">
                    <b className="block mb-0.5" style={{ color: '#18181b' }}>目前無需關注項目</b>
                    <span className="text-[11px]" style={{ color: '#a1a1aa' }}>今日運作順暢</span>
                  </div>
                </div>
              )}
            </div>

            {/* 月度各店走勢 */}
            <div className="bg-white rounded-2xl p-5"
              style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="h-8 w-8 rounded-xl flex items-center justify-center text-base text-white"
                  style={{ background: 'linear-gradient(135deg,#06b6d4,#6366f1)' }}>📈</span>
                <h3 className="text-base font-semibold" style={{ color: '#18181b' }}>{parseInt(m)} 月各店</h3>
              </div>
              <div className="space-y-3">
                {storeList.map(store => {
                  const rev = monthByStore[store.id] || 0
                  const maxRev = Math.max(...Object.values(monthByStore), 1)
                  const pct = Math.round((rev / maxRev) * 100)
                  return (
                    <div key={store.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium" style={{ color: '#52525b' }}>{store.name}</span>
                        <span className="text-xs font-bold tabular-nums" style={{ color: '#18181b' }}>
                          {rev > 0 ? `$${fmt(rev)}` : '—'}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#6366f1,#818cf8)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between pt-3 mt-3"
                style={{ borderTop: '1px solid #f4f4f5' }}>
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>月份合計</span>
                <span className="text-base font-bold tabular-nums" style={{ color: '#4338ca' }}>${fmt(monthTotal)}</span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
