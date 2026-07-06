import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import { getCachedUserProfile, getCachedStoreById } from '@/lib/cached-queries'
import { ArrowRight } from 'lucide-react'
import RecentClosingsList from '@/components/manager/recent-closings'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const WEEKDAY: Record<number, string> = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' }

const STATUS_DESC: Record<string, { label: string; pct: number; btnLabel: string }> = {
  none:      { label: '今日尚未開始，點下方按鈕開始', pct: 0,   btnLabel: '開始今日結帳' },
  draft:     { label: '草稿進行中，點下方繼續填寫',   pct: 55,  btnLabel: '繼續今日結帳' },
  submitted: { label: '已送出，等待總公司審核中',      pct: 100, btnLabel: '查看今日結帳' },
  verified:  { label: '已對帳完成',                   pct: 100, btnLabel: '查看今日結帳' },
  disputed:  { label: '有異議需修正，請重新填寫',      pct: 30,  btnLabel: '修正退回帳目' },
}

const HIST_STATUS: Record<string, string> = {
  draft:     '草稿',
  submitted: '待審核',
  verified:  '已對帳',
  disputed:  '異議中',
}

export default async function ManagerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getCachedUserProfile(user.id)
  // manager/layout 已擋下非店家角色；此處只需處理店家角色的流程
  const storeId = await getEffectiveStoreId(profile)
  const today = getBusinessDate()
  const todayDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  const dateLabel = format(todayDate, 'yyyy/MM/dd', { locale: zhTW })
  const weekdayLabel = `星期${WEEKDAY[todayDate.getDay()]}`

  let todayClosing: any = null
  let recentClosings: any[] = []
  let storeName = ''
  let ckMismatches: { business_date: string; amount: number; ck_confirmed_amount: number }[] = []

  if (storeId) {
    // 過去 7 天範圍
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10)

    const admin = createAdminClient()
    const [storeData, closingRes, recentRes, ckMismatchRes, validClosingRes] = await Promise.all([
      getCachedStoreById(storeId),
      supabase.from('daily_closings')
        .select('id, status, total_revenue, should_include_delivery, actual_remit, total_cost, variance')
        .eq('store_id', storeId).eq('business_date', today).maybeSingle(),
      supabase.from('daily_closings')
        .select('id, business_date, status, total_revenue, should_include_delivery, variance')
        .eq('store_id', storeId).order('business_date', { ascending: false }).limit(8),
      // 央廚對帳異常：過去 7 天該店 ck_confirmed_amount 跟自報 amount 不一致
      admin.from('ck_store_orders')
        .select('amount, ck_confirmed_amount, ck_daily_record_id, ck_daily_records!inner(business_date)')
        .eq('store_id', storeId)
        .not('ck_confirmed_amount', 'is', null)
        .gte('ck_daily_records.business_date', sevenDaysAgoStr),
      admin.from('daily_closings')
        .select('business_date')
        .eq('store_id', storeId)
        .gte('business_date', sevenDaysAgoStr)
        .lte('business_date', today)
        .in('status', ['submitted', 'verified']),
    ])
    storeName = (storeData as any)?.name ?? ''
    if ((storeData as any)?.type === '央廚') redirect('/manager/ck')
    todayClosing = closingRes.data
    recentClosings = (recentRes.data ?? []).filter((c: any) => c.business_date !== today).slice(0, 7)

    const validClosingDates = new Set((validClosingRes.data ?? []).map((c: any) => c.business_date as string))
    ckMismatches = (ckMismatchRes.data ?? [])
      .filter((o: any) => validClosingDates.has((o.ck_daily_records as any)?.business_date as string))
      .filter((o: any) => o.ck_confirmed_amount != null && Number(o.ck_confirmed_amount) !== Number(o.amount))
      .map((o: any) => ({
        business_date: (o.ck_daily_records as any)?.business_date as string,
        amount: Number(o.amount),
        ck_confirmed_amount: Number(o.ck_confirmed_amount),
      }))
      .sort((a, b) => b.business_date.localeCompare(a.business_date))
  }

  const statusKey = (todayClosing?.status ?? 'none') as keyof typeof STATUS_DESC
  const cfg = STATUS_DESC[statusKey] ?? STATUS_DESC.none

  const actionHref = !todayClosing || todayClosing.status === 'draft' ? '/manager/closing'
    : todayClosing.status === 'disputed' ? `/manager/edit/${todayClosing.id}` : '/manager/closing'

  const isDisputed = todayClosing?.status === 'disputed'
  const ctaGradient = isDisputed
    ? 'linear-gradient(135deg,#be123c 0%,#9f1239 50%,#881337 100%)'
    : 'linear-gradient(135deg,#FBBF24 0%,#F59E0B 50%,#F97316 100%)'

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* 頁面頂部 */}
      <div className="bg-white px-6 py-4 sticky top-0 z-10 lg:static"
        style={{ borderBottom: '1px solid #f4f4f5' }}>
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>
          店長端 / <strong style={{ color: '#18181b' }}>今日結帳</strong>
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 lg:px-6 pt-5 pb-28 lg:pb-8" style={{ maxWidth: '800px' }}>

        {/* 央廚對帳異常橫幅 — 過去 7 天店家自報 vs 央廚對帳金額不一致 */}
        {ckMismatches.length > 0 && (
          <div className="rounded-2xl p-4 mb-4" style={{ background: '#FEF2F2', border: '1.5px solid #FECACA' }}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <p className="text-sm font-bold" style={{ color: '#991B1B' }}>
                央廚對帳異常（{ckMismatches.length} 筆）
              </p>
            </div>
            <p className="text-xs mb-3" style={{ color: '#7F1D1D' }}>
              你提交的央廚叫貨金額跟央廚那邊確認的金額不一致，請核對：
            </p>
            <div className="space-y-1.5">
              {ckMismatches.slice(0, 5).map((m, i) => {
                const diff = m.ck_confirmed_amount - m.amount
                return (
                  <div key={i} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg" style={{ background: '#fff' }}>
                    <span style={{ color: '#52525b' }}>{m.business_date}</span>
                    <div className="flex items-center gap-3">
                      <span style={{ color: '#71717a' }}>自報 ${Math.round(m.amount).toLocaleString()}</span>
                      <span style={{ color: '#71717a' }}>央廚 ${Math.round(m.ck_confirmed_amount).toLocaleString()}</span>
                      <span className="font-bold tabular-nums" style={{ color: diff > 0 ? '#dc2626' : '#0369a1' }}>
                        {diff > 0 ? '+' : ''}{Math.round(diff).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )
              })}
              {ckMismatches.length > 5 && (
                <p className="text-xs text-center pt-1" style={{ color: '#a1a1aa' }}>
                  …還有 {ckMismatches.length - 5} 筆
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── 大 CTA 卡片 ── */}
        <Link href={actionHref}>
          <div className="rounded-3xl p-8 text-white mb-5 relative overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5"
            style={{
              background: ctaGradient,
              boxShadow: isDisputed
                ? '0 20px 50px -10px rgba(190,18,60,0.3)'
                : '0 20px 50px -10px rgba(245,158,11,0.3)',
            }}>
            {/* 裝飾光暈 */}
            <div className="absolute pointer-events-none"
              style={{ top: '-50%', right: '-10%', width: '400px', height: '400px',
                background: 'radial-gradient(circle,rgba(255,255,255,0.2),transparent)', borderRadius: '50%' }} />

            <div className="relative">
              {/* 日期標籤 */}
              <p className="flex items-center gap-1.5 mb-2" style={{ fontSize: '13px', opacity: 0.85 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {dateLabel} · {weekdayLabel}
              </p>

              <h2 style={{ fontSize: '36px', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '16px' }}>
                {storeName || '今日結帳'}
              </h2>

              {/* 進度條 */}
              <div className="rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.2)', height: '6px' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${cfg.pct}%`, background: 'white' }} />
              </div>
              <div className="flex justify-between text-xs mb-5" style={{ opacity: 0.9 }}>
                <span>{cfg.label}</span>
                {cfg.pct > 0 && cfg.pct < 100 && <span>進度 {cfg.pct}%</span>}
                {cfg.pct === 100 && <span>100% 完成</span>}
              </div>

              {/* 按鈕 */}
              <button className="inline-flex items-center gap-2 rounded-xl font-bold transition-all hover:-translate-y-0.5"
                style={{
                  background: 'white', color: isDisputed ? '#9f1239' : '#92400E',
                  padding: '14px 28px', fontSize: '15px', border: 'none', cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.1)', fontFamily: 'inherit',
                }}>
                <ArrowRight className="h-4 w-4" />
                {cfg.btnLabel}
              </button>
            </div>
          </div>
        </Link>

        {/* ── 補做過往帳目入口（測試階段） ── */}
        <div className="bg-white rounded-2xl p-4 mb-3" style={{ border: '1px solid #FDE68A', background: '#FFFBEB' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: '#92400E' }}>📅 補做過往帳目</p>
              <p className="text-xs mt-0.5" style={{ color: '#b45309' }}>選擇日期填入該日帳目（測試階段使用）</p>
            </div>
            <form action="/manager/closing" method="GET" className="flex items-center gap-2 shrink-0">
              <input type="date" name="date" defaultValue={today} max={today}
                className="text-sm px-2 py-1.5 rounded-lg outline-none"
                style={{ border: '1.5px solid #FDE68A', background: 'white', color: '#18181b' }} />
              <button type="submit"
                className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', border: 'none', cursor: 'pointer' }}>
                前往
              </button>
            </form>
          </div>
        </div>

        {/* ── 快速摘要 4 格 ── */}
        <div className="grid grid-cols-2 gap-3 mb-5 sm:grid-cols-4">
          {[
            { label: '今日營業額', val: todayClosing ? `$${fmt(todayClosing.total_revenue)}` : '—', color: '#18181b' },
            { label: '應匯入', val: todayClosing?.should_include_delivery != null ? `$${fmt(todayClosing.should_include_delivery)}` : '—', color: '#92400E' },
            {
              label: '實匯入',
              val: todayClosing?.actual_remit != null ? `$${fmt(todayClosing.actual_remit)}` : null,
              placeholder: '待現金清點',
              color: todayClosing?.actual_remit != null ? '#18181b' : '#a1a1aa',
            },
            { label: '配送費', val: todayClosing?.total_cost != null && todayClosing.total_cost > 0 ? `$${fmt(todayClosing.total_cost)}` : '—', color: '#f97316' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #f4f4f5' }}>
              <p style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 500, marginBottom: '4px' }}>{item.label}</p>
              <p style={{ fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: item.color }}>
                {item.val ?? <span style={{ fontSize: '14px', paddingTop: '6px', display: 'block' }}>{(item as any).placeholder}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* ── 最近 7 天紀錄 ── */}
        {recentClosings.length > 0 && (
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f4f4f5' }}>
              <h3 className="font-semibold flex items-center gap-2.5" style={{ fontSize: '15px' }}>
                <span className="flex items-center justify-center rounded-xl text-base"
                  style={{ width: '32px', height: '32px', background: '#FFFBEB', fontSize: '16px' }}>📋</span>
                最近 7 天結帳
              </h3>
              <Link href="/manager/history"
                className="text-xs font-semibold rounded-full px-3 py-1"
                style={{ background: '#FFFBEB', color: '#92400E' }}>
                點任一筆查看詳細
              </Link>
            </div>

            <RecentClosingsList closings={recentClosings} />
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
