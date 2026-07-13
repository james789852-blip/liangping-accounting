import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, History, Search } from 'lucide-react'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getMonthLastDay } from '@/lib/business-date'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const STATUS: Record<string, { label: string; dot: string; ring: string }> = {
  draft:     { label: '草稿',   dot: '#a1a1aa', ring: '#f4f4f5' },
  submitted: { label: '已送出', dot: '#F59E0B', ring: '#FEF3C7' },
  verified:  { label: '已審核', dot: '#10b981', ring: '#d1fae5' },
  disputed:  { label: '退回中', dot: '#f43f5e', ring: '#ffe4e6' },
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; month?: string }>
}) {
  const supabase = await createClient()
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, store_ids, is_hq').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) return <div className="p-6" style={{ color: '#a1a1aa' }}>尚未指派店家</div>

  const params = await searchParams
  const searchDate = params.date ?? ''
  const searchMonth = params.month ?? ''
  const admin = createAdminClient()

  const { data: currentStore } = await admin
    .from('stores')
    .select('id, name, type')
    .eq('id', storeId)
    .maybeSingle()

  if (currentStore?.type === '央廚') {
    let ckQuery = admin
      .from('ck_daily_records')
      .select('id, business_date, status, payer_name, hq_paid, ck_reimbursement_confirmed, review_note, reviewed_at')
      .eq('ck_store_id', storeId)
      .order('business_date', { ascending: false })

    if (searchDate) {
      ckQuery = ckQuery.eq('business_date', searchDate)
    } else if (searchMonth) {
      const [y, m] = searchMonth.split('-')
      ckQuery = ckQuery
        .gte('business_date', `${y}-${m}-01`)
        .lte('business_date', getMonthLastDay(parseInt(y), parseInt(m)))
    } else {
      ckQuery = ckQuery.limit(90)
    }

    const { data: ckRecords } = await ckQuery
    const ckList = ckRecords ?? []
    const ckRecordIds = ckList.map((r: any) => r.id)
    const [{ data: ckOrders }, { data: ckExpenses }] = await Promise.all([
      ckRecordIds.length > 0
        ? admin.from('ck_store_orders').select('ck_daily_record_id, store_id, amount, ck_confirmed_amount').in('ck_daily_record_id', ckRecordIds)
        : Promise.resolve({ data: [] }),
      ckRecordIds.length > 0
        ? admin.from('ck_expense_items').select('ck_daily_record_id, amount').in('ck_daily_record_id', ckRecordIds)
        : Promise.resolve({ data: [] }),
    ])
    const ckRows = ckList.map((r: any) => {
      const revenue = (ckOrders ?? [])
        .filter((o: any) => o.ck_daily_record_id === r.id)
        .reduce((s: number, o: any) => s + (o.store_id ? Number(o.ck_confirmed_amount ?? 0) : Number(o.amount ?? 0)), 0)
      const expense = (ckExpenses ?? [])
        .filter((e: any) => e.ck_daily_record_id === r.id)
        .reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0)
      return { ...r, revenue, expense, balance: revenue - expense }
    })

    const ckByMonth: Record<string, typeof ckRows> = {}
    for (const row of ckRows) {
      const key = row.business_date.slice(0, 7)
      if (!ckByMonth[key]) ckByMonth[key] = []
      ckByMonth[key].push(row)
    }

    return (
      <div className="min-h-full" style={{ background: '#fafafa' }}>
        <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-2 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
              <History className="h-3.5 w-3.5" />
              央廚歷史紀錄
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>帳目紀錄</h1>
            <form method="GET" action="/manager/history" className="mt-4 rounded-2xl bg-white p-3" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <p className="text-xs font-bold mb-2" style={{ color: '#71717a' }}>搜尋帳目</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto_auto]">
                <label className="min-w-0">
                  <span className="mb-1 block text-[11px] font-semibold" style={{ color: '#a1a1aa' }}>指定日期</span>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#a1a1aa' }} />
                    <input type="date" name="date" defaultValue={searchDate}
                      style={{ width: '100%', minWidth: 0, height: '40px', padding: '0 10px 0 36px', border: '1.5px solid #e4e4e7', borderRadius: '12px', fontSize: '16px', outline: 'none', background: 'white', fontFamily: 'inherit', color: '#18181b' }} />
                  </div>
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[11px] font-semibold" style={{ color: '#a1a1aa' }}>整月查詢</span>
                  <input type="month" name="month" defaultValue={searchMonth}
                    className="min-w-0"
                    style={{ width: '100%', minWidth: 0, height: '40px', padding: '0 10px', border: '1.5px solid #e4e4e7', borderRadius: '12px', fontSize: '16px', outline: 'none', background: 'white', fontFamily: 'inherit', color: '#18181b' }} />
                </label>
                <button type="submit" className="rounded-xl text-sm font-semibold text-white sm:mt-[18px]" style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', height: '40px', minWidth: '64px' }}>搜尋</button>
                {(searchDate || searchMonth) && (
                  <a href="/manager/history" className="rounded-xl text-sm font-medium flex items-center justify-center sm:mt-[18px]" style={{ border: '1.5px solid #e4e4e7', color: '#71717a', height: '40px', minWidth: '56px', background: 'white' }}>清除</a>
                )}
              </div>
              <p className="mt-2 text-[11px]" style={{ color: '#a1a1aa' }}>可查單日帳目，也可選月份查看整月紀錄。</p>
            </form>
          </div>
        </div>

        <div className="max-w-xl mx-auto px-4 py-5 space-y-5 pb-28">
          {ckRows.length === 0 && (
            <div className="text-center py-16" style={{ color: '#a1a1aa' }}>
              <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{searchDate || searchMonth ? '查無符合的央廚帳目' : '尚無央廚帳目紀錄'}</p>
            </div>
          )}

          {Object.entries(ckByMonth).map(([month, rows]) => {
            const [y, m] = month.split('-')
            const monthRevenue = rows.reduce((s, r) => s + r.revenue, 0)
            return (
              <div key={month}>
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>{parseInt(y)} 年 {parseInt(m)} 月</p>
                  <p className="text-xs font-semibold tabular-nums" style={{ color: '#52525b' }}>${fmt(monthRevenue)}</p>
                </div>
                <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  {rows.map((c, idx) => {
                    const st = STATUS[c.status] ?? STATUS.draft
                    return (
                      <Link key={c.id} href={`/manager/ck?date=${c.business_date}`}
                        className="flex items-center gap-3 px-4 py-3.5 transition-all hover:translate-x-1"
                        style={{ borderBottom: idx !== rows.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ background: st.dot, boxShadow: `0 0 0 3px ${st.ring}` }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold" style={{ color: '#18181b' }}>{c.business_date}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: st.ring, color: st.dot }}>{st.label}</span>
                            {c.hq_paid && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#f0fdf4', color: '#15803d' }}>{c.ck_reimbursement_confirmed ? '補款已點交' : '待點交補款'}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs tabular-nums" style={{ color: '#10b981' }}>營業額 ${fmt(c.revenue)}</span>
                            <span className="text-xs tabular-nums" style={{ color: '#f97316' }}>支出 ${fmt(c.expense)}</span>
                            <span className="text-xs font-semibold tabular-nums" style={{ color: c.balance >= 0 ? '#d97706' : '#dc2626' }}>結餘 {c.balance >= 0 ? '' : '-'}${fmt(Math.abs(c.balance))}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-[18px] w-[18px] shrink-0" style={{ color: '#a1a1aa' }} />
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  let query = supabase
    .from('daily_closings')
    .select('id, business_date, status, total_revenue, variance, submitted_at')
    .eq('store_id', storeId)
    .order('business_date', { ascending: false })

  if (searchDate) {
    query = query.eq('business_date', searchDate)
  } else if (searchMonth) {
    const [y, m] = searchMonth.split('-')
    query = query
      .gte('business_date', `${y}-${m}-01`)
      .lte('business_date', getMonthLastDay(parseInt(y), parseInt(m)))
  } else {
    query = query.limit(90)
  }

  const { data: closings } = await query
  const list = closings ?? []

  const byMonth: Record<string, typeof list> = {}
  for (const c of list) {
    const key = c.business_date.slice(0, 7)
    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(c)
  }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-2 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <History className="h-3.5 w-3.5" />
            歷史紀錄
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>帳目紀錄</h1>

          {/* 搜尋列 */}
          <form method="GET" action="/manager/history" className="mt-4 rounded-2xl bg-white p-3" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-xs font-bold mb-2" style={{ color: '#71717a' }}>搜尋帳目</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto_auto]">
              <label className="min-w-0">
                <span className="mb-1 block text-[11px] font-semibold" style={{ color: '#a1a1aa' }}>指定日期</span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#a1a1aa' }} />
                  <input
                    type="date"
                    name="date"
                    defaultValue={searchDate}
                    style={{
                      width: '100%', minWidth: 0, height: '40px', padding: '0 10px 0 36px',
                      border: '1.5px solid #e4e4e7', borderRadius: '12px',
                      fontSize: '16px', outline: 'none', background: 'white',
                      fontFamily: 'inherit', color: '#18181b',
                    }}
                  />
                </div>
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[11px] font-semibold" style={{ color: '#a1a1aa' }}>整月查詢</span>
                <input
                  type="month"
                  name="month"
                  defaultValue={searchMonth}
                  className="min-w-0"
                  style={{
                    width: '100%', minWidth: 0, height: '40px', padding: '0 10px',
                    border: '1.5px solid #e4e4e7', borderRadius: '12px',
                    fontSize: '16px', outline: 'none', background: 'white',
                    fontFamily: 'inherit', color: '#18181b',
                  }}
                />
              </label>
              <button type="submit"
                className="rounded-xl text-sm font-semibold text-white sm:mt-[18px]"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', height: '40px', minWidth: '64px' }}>
                搜尋
              </button>
              {(searchDate || searchMonth) && (
                <a href="/manager/history"
                  className="rounded-xl text-sm font-medium flex items-center justify-center sm:mt-[18px]"
                  style={{ border: '1.5px solid #e4e4e7', color: '#71717a', height: '40px', minWidth: '56px', background: 'white' }}>
                  清除
                </a>
              )}
            </div>
            <p className="mt-2 text-[11px]" style={{ color: '#a1a1aa' }}>可查單日帳目，也可選月份查看整月紀錄。</p>
          </form>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-5 pb-28">
        {list.length === 0 && (
          <div className="text-center py-16" style={{ color: '#a1a1aa' }}>
            <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{searchDate || searchMonth ? '查無符合的帳目' : '尚無帳目紀錄'}</p>
          </div>
        )}

        {Object.entries(byMonth).map(([month, rows]) => {
          const [y, m] = month.split('-')
          const monthRevenue = rows
            .filter(r => ['submitted', 'verified'].includes(r.status))
            .reduce((s, r) => s + r.total_revenue, 0)
          return (
            <div key={month}>
              <div className="flex items-center justify-between px-1 mb-2">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>
                  {parseInt(y)} 年 {parseInt(m)} 月
                </p>
                {monthRevenue > 0 && (
                  <p className="text-xs font-semibold tabular-nums" style={{ color: '#52525b' }}>
                    ${fmt(monthRevenue)}
                  </p>
                )}
              </div>
              <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                {rows.map((c, idx) => {
                  const st = STATUS[c.status] ?? STATUS.draft
                  const absVar = Math.abs(c.variance)
                  const varColor = absVar === 0 ? '#059669' : absVar <= 200 ? '#d97706' : '#dc2626'
                  return (
                    <Link key={c.id} href={`/manager/history/${c.id}`}
                      className="flex items-center gap-3 px-4 py-3.5 transition-all hover:translate-x-1"
                      style={{ borderBottom: idx !== rows.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                      <div className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: st.dot, boxShadow: `0 0 0 3px ${st.ring}` }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: '#18181b' }}>{c.business_date}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: st.ring, color: st.dot }}>
                            {st.label}
                          </span>
                        </div>
                        {['submitted', 'verified'].includes(c.status) && (
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs tabular-nums" style={{ color: '#52525b' }}>${fmt(c.total_revenue)}</span>
                            <span className="text-xs font-semibold tabular-nums" style={{ color: varColor }}>
                              誤差 {c.variance >= 0 ? '+' : ''}{fmt(c.variance)}
                            </span>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-[18px] w-[18px] shrink-0" style={{ color: '#a1a1aa' }} />
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
