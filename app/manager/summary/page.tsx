import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Clock, Banknote, Package, Calculator, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import { getEffectiveStoreId } from '@/lib/get-effective-store'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

const statusMap: Record<string, { label: string; color: string }> = {
  draft:     { label: '草稿', color: 'bg-slate-100 text-slate-600' },
  submitted: { label: '已送出', color: 'bg-blue-100 text-blue-700' },
  verified:  { label: '已審核', color: 'bg-green-100 text-green-700' },
  disputed:  { label: '異議中', color: 'bg-red-100 text-red-700' },
}

export default async function SummaryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, store_ids').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) return <div className="p-6 text-slate-500">尚未指派店家</div>

  const today = format(new Date(), 'yyyy-MM-dd')

  const [{ data: closing }, { data: store }] = await Promise.all([
    supabase.from('daily_closings')
      .select('*, revenue_items(*), cash_counts(*), order_items(*), expense_items(*)')
      .eq('store_id', storeId).eq('business_date', today).maybeSingle(),
    supabase.from('stores').select('name, petty_cash').eq('id', storeId).single(),
  ])

  if (!closing) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center space-y-4">
        <Clock className="h-12 w-12 text-slate-300 mx-auto" />
        <h1 className="text-lg font-bold text-slate-700">今日尚未結帳</h1>
        <p className="text-slate-400 text-sm">請先完成今日結帳再查看結算結果</p>
        <Link href="/manager/closing"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          前往每日結帳
        </Link>
      </div>
    )
  }

  const rev = closing.revenue_items ?? []
  const cash = closing.cash_counts?.[0]
  const orders = closing.order_items ?? []
  const expenseItems = closing.expense_items ?? []
  const st = statusMap[closing.status] ?? statusMap.draft

  const varColor = Math.abs(closing.variance) === 0 ? 'text-green-600' :
    Math.abs(closing.variance) <= 200 ? 'text-yellow-600' : 'text-red-600'
  const varBg = Math.abs(closing.variance) === 0 ? 'bg-green-50 border-green-300' :
    Math.abs(closing.variance) <= 200 ? 'bg-yellow-50 border-yellow-300' : 'bg-red-50 border-red-300'

  const channelLabel: Record<string, string> = {
    pos: 'POS 現金', uber: 'Uber Eats', panda: '熊貓',
    twpay: '台灣Pay', online: '線上點餐', handwrite: '手寫訂單',
  }

  const platformTotal = rev
    .filter((r: any) => ['uber','panda','twpay','online'].includes(r.channel))
    .reduce((s: number, r: any) => s + r.gross_amount, 0)

  return (
    <div className="max-w-xl mx-auto px-4 py-4 space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">結算結果</h1>
          <p className="text-sm text-slate-500">{store?.name} · {closing.business_date}</p>
        </div>
        <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', st.color)}>
          {st.label}
        </span>
      </div>

      {/* 誤差摘要 */}
      <Card className={cn('border-2', varBg)}>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600">今日誤差</p>
            <p className={cn('text-4xl font-bold tabular-nums mt-1', varColor)}>
              {closing.variance >= 0 ? '+' : ''}{fmt(closing.variance)}
            </p>
            <p className={cn('text-xs mt-1', varColor)}>
              {Math.abs(closing.variance) === 0 ? '金額完全正確' :
               Math.abs(closing.variance) <= 200 ? '差距微小' : '差距過大，請核查'}
            </p>
          </div>
          <div className="text-right space-y-2">
            <div>
              <p className="text-xs text-slate-400">總營業額</p>
              <p className="text-xl font-bold tabular-nums">${fmt(closing.total_revenue)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">應包進信封</p>
              <p className="text-base font-semibold tabular-nums">${fmt(closing.should_include_delivery)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 營收明細 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
            <Banknote className="h-4 w-4 text-blue-500" /> 營收明細
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rev.map((r: any) => (
            <div key={r.id} className="flex justify-between text-sm">
              <span className="text-slate-600">
                {channelLabel[r.channel] ?? r.channel}
                {r.account_name ? `（${r.account_name}）` : ''}
              </span>
              <span className="tabular-nums font-medium">${fmt(r.gross_amount)}</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between font-semibold text-sm">
            <span>總計</span>
            <span className="tabular-nums">${fmt(closing.total_revenue)}</span>
          </div>
        </CardContent>
      </Card>

      {/* 央廚配送 */}
      {orders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <Package className="h-4 w-4 text-orange-500" /> 央廚配送
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {orders.map((o: any) => (
              <div key={o.id} className="flex justify-between text-sm">
                <span className="text-slate-600">{o.item_name} × {o.quantity}</span>
                <span className="tabular-nums">${fmt(o.total_amount)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between font-semibold text-sm">
              <span>配送費合計</span>
              <span className="tabular-nums">${fmt(closing.total_cost)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 現金清點 */}
      {cash && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <Calculator className="h-4 w-4 text-green-500" /> 現金清點
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {([
              ['千元鈔', cash.bills_1000, 1000],
              ['五百元', cash.bills_500, 500],
              ['百元鈔', cash.bills_100, 100],
              ['五十元', cash.coins_50, 50],
              ['十元', cash.coins_10, 10],
              ['五元', cash.coins_5, 5],
              ['一元', cash.coins_1, 1],
            ] as [string, number, number][]).filter(([, c]) => c > 0).map(([label, count, unit]) => (
              <div key={label} className="flex justify-between text-slate-600">
                <span>{label} × {count}</span>
                <span className="tabular-nums">${fmt(count * unit)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between font-medium text-sm">
              <span>現金總額</span>
              <span className="tabular-nums">${fmt(cash.cash_total)}</span>
            </div>
            <div className="flex justify-between text-slate-400 text-xs">
              <span>扣零用金（${fmt(store?.petty_cash ?? 0)}）</span>
              <span className="tabular-nums">${fmt(closing.actual_remit)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 當日現金支出 */}
      {expenseItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <Banknote className="h-4 w-4 text-purple-500" /> 當日現金支出
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {expenseItems.map((e: any) => (
              <div key={e.id} className="flex justify-between text-sm">
                <span className="text-slate-600">{e.description}</span>
                <span className="tabular-nums">${fmt(e.amount)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between font-semibold text-sm">
              <span>支出合計</span>
              <span className="tabular-nums text-purple-700">${fmt(closing.total_expenses ?? 0)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 計算說明 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
            <BarChart3 className="h-4 w-4" /> 計算明細
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>總營業額</span>
            <span className="tabular-nums">${fmt(closing.total_revenue)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>− 平台收款</span>
            <span className="tabular-nums">−${fmt(platformTotal)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>− 央廚配送費</span>
            <span className="tabular-nums">−${fmt(closing.total_cost)}</span>
          </div>
          {(closing.total_expenses ?? 0) > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>− 當日現金支出</span>
              <span className="tabular-nums">−${fmt(closing.total_expenses)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-medium">
            <span>應包進信封</span>
            <span className="tabular-nums">${fmt(closing.should_include_delivery)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>實際可匯入</span>
            <span className="tabular-nums">${fmt(closing.actual_remit)}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center font-bold">
            <span>誤差</span>
            <span className={cn('text-lg tabular-nums', varColor)}>
              {closing.variance >= 0 ? '+' : ''}{fmt(closing.variance)}
            </span>
          </div>
        </CardContent>
      </Card>

      {closing.note && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400 mb-1">備註</p>
            <p className="text-sm text-slate-700">{closing.note}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Link href="/manager/closing"
          className="flex-1 text-center py-3 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          {closing.status === 'draft' ? '繼續填寫' : '查看結帳'}
        </Link>
        <Link href="/manager/history"
          className="flex-1 text-center py-3 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          歷史紀錄
        </Link>
      </div>
    </div>
  )
}
