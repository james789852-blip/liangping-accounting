import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, History } from 'lucide-react'
import { getEffectiveStoreId } from '@/lib/get-effective-store'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const STATUS: Record<string, { label: string; dot: string; ring: string }> = {
  draft:     { label: '草稿',    dot: '#a1a1aa', ring: '#f4f4f5' },
  submitted: { label: '已送出',  dot: '#6366f1', ring: '#e0e7ff' },
  verified:  { label: '已審核',  dot: '#10b981', ring: '#d1fae5' },
  disputed:  { label: '退回中',  dot: '#f43f5e', ring: '#ffe4e6' },
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, store_ids').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) return <div className="p-6" style={{ color: '#a1a1aa' }}>尚未指派店家</div>

  const { data: closings } = await supabase
    .from('daily_closings')
    .select('id, business_date, status, total_revenue, variance, submitted_at')
    .eq('store_id', storeId)
    .order('business_date', { ascending: false })
    .limit(60)

  const list = closings ?? []

  // 依月份分組
  const byMonth: Record<string, typeof list> = {}
  for (const c of list) {
    const key = c.business_date.slice(0, 7)
    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(c)
  }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* 頁首 */}
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
          <History className="h-3.5 w-3.5" />
          歷史紀錄
        </div>
        <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>
          帳目紀錄
        </h1>
        <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>最近 60 天</p>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-5 pb-28">
        {list.length === 0 && (
          <div className="text-center py-16" style={{ color: '#a1a1aa' }}>
            <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">尚無帳目紀錄</p>
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
                      {/* Status dot */}
                      <div className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: st.dot, boxShadow: `0 0 0 3px ${st.ring}` }} />
                      {/* Main info */}
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
                            <span className="text-xs tabular-nums" style={{ color: '#52525b' }}>
                              ${fmt(c.total_revenue)}
                            </span>
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
