import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  ClipboardList, CheckCircle2, Clock, AlertTriangle,
  ChevronRight, History, TrendingUp, Calendar,
  ArrowUp, CheckCircle,
} from 'lucide-react'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const STATUS_CFG = {
  none:      { label: '尚未結帳', desc: '今日結帳尚未開始', Icon: Clock,         accentBar: '#94a3b8', badgeBg: '#f1f5f9', badgeText: '#475569' },
  draft:     { label: '草稿中',   desc: '已存草稿，尚未送出', Icon: Clock,        accentBar: '#f59e0b', badgeBg: '#fef3c7', badgeText: '#92400e' },
  submitted: { label: '待審核',   desc: '等待總公司審核中', Icon: CheckCircle2,  accentBar: '#6366f1', badgeBg: '#eef2ff', badgeText: '#4338ca' },
  verified:  { label: '已審核',   desc: '今日結帳已完成',   Icon: CheckCircle2,  accentBar: '#10b981', badgeBg: '#d1fae5', badgeText: '#065f46' },
  disputed:  { label: '異議中',   desc: '請查看並修正帳目', Icon: AlertTriangle, accentBar: '#f43f5e', badgeBg: '#ffe4e6', badgeText: '#be123c' },
}

const RECENT_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  draft:     { label: '草稿',   bg: '#f1f5f9', color: '#475569' },
  submitted: { label: '待審核', bg: '#eef2ff', color: '#4338ca' },
  verified:  { label: '已審核', bg: '#d1fae5', color: '#065f46' },
  disputed:  { label: '異議中', bg: '#ffe4e6', color: '#be123c' },
}

const CHANNEL_LABELS: Record<string, string> = {
  pos: '現場 POS', handwrite: '手寫訂單',
  uber: 'Uber Eats', panda: '熊貓外送', online: '線上點餐',
  twpay: '台灣 Pay',
}

export default async function ManagerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, store_ids').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  const today = getBusinessDate()
  const [y, m] = today.split('-')
  const firstOfMonth = `${y}-${m}-01`
  const todayDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  const todayLabel = format(todayDate, 'yyyy/MM/dd · EEEE', { locale: zhTW })
  const twHour = new Date(Date.now() + 8 * 3600000).getUTCHours()
  const greeting = twHour < 12 ? '早安' : twHour < 18 ? '午安' : '晚安'

  let store = null
  let todayClosing: any = null
  let recentClosings: any[] = []
  let monthData: any[] = []

  if (storeId) {
    const [storeRes, closingRes, recentRes, monthRes] = await Promise.all([
      supabase.from('stores').select('name, petty_cash').eq('id', storeId).single(),
      supabase.from('daily_closings')
        .select('id, status, total_revenue, variance, submitted_at, revenue_items(channel, gross_amount)')
        .eq('store_id', storeId).eq('business_date', today).maybeSingle(),
      supabase.from('daily_closings')
        .select('id, business_date, status, total_revenue, variance')
        .eq('store_id', storeId).order('business_date', { ascending: false }).limit(7),
      supabase.from('daily_closings')
        .select('total_revenue, variance')
        .eq('store_id', storeId)
        .gte('business_date', firstOfMonth).lte('business_date', today)
        .in('status', ['submitted', 'verified']),
    ])
    store = storeRes.data
    todayClosing = closingRes.data
    recentClosings = recentRes.data ?? []
    monthData = monthRes.data ?? []
  }

  const monthTotal = monthData.reduce((s, c) => s + c.total_revenue, 0)
  const monthDays = monthData.length
  const monthVariance = monthData.reduce((s, c) => s + c.variance, 0)

  const statusKey = (!todayClosing ? 'none' : todayClosing.status) as keyof typeof STATUS_CFG
  const cfg = STATUS_CFG[statusKey] ?? STATUS_CFG.none
  const { Icon: StatusIcon } = cfg

  // Revenue breakdown
  type RevenueItem = { channel: string; gross_amount: number }
  const revenueItems: RevenueItem[] = (todayClosing?.revenue_items ?? [])
  const posRevenue = revenueItems.filter(r => ['pos', 'handwrite'].includes(r.channel)).reduce((s, r) => s + r.gross_amount, 0)
  const platformRevenue = revenueItems.filter(r => ['uber', 'panda', 'online'].includes(r.channel)).reduce((s, r) => s + r.gross_amount, 0)
  const payRevenue = revenueItems.filter(r => r.channel === 'twpay').reduce((s, r) => s + r.gross_amount, 0)
  const hasBreakdown = posRevenue + platformRevenue + payRevenue > 0

  const actionHref = !todayClosing || todayClosing.status === 'draft' ? '/manager/closing'
    : todayClosing.status === 'disputed' ? `/manager/edit/${todayClosing.id}` : '/manager/summary'
  const actionLabel = !todayClosing ? '開始今日結帳'
    : todayClosing.status === 'draft' ? '繼續填寫結帳'
    : todayClosing.status === 'disputed' ? '修正退回帳目' : '查看今日結帳'
  const isDisputed = todayClosing?.status === 'disputed'

  const varColor = !todayClosing ? '#a1a1aa'
    : Math.abs(todayClosing.variance) === 0 ? '#047857'
    : Math.abs(todayClosing.variance) <= 200 ? '#b45309' : '#be123c'
  const monthVarColor = Math.abs(monthVariance) === 0 ? '#047857' : Math.abs(monthVariance) <= 500 ? '#b45309' : '#be123c'

  const recentFiltered = recentClosings.filter(c => c.business_date !== today).slice(0, 4)

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* 頁面頂部 */}
      <div className="bg-white px-6 py-4 sticky top-0 z-10 lg:static"
        style={{ borderBottom: '1px solid #f4f4f5' }}>
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>
          儀表板 / <strong style={{ color: '#18181b' }}>今日狀態</strong>
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-4 lg:px-8 pt-6 pb-28 space-y-6 lg:pb-8">

        {/* Hero 卡片 */}
        <div className="relative rounded-3xl p-8 text-white overflow-hidden"
          style={{
            background: isDisputed
              ? 'linear-gradient(135deg,#be123c 0%,#9f1239 50%,#881337 100%)'
              : 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#ec4899 100%)',
            boxShadow: '0 20px 50px -10px rgba(99,102,241,0.3)',
          }}>
          {/* 裝飾光暈 */}
          <div className="absolute -top-1/2 -right-[10%] w-96 h-96 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle,rgba(255,255,255,0.18),transparent)' }} />

          <div className="relative">
            <p className="text-sm opacity-85 flex items-center gap-2 mb-2">
              <Calendar className="h-3.5 w-3.5" />
              {todayLabel}
            </p>

            {todayClosing ? (
              <>
                <p className="font-extrabold tabular-nums leading-none mb-4"
                  style={{ fontSize: 'clamp(40px,8vw,56px)', letterSpacing: '-0.03em', fontFeatureSettings: '"tnum"' }}>
                  $ {fmt(todayClosing.total_revenue)}
                </p>
                {hasBreakdown && (
                  <div className="flex gap-7 flex-wrap">
                    {posRevenue > 0 && (
                      <div>
                        <p className="text-sm opacity-70 mb-1">現場 / 手寫</p>
                        <p className="text-2xl font-bold tabular-nums">${fmt(posRevenue)}</p>
                      </div>
                    )}
                    {platformRevenue > 0 && (
                      <div>
                        <p className="text-sm opacity-70 mb-1">外送平台</p>
                        <p className="text-2xl font-bold tabular-nums">${fmt(platformRevenue)}</p>
                      </div>
                    )}
                    {payRevenue > 0 && (
                      <div>
                        <p className="text-sm opacity-70 mb-1">行動支付</p>
                        <p className="text-2xl font-bold tabular-nums">${fmt(payRevenue)}</p>
                      </div>
                    )}
                  </div>
                )}
                {!hasBreakdown && (
                  <div className="flex items-center gap-2 opacity-85">
                    <StatusIcon className="h-4 w-4" />
                    <span className="text-sm">{cfg.label} · {cfg.desc}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="font-extrabold opacity-40 leading-none mb-3"
                  style={{ fontSize: '48px', letterSpacing: '-0.03em' }}>
                  今日待結帳
                </p>
                <p className="text-sm opacity-70">{store?.name} · 點選下方按鈕開始</p>
              </>
            )}
          </div>
        </div>

        {/* 統計卡片 */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* 本月累積 */}
          <div className="relative bg-white rounded-2xl p-5 overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5"
            style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(99,102,241,0.06)' }}>
            <div className="absolute left-0 top-0 w-1 h-full rounded-l-2xl" style={{ background: '#6366f1' }} />
            <p className="text-sm font-medium flex items-center gap-1.5 mb-2" style={{ color: '#52525b' }}>
              <TrendingUp className="h-3.5 w-3.5" style={{ color: '#a1a1aa' }} />
              本月累積
            </p>
            <p className="text-2xl font-bold tabular-nums mb-1.5" style={{ color: '#18181b', letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>
              {monthTotal > 0 ? `$${fmt(monthTotal)}` : '—'}
            </p>
            {monthDays > 0 && (
              <p className="text-xs font-semibold flex items-center gap-1" style={{ color: '#10b981' }}>
                <ArrowUp className="h-3 w-3" /> 已結帳 {monthDays} 天
              </p>
            )}
          </div>

          {/* 今日狀態 */}
          <div className="relative bg-white rounded-2xl p-5 overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5"
            style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(16,185,129,0.06)' }}>
            <div className="absolute left-0 top-0 w-1 h-full rounded-l-2xl" style={{ background: cfg.accentBar }} />
            <p className="text-sm font-medium flex items-center gap-1.5 mb-2" style={{ color: '#52525b' }}>
              <StatusIcon className="h-3.5 w-3.5" style={{ color: '#a1a1aa' }} />
              今日狀態
            </p>
            <p className="text-2xl font-bold mb-1.5" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>
              {cfg.label}
            </p>
            <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: cfg.badgeBg, color: cfg.badgeText }}>
              {today}
            </span>
          </div>

          {/* 現金誤差 */}
          <div className="relative bg-white rounded-2xl p-5 overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5"
            style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.04)' }}>
            <div className="absolute left-0 top-0 w-1 h-full rounded-l-2xl" style={{ background: '#f59e0b' }} />
            <p className="text-sm font-medium mb-2" style={{ color: '#52525b' }}>今日誤差</p>
            <p className="text-2xl font-bold tabular-nums mb-1.5" style={{ color: todayClosing ? varColor : '#a1a1aa', letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>
              {todayClosing ? `${todayClosing.variance >= 0 ? '+' : ''}${fmt(todayClosing.variance)}` : '—'}
            </p>
            <p className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>元</p>
          </div>

          {/* 本月誤差 */}
          <div className="relative bg-white rounded-2xl p-5 overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5"
            style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.04)' }}>
            <div className="absolute left-0 top-0 w-1 h-full rounded-l-2xl" style={{ background: '#8b5cf6' }} />
            <p className="text-sm font-medium mb-2" style={{ color: '#52525b' }}>本月誤差</p>
            <p className="text-2xl font-bold tabular-nums mb-1.5" style={{ color: monthData.length > 0 ? monthVarColor : '#a1a1aa', letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>
              {monthData.length > 0 ? `${monthVariance >= 0 ? '+' : ''}${fmt(monthVariance)}` : '—'}
            </p>
            <p className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>元</p>
          </div>
        </div>

        {/* 主要操作按鈕 */}
        <Link href={actionHref}>
          <div className="flex items-center gap-4 px-5 py-4 rounded-2xl transition-all hover:opacity-90 active:scale-[0.99]"
            style={{
              background: isDisputed
                ? 'linear-gradient(135deg,#f43f5e,#e11d48)'
                : 'linear-gradient(135deg,#6366f1,#4f46e5)',
              boxShadow: isDisputed
                ? '0 4px 14px rgba(244,63,94,0.3)'
                : '0 4px 14px rgba(99,102,241,0.3)',
            }}>
            <div className="h-11 w-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white text-base">{actionLabel}</p>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>業務日 {today}</p>
            </div>
            <ChevronRight className="h-5 w-5" style={{ color: 'rgba(255,255,255,0.6)' }} />
          </div>
        </Link>

        {/* 近期紀錄 */}
        {recentFiltered.length > 0 && (
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(99,102,241,0.06)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <History className="h-4 w-4" style={{ color: '#a1a1aa' }} />
                近期紀錄
              </h2>
              <Link href="/manager/history" className="text-xs font-semibold transition-opacity hover:opacity-70" style={{ color: '#6366f1' }}>
                全部查看
              </Link>
            </div>
            {recentFiltered.map((c, idx) => {
              const vc = Math.abs(c.variance) === 0 ? '#047857' : Math.abs(c.variance) <= 200 ? '#b45309' : '#be123c'
              const st = RECENT_STATUS[c.status]
              return (
                <Link key={c.id} href={`/manager/history/${c.id}`}
                  className={cn('flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50', idx !== recentFiltered.length - 1 && 'border-b border-[#f4f4f5]')}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{c.business_date}</p>
                  </div>
                  {st && (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  )}
                  <div className="text-right shrink-0 w-24">
                    <p className="text-sm font-bold tabular-nums" style={{ color: '#18181b', fontFeatureSettings: '"tnum"' }}>${fmt(c.total_revenue)}</p>
                    <p className="text-xs font-semibold tabular-nums" style={{ color: vc, fontFeatureSettings: '"tnum"' }}>
                      {c.variance >= 0 ? '+' : ''}{fmt(c.variance)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: '#e4e4e7' }} />
                </Link>
              )
            })}
          </div>
        )}

        {!storeId && (
          <div className="p-4 rounded-2xl text-sm font-medium" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' }}>
            您尚未被指派到任何店家，請聯絡系統管理員。
          </div>
        )}
      </div>
    </div>
  )
}
