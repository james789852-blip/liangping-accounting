import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { CheckSquare, AlertTriangle, ClipboardCheck } from 'lucide-react'
import ReviewActions from '@/components/hq/review-actions'
import ReviewCard from '@/components/hq/review-card'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

export default async function ReviewsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile || (!profile.is_hq && profile.role !== '老闆')) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足</div>
  }

  const canReview = ['經理', '總監', '老闆'].includes(profile.role)
  const canDispute = ['經理', '總監', '老闆'].includes(profile.role)

  const admin = createAdminClient()

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

  const { data: recent } = await supabase
    .from('daily_closings')
    .select('id, business_date, status, total_revenue, variance, submitted_at, stores(name)')
    .eq('status', 'verified')
    .order('submitted_at', { ascending: false })
    .limit(20)

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      {/* 頁首 */}
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <ClipboardCheck className="h-3.5 w-3.5" />
            審核中心
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>帳目審核</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>展開查看收據與明細後核准或退回</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6 pb-28">

        {/* 待處理 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: '#f97316' }} />
            <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>
              待處理（{pending?.length ?? 0} 筆）
            </h2>
          </div>

          {(!pending || pending.length === 0) ? (
            <div className="text-center py-10 rounded-2xl" style={{ background: 'white', border: '1px solid #f4f4f5', color: '#a1a1aa' }}>
              <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">目前無待審核帳目</p>
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
            <div className="flex items-center gap-2 px-1">
              <CheckSquare className="h-3.5 w-3.5" style={{ color: '#10b981' }} />
              <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: '#a1a1aa' }}>近期已核准</h2>
            </div>
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              {recent.map((c, idx) => {
                const store = c.stores as any
                const absVar = Math.abs(c.variance)
                const varColor = absVar === 0 ? '#047857' : absVar <= 200 ? '#b45309' : '#be123c'
                const varBg    = absVar === 0 ? '#d1fae5' : absVar <= 200 ? '#fef3c7' : '#ffe4e6'
                return (
                  <div key={c.id} className="px-4 py-3 space-y-2"
                    style={{ borderBottom: idx !== recent.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: '#18181b' }}>{store?.name}</p>
                        <p className="text-xs" style={{ color: '#a1a1aa' }}>{c.business_date}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm tabular-nums font-semibold" style={{ color: '#18181b' }}>${fmt(c.total_revenue)}</p>
                        <span className="text-xs tabular-nums px-1.5 py-0.5 rounded-lg font-semibold"
                          style={{ color: varColor, background: varBg }}>
                          {c.variance >= 0 ? '+' : ''}{fmt(c.variance)}
                        </span>
                      </div>
                    </div>
                    {canDispute && (
                      <ReviewActions closingId={c.id} currentStatus={c.status} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
