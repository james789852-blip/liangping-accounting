import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CheckSquare, AlertTriangle } from 'lucide-react'
import ReviewActions from '@/components/hq/review-actions'
import ReviewCard from '@/components/hq/review-card'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const statusColor: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  disputed: 'bg-orange-100 text-orange-700',
  verified: 'bg-green-100 text-green-700',
}
const statusLabel: Record<string, string> = {
  submitted: '待審核', disputed: '已退回', verified: '已核准',
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

  const canReview = ['經理', '總監', '老闆'].includes(profile.role)
  const canDispute = ['經理', '總監', '老闆'].includes(profile.role)

  const admin = createAdminClient()

  // 待處理：撈完整明細
  const { data: pending } = await admin
    .from('daily_closings')
    .select(`
      id, business_date, status, total_revenue, variance, note, dispute_note,
      submitted_at, should_include_delivery, actual_remit, total_cost, total_expenses,
      stores(id, name),
      revenue_items(channel, account_name, gross_amount),
      expense_items(description, amount),
      order_items(item_name, quantity, total_amount)
    `)
    .in('status', ['submitted', 'disputed'])
    .order('submitted_at', { ascending: true })

  // 為每筆待審帳目撈對應日期的收據（含照片）
  const receiptsByClosing: Record<string, any[]> = {}
  if (pending && pending.length > 0) {
    await Promise.all(
      pending.map(async (c) => {
        const store = c.stores as any
        if (!store?.id) return
        const { data: receipts } = await admin
          .from('receipts')
          .select('id, vendor_name, receipt_type, total_amount, photo_url, receipt_items(item_name, amount)')
          .eq('store_id', store.id)
          .eq('business_date', c.business_date)
          .order('created_at', { ascending: true })
        receiptsByClosing[c.id] = receipts ?? []
      })
    )
  }

  // 近期已核准（精簡列表）
  const { data: recent } = await supabase
    .from('daily_closings')
    .select('id, business_date, status, total_revenue, variance, submitted_at, stores(name)')
    .eq('status', 'verified')
    .order('submitted_at', { ascending: false })
    .limit(20)

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">審核中心</h1>
        <p className="text-sm text-slate-500 mt-0.5">審核每日結帳，展開查看收據與明細後核准或退回</p>
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
            {pending.map(c => (
              <ReviewCard
                key={c.id}
                closing={c as any}
                receipts={receiptsByClosing[c.id] ?? []}
                canReview={canReview}
                canDispute={canDispute}
              />
            ))}
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
