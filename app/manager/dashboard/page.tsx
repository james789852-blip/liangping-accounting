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

/* ── Status 設定 ── */
const STATUS_CFG = {
  none: {
    label: '尚未結帳', desc: '今日結帳尚未開始', Icon: Clock,
    iconGrad: 'linear-gradient(135deg,#94a3b8,#64748b)', iconShadow: 'rgba(100,116,139,0.35)',
    barGrad: 'linear-gradient(90deg,#94a3b8,#64748b)',
    badgeBg: '#f1f5f9', badgeText: '#475569',
  },
  draft: {
    label: '草稿中', desc: '已存草稿，尚未送出', Icon: Clock,
    iconGrad: 'linear-gradient(135deg,#f59e0b,#d97706)', iconShadow: 'rgba(245,158,11,0.4)',
    barGrad: 'linear-gradient(90deg,#f59e0b,#fbbf24)',
    badgeBg: '#fef3c7', badgeText: '#92400e',
  },
  submitted: {
    label: '待審核', desc: '等待總公司審核中', Icon: CheckCircle2,
    iconGrad: 'linear-gradient(135deg,#3b82f6,#2563eb)', iconShadow: 'rgba(59,130,246,0.4)',
    barGrad: 'linear-gradient(90deg,#3b82f6,#60a5fa)',
    badgeBg: '#dbeafe', badgeText: '#1e40af',
  },
  verified: {
    label: '已審核', desc: '今日結帳已完成', Icon: CheckCircle2,
    iconGrad: 'linear-gradient(135deg,#10b981,#059669)', iconShadow: 'rgba(16,185,129,0.4)',
    barGrad: 'linear-gradient(90deg,#10b981,#34d399)',
    badgeBg: '#d1fae5', badgeText: '#065f46',
  },
  disputed: {
    label: '異議中', desc: '請查看並修正帳目', Icon: AlertTriangle,
    iconGrad: 'linear-gradient(135deg,#ef4444,#dc2626)', iconShadow: 'rgba(239,68,68,0.4)',
    barGrad: 'linear-gradient(90deg,#ef4444,#f87171)',
    badgeBg: '#fee2e2', badgeText: '#991b1b',
  },
}

const SHORTCUTS = [
  { href: '/manager/receipts', Icon: FileText,  label: '發票收據', grad: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', shadow: 'rgba(139,92,246,0.4)' },
  { href: '/manager/cash',     Icon: Wallet,    label: '現金清點', grad: 'linear-gradient(135deg,#10b981,#059669)', shadow: 'rgba(16,185,129,0.4)' },
  { href: '/manager/summary',  Icon: TrendingUp,label: '結算結果', grad: 'linear-gradient(135deg,#3b82f6,#2563eb)', shadow: 'rgba(59,130,246,0.4)' },
]

const RECENT_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  draft:     { label: '草稿',   bg: '#f1f5f9', text: '#475569' },
  submitted: { label: '待審核', bg: '#dbeafe', text: '#1e40af' },
  verified:  { label: '已審核', bg: '#d1fae5', text: '#065f46' },
  disputed:  { label: '異議中', bg: '#fee2e2', text: '#991b1b' },
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
        .eq('store_id', storeId).order('business_date', { ascending: false }).limit(6),
    ])
    store = storeRes.data
    todayClosing = closingRes.data
    recentClosings = recentRes.data ?? []
  }

  const statusKey = (!todayClosing ? 'none' : todayClosing.status) as keyof typeof STATUS_CFG
  const cfg = STATUS_CFG[statusKey] ?? STATUS_CFG.none
  const { Icon: StatusIcon } = cfg

  const actionHref = !todayClosing || todayClosing.status === 'draft' ? '/manager/closing'
    : todayClosing.status === 'disputed' ? `/manager/edit/${todayClosing.id}` : '/manager/summary'
  const actionLabel = !todayClosing ? '開始今日結帳'
    : todayClosing.status === 'draft' ? '繼續填寫結帳'
    : todayClosing.status === 'disputed' ? '修正退回帳目' : '查看今日結帳'
  const isDisputed = todayClosing?.status === 'disputed'

  const varColor = !todayClosing ? '#94a3b8'
    : Math.abs(todayClosing.variance) === 0 ? '#059669'
    : Math.abs(todayClosing.variance) <= 200 ? '#d97706' : '#dc2626'

  const recentFiltered = recentClosings.filter(c => c.business_date !== today).slice(0, 4)

  return (
    <div className="min-h-full" style={{ background: '#f0f4ff' }}>

      {/* 頁面標頭 */}
      <div className="bg-white px-5 py-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">{todayLabel}</p>
        <h1 className="text-2xl font-bold text-slate-900">{greeting}，{profile?.name ?? '店長'}</h1>
        {store && <p className="text-sm text-slate-400 mt-0.5">{store.name}</p>}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 pb-28 space-y-4 lg:pb-8">

        {/* 今日狀態卡 */}
        <div className="bg-white rounded-3xl overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.06)' }}>
          {/* 頂部色條 */}
          <div className="h-1.5" style={{ background: cfg.barGrad }} />
          <div className="p-5">
            <div className="flex items-start gap-4">
              {/* iOS 風格 icon */}
              <div className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: cfg.iconGrad, boxShadow: `0 6px 16px ${cfg.iconShadow}` }}>
                <StatusIcon className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold text-slate-900">{cfg.label}</span>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: cfg.badgeBg, color: cfg.badgeText }}>
                    {today}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-0.5">{cfg.desc}</p>
              </div>
            </div>

            {todayClosing && (
              <div className="grid grid-cols-2 gap-4 mt-5 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-1">今日營業額</p>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">${fmt(todayClosing.total_revenue)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-1">現金誤差</p>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: varColor }}>
                    {todayClosing.variance >= 0 ? '+' : ''}{fmt(todayClosing.variance)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 主要操作 CTA */}
        <Link href={actionHref}>
          <div className="relative flex items-center gap-4 px-5 py-4 rounded-3xl overflow-hidden transition-opacity hover:opacity-95"
            style={{
              background: isDisputed
                ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                : 'linear-gradient(135deg,#6366f1,#4f46e5)',
              boxShadow: isDisputed
                ? '0 6px 20px rgba(239,68,68,0.4)'
                : '0 6px 20px rgba(99,102,241,0.45)',
            }}>
            {/* 裝飾圓 */}
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="absolute -right-4 top-4 h-20 w-20 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />

            <div className="relative h-12 w-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <ClipboardList className="h-6 w-6 text-white" />
            </div>
            <div className="relative flex-1">
              <p className="font-bold text-white text-base">{actionLabel}</p>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>業務日 {today}</p>
            </div>
            <ChevronRight className="relative h-5 w-5" style={{ color: 'rgba(255,255,255,0.5)' }} />
          </div>
        </Link>

        {/* 快捷功能 */}
        <div className="grid grid-cols-3 gap-3">
          {SHORTCUTS.map(s => (
            <Link key={s.href} href={s.href}
              className="bg-white rounded-2xl p-4 flex flex-col items-center gap-3 transition-all hover:scale-[1.02]"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.04)' }}>
              <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ background: s.grad, boxShadow: `0 4px 12px ${s.shadow}` }}>
                <s.Icon className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-bold text-slate-600">{s.label}</span>
            </Link>
          ))}
        </div>

        {/* 近期紀錄 */}
        {recentFiltered.length > 0 && (
          <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <History className="h-4 w-4 text-slate-400" /> 近期紀錄
              </h2>
              <Link href="/manager/history" className="text-xs font-bold text-indigo-600 hover:text-indigo-700">
                全部查看
              </Link>
            </div>
            {recentFiltered.map((c, idx) => {
              const vc = Math.abs(c.variance) === 0 ? '#059669' : Math.abs(c.variance) <= 200 ? '#d97706' : '#dc2626'
              const st = RECENT_STATUS[c.status]
              return (
                <Link key={c.id} href={`/manager/history/${c.id}`}
                  className={cn('flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors', idx !== recentFiltered.length - 1 && 'border-b border-slate-50')}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{c.business_date}</p>
                  </div>
                  {st && (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: st.bg, color: st.text }}>
                      {st.label}
                    </span>
                  )}
                  <div className="text-right shrink-0 w-20">
                    <p className="text-sm font-bold text-slate-700 tabular-nums">${fmt(c.total_revenue)}</p>
                    <p className="text-xs tabular-nums font-semibold" style={{ color: vc }}>
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
          <div className="p-4 rounded-2xl text-sm font-medium" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' }}>
            您尚未被指派到任何店家，請聯絡系統管理員。
          </div>
        )}
      </div>
    </div>
  )
}
