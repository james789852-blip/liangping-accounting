import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'
import { ChevronRight, History } from 'lucide-react'
import { cn } from '@/lib/utils'

const statusLabel: Record<string, string> = {
  draft: '草稿', submitted: '已送出', verified: '已審核', disputed: '異議中'
}
const statusColor: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  submitted: 'bg-blue-100 text-blue-700',
  verified: 'bg-green-100 text-green-700',
  disputed: 'bg-red-100 text-red-700',
}

function fmt(n: number) {
  return Math.round(n).toLocaleString('zh-TW')
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('store_ids').eq('user_id', user.id).single()

  const storeId = profile?.store_ids?.[0]
  if (!storeId) {
    return <div className="p-6 text-slate-500">尚未指派店家</div>
  }

  const { data: closings } = await supabase
    .from('daily_closings')
    .select('id, business_date, status, total_revenue, variance, submitted_at')
    .eq('store_id', storeId)
    .order('business_date', { ascending: false })
    .limit(60)

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-slate-600" />
        <h1 className="text-xl font-bold text-slate-900">歷史紀錄</h1>
        <span className="text-sm text-slate-400">近 60 天</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {(closings ?? []).map(c => (
              <Link
                key={c.id}
                href={`/manager/history/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-slate-900">{c.business_date}</span>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusColor[c.status])}>
                      {statusLabel[c.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-slate-500">營業額 ${fmt(c.total_revenue)}</span>
                    <span className={cn('text-xs font-medium tabular-nums',
                      Math.abs(c.variance) === 0 ? 'text-green-600' :
                      Math.abs(c.variance) <= 200 ? 'text-yellow-600' : 'text-red-600'
                    )}>
                      誤差 {c.variance >= 0 ? '+' : ''}{fmt(c.variance)}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </Link>
            ))}
            {(!closings || closings.length === 0) && (
              <div className="py-12 text-center text-slate-400 text-sm">尚無紀錄</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
