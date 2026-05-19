import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CheckSquare, AlertTriangle } from 'lucide-react'
import ReviewActions from '@/components/hq/review-actions'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const statusLabel: Record<string, string> = {
  submitted: '待審核', disputed: '已退回', verified: '已核准',
}
const statusColor: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  disputed: 'bg-orange-100 text-orange-700',
  verified: 'bg-green-100 text-green-700',
}

export default async function ReviewsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile || (!profile.is_hq && profile.role !== '老闆')) {
    return <div className="p-6 text-red-500">權限不足</div>
  }

  const { data: pending } = await supabase
    .from('daily_closings')
    .select('id, business_date, status, total_revenue, variance, note, dispute_note, submitted_at, stores(name)')
    .in('status', ['submitted', 'disputed'])
    .order('submitted_at', { ascending: true })

  const { data: recent } = await supabase
    .from('daily_closings')
    .select('id, business_date, status, total_revenue, variance, submitted_at, stores(name)')
    .eq('status', 'verified')
    .order('submitted_at', { ascending: false })
    .limit(20)

  const canDispute = ['經理', '總監', '老闆'].includes(profile.role)

  const canReview = ['經理', '總監', '老闆'].includes(profile.role)

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">審核中心</h1>
        <p className="text-sm text-slate-500 mt-0.5">審核每日結帳，或退回要求修正</p>
      </div>

      {/* 待審核 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold text-slate-700">待處理（{pending?.length ?? 0} 筆）</h2>
        </div>

        {(!pending || pending.length === 0) ? (
          <div className="text-center py-10 text-slate-400 text-sm bg-slate-50 rounded-xl border border-slate-100">
            目前無待審核帳目
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map(c => {
              const store = c.stores as any
              const varColor = Math.abs(c.variance) === 0 ? 'text-green-600' :
                Math.abs(c.variance) <= 200 ? 'text-yellow-600' : 'text-red-600'
              return (
                <Card key={c.id}>
                  <CardContent className="p-4 space-y-3">
                    {/* 標題列 */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-sm">{store?.name}</span>
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusColor[c.status])}>
                            {statusLabel[c.status]}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{c.business_date}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums">${fmt(c.total_revenue)}</p>
                        <p className={cn('text-xs tabular-nums font-medium', varColor)}>
                          誤差 {c.variance >= 0 ? '+' : ''}{fmt(c.variance)}
                        </p>
                      </div>
                    </div>

                    {/* 店長備註 */}
                    {c.note && (
                      <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                        備註：{c.note}
                      </p>
                    )}

                    {/* 退回原因（已退回的顯示） */}
                    {c.status === 'disputed' && c.dispute_note && (
                      <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
                        已退回原因：{c.dispute_note}
                      </p>
                    )}

                    {/* 操作按鈕 */}
                    {canReview && c.status === 'submitted' && (
                      <ReviewActions closingId={c.id} currentStatus={c.status} />
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* 近期已核准 */}
      {recent && recent.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-green-500" />
            <h2 className="text-sm font-semibold text-slate-700">近期已核准</h2>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {recent.map(c => {
                  const store = c.stores as any
                  const varColor = Math.abs(c.variance) === 0 ? 'text-green-600' :
                    Math.abs(c.variance) <= 200 ? 'text-yellow-600' : 'text-red-600'
                  return (
                    <div key={c.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{store?.name}</p>
                          <p className="text-xs text-slate-400">{c.business_date}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm tabular-nums font-medium">${fmt(c.total_revenue)}</p>
                          <p className={cn('text-xs tabular-nums', varColor)}>
                            {c.variance >= 0 ? '+' : ''}{fmt(c.variance)}
                          </p>
                        </div>
                      </div>
                      {canDispute && (
                        <ReviewActions closingId={c.id} currentStatus={c.status} />
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
