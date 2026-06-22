import { createClient } from '@/lib/supabase/server'
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, store_ids, is_hq').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) return <div className="p-6" style={{ color: '#a1a1aa' }}>尚未指派店家</div>

  const params = await searchParams
  const searchDate = params.date ?? ''
  const searchMonth = params.month ?? ''

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
          <form method="GET" action="/manager/history" className="flex gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#a1a1aa' }} />
              <input
                type="date"
                name="date"
                defaultValue={searchDate}
                style={{
                  width: '100%', height: '40px', padding: '0 12px 0 36px',
                  border: '1.5px solid #e4e4e7', borderRadius: '12px',
                  fontSize: '14px', outline: 'none', background: 'white',
                  fontFamily: 'inherit', color: '#18181b',
                }}
              />
            </div>
            <input
              type="month"
              name="month"
              defaultValue={searchMonth}
              style={{
                height: '40px', padding: '0 12px',
                border: '1.5px solid #e4e4e7', borderRadius: '12px',
                fontSize: '14px', outline: 'none', background: 'white',
                fontFamily: 'inherit', color: '#18181b',
              }}
            />
            <button type="submit"
              className="px-4 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', height: '40px' }}>
              搜尋
            </button>
            {(searchDate || searchMonth) && (
              <a href="/manager/history"
                className="px-3 rounded-xl text-sm font-medium flex items-center"
                style={{ border: '1.5px solid #e4e4e7', color: '#71717a', height: '40px', background: 'white' }}>
                清除
              </a>
            )}
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
