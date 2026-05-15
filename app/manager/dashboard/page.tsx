import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { ClipboardList, CheckCircle2, Clock, AlertTriangle, ChevronRight, History } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

function fmt(n: number) {
  return Math.round(n).toLocaleString('zh-TW')
}

export default async function ManagerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('name, role, store_ids')
    .eq('user_id', user.id)
    .single()

  const storeId = profile?.store_ids?.[0]
  const today = format(new Date(), 'yyyy-MM-dd')
  const todayLabel = format(new Date(), 'M 月 d 日（EEEE）', { locale: zhTW })

  let store = null
  let todayClosing = null
  let recentClosings: any[] = []

  if (storeId) {
    const [storeRes, closingRes, recentRes] = await Promise.all([
      supabase.from('stores').select('name, petty_cash').eq('id', storeId).single(),
      supabase.from('daily_closings')
        .select('id, status, total_revenue, variance, submitted_at')
        .eq('store_id', storeId).eq('business_date', today).maybeSingle(),
      supabase.from('daily_closings')
        .select('id, business_date, status, total_revenue, variance')
        .eq('store_id', storeId)
        .order('business_date', { ascending: false })
        .limit(5),
    ])
    store = storeRes.data
    todayClosing = closingRes.data
    recentClosings = recentRes.data ?? []
  }

  const statusInfo = !todayClosing
    ? { icon: Clock, color: 'text-slate-400', bg: 'bg-slate-50 border-slate-200', label: '尚未結帳', desc: '今日結帳尚未開始' }
    : todayClosing.status === 'draft'
    ? { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50 border-yellow-200', label: '草稿中', desc: '已存草稿，尚未送出' }
    : todayClosing.status === 'submitted'
    ? { icon: CheckCircle2, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-200', label: '已送出', desc: '等待總公司審核' }
    : todayClosing.status === 'verified'
    ? { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50 border-green-200', label: '已審核', desc: '今日結帳完成' }
    : { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 border-red-200', label: '異議中', desc: '請聯絡總公司' }

  const StatusIcon = statusInfo.icon

  const varColor = !todayClosing ? '' :
    Math.abs(todayClosing.variance) === 0 ? 'text-green-600' :
    Math.abs(todayClosing.variance) <= 200 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      {/* 歡迎 */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          {profile?.name ? `早安，${profile.name}` : '今日狀態'}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {store?.name} · {todayLabel}
        </p>
      </div>

      {/* 今日結帳狀態卡 */}
      <Card className={cn('border-2', statusInfo.bg)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <StatusIcon className={cn('h-8 w-8', statusInfo.color)} />
              <div>
                <p className="font-bold text-slate-900">{statusInfo.label}</p>
                <p className="text-sm text-slate-500">{statusInfo.desc}</p>
              </div>
            </div>
            {todayClosing && (
              <div className="text-right">
                <p className="text-xs text-slate-400">營業額</p>
                <p className="font-bold tabular-nums">${fmt(todayClosing.total_revenue)}</p>
              </div>
            )}
          </div>

          {todayClosing && (
            <div className="mt-3 pt-3 border-t border-current/10 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">誤差</p>
                <p className={cn('text-lg font-bold tabular-nums', varColor)}>
                  {todayClosing.variance >= 0 ? '+' : ''}{fmt(todayClosing.variance)} 元
                </p>
              </div>
              <Link
                href={`/manager/summary`}
                className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                查看明細 <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 主要行動按鈕 */}
      <Link href="/manager/closing">
        <div className="flex items-center gap-4 p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">
          <ClipboardList className="h-6 w-6 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">
              {!todayClosing ? '開始今日結帳' :
               todayClosing.status === 'draft' ? '繼續填寫結帳' : '查看今日結帳'}
            </p>
            <p className="text-blue-200 text-xs mt-0.5">
              {today}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-blue-300" />
        </div>
      </Link>

      {/* 近期紀錄 */}
      {recentClosings.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <History className="h-4 w-4" /> 近期紀錄
            </h2>
            <Link href="/manager/history" className="text-xs text-blue-600 hover:underline">
              全部查看
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {recentClosings.filter(c => c.business_date !== today).slice(0, 4).map(c => {
                  const vc = Math.abs(c.variance) === 0 ? 'text-green-600' :
                    Math.abs(c.variance) <= 200 ? 'text-yellow-600' : 'text-red-600'
                  const statusBadge: Record<string, string> = {
                    draft: '草稿', submitted: '已送出', verified: '已審核', disputed: '異議中'
                  }
                  return (
                    <Link key={c.id} href={`/manager/history/${c.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                      <div className="flex-1">
                        <span className="text-sm text-slate-700">{c.business_date}</span>
                        <span className="ml-2 text-xs text-slate-400">{statusBadge[c.status]}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">${fmt(c.total_revenue)}</p>
                        <p className={cn('text-xs font-medium tabular-nums', vc)}>
                          {c.variance >= 0 ? '+' : ''}{fmt(c.variance)}
                        </p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!storeId && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-700">
          您尚未被指派到任何店家，請聯絡系統管理員。
        </div>
      )}
    </div>
  )
}
