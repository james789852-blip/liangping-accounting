import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import { getCachedUserProfile, getCachedStoreById } from '@/lib/cached-queries'
import { ArrowRight, CalendarDays, ClipboardList, CheckCircle2 } from 'lucide-react'
import RecentClosingsList from '@/components/manager/recent-closings'
import CKReimbursementHandoffCard from '@/components/manager/ck-reimbursement-handoff-card'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const WEEKDAY: Record<number, string> = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' }

function parseDateOnly(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const STATUS_DESC: Record<string, { label: string; pct: number; btnLabel: string }> = {
  none:      { label: '今日尚未開始，點下方按鈕開始', pct: 0,   btnLabel: '開始今日結帳' },
  draft:     { label: '草稿進行中，點下方繼續填寫',   pct: 55,  btnLabel: '繼續今日結帳' },
  petty_pending: { label: '已送出資料，請完成零用金核對', pct: 90, btnLabel: '完成零用金核對' },
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
  const businessDate = parseDateOnly(today)
  const dateLabel = today.replaceAll('-', '/')
  const weekdayLabel = `星期${WEEKDAY[businessDate.getDay()]}`

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
        .select('id, status, petty_counts, total_revenue, should_include_delivery, actual_remit, total_cost, variance')
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
    if ((storeData as any)?.type === '央廚') {
      const { data: ckStoreFull } = await admin
        .from('stores')
        .select('assigned_store_ids')
        .eq('id', storeId)
        .single()
      const assignedStoreIds: string[] = ((ckStoreFull as any)?.assigned_store_ids as string[] | null) ?? []
      const [ckRecordRes, assignedStoresRes, todayClosingsRes, pendingReimbursementRes, returnedRecordsRes] = await Promise.all([
        admin.from('ck_daily_records')
          .select('id, status, payer_name, note, receipt_photo_urls, hq_paid, hq_reimbursement_photo_urls, hq_reimbursement_sent_at, ck_reimbursement_confirmed')
          .eq('ck_store_id', storeId)
          .eq('business_date', today)
          .maybeSingle(),
        assignedStoreIds.length > 0
          ? admin.from('stores').select('id, name').in('id', assignedStoreIds)
          : Promise.resolve({ data: [] }),
        assignedStoreIds.length > 0
          ? supabase.from('daily_closings')
              .select('store_id, status')
              .in('store_id', assignedStoreIds)
              .eq('business_date', today)
          : Promise.resolve({ data: [] }),
        admin.from('ck_daily_records')
          .select('id, business_date, hq_paid, hq_reimbursement_photo_urls, hq_reimbursement_sent_at, ck_reimbursement_confirmed')
          .eq('ck_store_id', storeId)
          .eq('hq_paid', true)
          .eq('ck_reimbursement_confirmed', false)
          .order('business_date', { ascending: false })
          .limit(6),
        admin.from('ck_daily_records')
          .select('id, business_date, status, review_note, reviewed_at, updated_at')
          .eq('ck_store_id', storeId)
          .eq('status', 'disputed')
          .order('business_date', { ascending: false })
          .limit(6),
      ])
      const ckRecord = ckRecordRes.data as any
      const [{ data: ckOrders }, { data: ckExpenses }] = ckRecord
        ? await Promise.all([
            admin.from('ck_store_orders')
              .select('store_id, amount, ck_confirmed_amount, external_store_name')
              .eq('ck_daily_record_id', ckRecord.id),
            admin.from('ck_expense_items')
              .select('amount')
              .eq('ck_daily_record_id', ckRecord.id),
          ])
        : [{ data: [] }, { data: [] }]

      const submittedStoreIds = new Set(
        (todayClosingsRes.data ?? [])
          .filter((c: any) => ['submitted', 'verified'].includes(c.status))
          .map((c: any) => c.store_id as string)
      )
      const validOrders = ((ckOrders ?? []) as any[])
      const revenueTotal = validOrders.reduce((sum: number, o: any) => {
        const amount = o.store_id ? Number(o.ck_confirmed_amount ?? 0) : Number(o.amount || 0)
        return sum + amount
      }, 0)
      const expenseTotal = ((ckExpenses ?? []) as any[]).reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0)
      const pendingConfirmCount = validOrders.filter((o: any) => o.store_id && Number(o.amount || 0) > 0 && o.ck_confirmed_amount == null).length
      const mismatchCount = validOrders.filter((o: any) => o.store_id && o.ck_confirmed_amount != null && Number(o.ck_confirmed_amount) !== Number(o.amount)).length
      const assignedStoreNames = new Map(((assignedStoresRes.data ?? []) as any[]).map(s => [s.id as string, s.name as string]))
      const ckMismatchRows = validOrders
        .filter((o: any) => o.store_id && o.ck_confirmed_amount != null && Number(o.ck_confirmed_amount) !== Number(o.amount))
        .map((o: any) => ({
          store_name: assignedStoreNames.get(o.store_id as string) ?? '未命名店家',
          amount: Number(o.amount),
          ck_confirmed_amount: Number(o.ck_confirmed_amount),
        }))
      const pendingReimbursements = ((pendingReimbursementRes.data ?? []) as any[])
        .map(r => ({
          id: r.id as string,
          business_date: r.business_date as string,
          sent_at: (r.hq_reimbursement_sent_at ?? null) as string | null,
          photos: ((r.hq_reimbursement_photo_urls as string[] | null) ?? []),
        }))
      const returnedRecords = ((returnedRecordsRes.data ?? []) as any[])
        .map(r => ({
          id: r.id as string,
          business_date: r.business_date as string,
          note: ((r.review_note as string | null) || '').trim() || '總公司已退回，請修正後重新送出',
        }))
      const reimbursementNeedsConfirm = pendingReimbursements.length > 0
      const statusLabel = ckRecord?.status === 'submitted' ? '已送出，等待總公司審核'
        : ckRecord?.status === 'draft' ? '草稿進行中'
        : ckRecord?.status === 'verified' ? '已對帳完成'
        : ckRecord?.status === 'disputed' ? '總公司已退回，請修正'
        : '今日尚未建立央廚帳目'
      const ckActionLabel = ckRecord?.status === 'submitted' || ckRecord?.status === 'verified'
        ? '查看今日結果'
        : ckRecord?.status === 'disputed'
          ? '修正退回帳目'
          : ckRecord?.status === 'draft'
            ? '繼續央廚結帳'
            : '開始央廚結帳'

      return (
        <div className="min-h-full" style={{ background: '#fafafa' }}>
          <div className="bg-white px-6 py-4 sticky top-0 z-10 lg:static" style={{ borderBottom: '1px solid #f4f4f5' }}>
            <p style={{ color: '#a1a1aa', fontSize: '13px' }}>
              店長端 / <strong style={{ color: '#18181b' }}>今日狀態</strong>
            </p>
          </div>

          <div className="max-w-2xl mx-auto px-4 lg:px-6 pt-5 pb-28 lg:pb-8" style={{ maxWidth: '860px' }}>
            <div className="rounded-3xl p-6 mb-4 text-white relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg,#F59E0B 0%,#F97316 100%)', boxShadow: '0 18px 45px rgba(245,158,11,0.22)' }}>
              <div className="absolute pointer-events-none" style={{ right: '-90px', top: '-120px', width: 320, height: 320, borderRadius: '50%', background: 'rgba(255,255,255,0.14)' }} />
              <div className="relative flex items-start justify-between gap-4 mb-6">
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ opacity: 0.82 }}>央廚今日狀態</p>
                  <h1 className="text-3xl font-extrabold">{storeName || '央廚'}</h1>
                  <p className="text-sm mt-1" style={{ opacity: 0.86 }}>{dateLabel} · {weekdayLabel}</p>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.92)', color: '#92400E' }}>
                  {statusLabel}
                </span>
              </div>

              <div className="relative grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: '營業額', value: revenueTotal },
                  { label: '支出', value: expenseTotal },
                  { label: '結餘', value: revenueTotal - expenseTotal },
                ].map(item => (
                  <div key={item.label} className="rounded-2xl px-2 py-3 min-h-[92px] flex flex-col items-center justify-center text-center" style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.24)' }}>
                    <p className="text-[10px] font-semibold uppercase mb-1" style={{ opacity: 0.78 }}>{item.label}</p>
                    <p className="text-lg sm:text-xl font-bold tabular-nums leading-tight break-all">${fmt(item.value)}</p>
                  </div>
                ))}
              </div>

              <div className="relative flex gap-3 flex-col sm:flex-row">
                <Link href="/manager/ck"
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-bold py-3"
                  style={{ background: 'white', color: '#92400E', boxShadow: '0 8px 18px rgba(146,64,14,0.12)' }}>
                  <ArrowRight className="h-4 w-4" />
                  {ckActionLabel}
                </Link>
                <form action="/manager/ck" method="GET" className="flex gap-2 sm:w-auto">
                  <input type="date" name="date" defaultValue={today} max={today}
                    className="text-sm px-3 py-2 rounded-2xl outline-none min-w-0"
                    style={{ border: '1px solid rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.92)', color: '#18181b' }} />
                  <button type="submit"
                    className="inline-flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2 rounded-2xl"
                    style={{ background: 'rgba(255,255,255,0.18)', color: 'white', border: '1px solid rgba(255,255,255,0.3)' }}>
                    <CalendarDays className="h-4 w-4" />
                    補做
                  </button>
                </form>
              </div>
            </div>

            {returnedRecords.length > 0 && (
              <div className="rounded-3xl p-5 mb-4" style={{ background: '#FFF1F2', border: '1.5px solid #FDA4AF' }}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xl font-black" style={{ color: '#BE123C' }}>有帳目被總公司退回</p>
                    <p className="text-sm font-bold mt-1" style={{ color: '#9F1239' }}>請先修正退回日期的帳目，再重新送出。</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-sm font-black" style={{ background: '#FFE4E6', color: '#BE123C' }}>
                    {returnedRecords.length} 筆
                  </span>
                </div>
                <div className="space-y-3">
                  {returnedRecords.map(item => (
                    <div key={item.id} className="rounded-2xl bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ border: '1px solid #FECDD3' }}>
                      <div>
                        <p className="text-lg font-black text-gray-900">{item.business_date}</p>
                        <p className="text-sm font-bold mt-1" style={{ color: '#BE123C' }}>{item.note}</p>
                      </div>
                      <Link
                        href={`/manager/ck?date=${item.business_date}`}
                        className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-black text-white"
                        style={{ background: '#E11D48' }}
                      >
                        去修正
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reimbursementNeedsConfirm && (
              <CKReimbursementHandoffCard ckStoreId={storeId} items={pendingReimbursements} />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #f4f4f5' }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#18181b' }}>店家送出狀態</p>
                    <p className="text-xs" style={{ color: '#a1a1aa' }}>體系內店家今日帳目</p>
                  </div>
                </div>
                <div className="rounded-2xl px-4 py-3" style={{ background: '#fafafa', border: '1px solid #f4f4f5' }}>
                  <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#a1a1aa' }}>體系內店家</p>
                  <p className="text-base font-bold" style={{ color: '#18181b' }}>
                    {submittedStoreIds.size} / {assignedStoreIds.length} 間已送出
                  </p>
                </div>
              </div>

              <div className="rounded-3xl p-5 bg-white" style={{ border: `1px solid ${mismatchCount > 0 ? '#FECACA' : '#f4f4f5'}` }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: mismatchCount > 0 ? '#FEF2F2' : '#FFFBEB', color: mismatchCount > 0 ? '#be123c' : '#92400E' }}>
                    <ClipboardList className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#18181b' }}>對帳狀態</p>
                    <p className="text-xs" style={{ color: '#a1a1aa' }}>央廚確認金額</p>
                  </div>
                </div>
                <div className="rounded-2xl px-4 py-3" style={{ background: mismatchCount > 0 ? '#FEF2F2' : '#fafafa', border: `1px solid ${mismatchCount > 0 ? '#FECACA' : '#f4f4f5'}` }}>
                  <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#a1a1aa' }}>對帳狀態</p>
                  <p className="text-base font-bold" style={{ color: mismatchCount > 0 ? '#991B1B' : '#18181b' }}>
                    {mismatchCount > 0 ? `${mismatchCount} 筆不一致` : pendingConfirmCount > 0 ? `${pendingConfirmCount} 筆待對帳` : '目前無異常'}
                  </p>
                </div>
              </div>
            </div>

            {ckMismatchRows.length > 0 && (
              <div className="rounded-3xl overflow-hidden mb-4" style={{ background: '#FEF2F2', border: '1.5px solid #FECACA' }}>
                <div className="px-5 py-3" style={{ borderBottom: '1px solid #FECACA', background: '#FEE2E2' }}>
                  <p className="text-sm font-black" style={{ color: '#991B1B' }}>今日對帳異常提醒</p>
                  <p className="text-xs mt-0.5" style={{ color: '#7F1D1D' }}>店家輸入金額與央廚確認金額不同，請在今日帳目內核對。</p>
                </div>
                <div>
                  {ckMismatchRows.map((m, i) => {
                    const diff = m.ck_confirmed_amount - m.amount
                    return (
                      <div key={`${m.store_name}-${i}`} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm"
                        style={{ borderBottom: i < ckMismatchRows.length - 1 ? '1px solid #FECACA' : 'none' }}>
                        <span className="font-bold" style={{ color: '#18181b' }}>{m.store_name}</span>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-xs sm:text-sm">
                          <span style={{ color: '#71717a' }}>店家 ${fmt(m.amount)}</span>
                          <span style={{ color: '#71717a' }}>央廚 ${fmt(m.ck_confirmed_amount)}</span>
                          <span className="font-black" style={{ color: diff > 0 ? '#dc2626' : '#0369a1' }}>
                            {diff > 0 ? '+' : ''}{fmt(diff)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="rounded-2xl p-4 text-sm bg-white" style={{ border: '1px solid #f4f4f5', color: '#71717a' }}>
              央廚每日流程：先上傳支出單據，再輸入店家叫貨金額，最後填寫貨款代墊人並送出。若總公司已補款，會在這裡直接提醒點交。
            </div>
          </div>
        </div>
      )
    }
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

  const pettyVerified = !!(todayClosing?.petty_counts as { verified_at?: string } | null | undefined)?.verified_at
  const statusKey = todayClosing && ['submitted', 'verified'].includes(todayClosing.status) && !pettyVerified
    ? 'petty_pending'
    : (todayClosing?.status ?? 'none') as keyof typeof STATUS_DESC
  const cfg = STATUS_DESC[statusKey] ?? STATUS_DESC.none

  const actionHref = !todayClosing || todayClosing.status === 'draft' ? '/manager/closing'
    : todayClosing.status === 'disputed' ? `/manager/edit/${todayClosing.id}`
    : statusKey === 'petty_pending' ? `/manager/closing?date=${encodeURIComponent(today)}`
    : `/manager/summary?date=${encodeURIComponent(today)}`

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
          店長端 / <strong style={{ color: '#18181b' }}>今日狀態</strong>
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
