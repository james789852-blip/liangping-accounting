import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Banknote, Package, Calculator, BarChart3, AlertTriangle, ArrowLeft, Video, Camera, PiggyBank } from 'lucide-react'
import Link from 'next/link'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import DeleteDraftButton from '@/components/manager/delete-draft-button'
import HandwriteOrdersList from '@/components/manager/handwrite-orders-list'
import ReceiptPhotoViewer from '@/components/manager/receipt-photo-viewer'
import PhotoGrid from '@/components/manager/photo-grid'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

const statusMap: Record<string, { label: string; color: string }> = {
  draft:     { label: '草稿',    color: 'bg-slate-100 text-slate-600' },
  submitted: { label: '已送出',  color: 'bg-blue-100 text-blue-700' },
  verified:  { label: '已核准',  color: 'bg-green-100 text-green-700' },
  disputed:  { label: '退回修改', color: 'bg-orange-100 text-orange-700' },
}

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, store_ids').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) return <div className="p-6 text-slate-500">尚未指派店家</div>

  const { data: closing } = await supabase
    .from('daily_closings')
    .select('*, revenue_items(*), order_items(*), expense_items(*), handwrite_orders(*), stores(name, petty_cash)')
    .eq('id', id)
    .eq('store_id', storeId)
    .single()

  if (!closing) return <div className="p-6 text-slate-500">找不到此帳目</div>

  const admin = createAdminClient()
  const { data: cashCounts } = await admin.from('cash_counts').select('*').eq('closing_id', closing.id)
  ;(closing as any).cash_counts = cashCounts ?? []

  const { data: receipts } = await admin
    .from('receipts')
    .select('id, vendor_name, total_amount, receipt_type, photo_url, tax_amount, receipt_items(item_name, amount)')
    .eq('store_id', storeId)
    .eq('business_date', closing.business_date)
    .order('created_at')

  // 菜單影片
  let videoUrl: string | null = null
  let videoName: string | null = null
  try {
    const { data: mv } = await supabase
      .from('menu_videos')
      .select('id, file_path, file_name')
      .eq('store_id', storeId)
      .eq('business_date', closing.business_date)
      .maybeSingle()
    if (mv) {
      const { data: signed } = await supabase.storage.from('menu-videos').createSignedUrl(mv.file_path, 3600)
      videoUrl = signed?.signedUrl ?? null
      videoName = mv.file_name
    }
  } catch { /* menu_videos table may not exist yet */ }

  const store = closing.stores as any
  const rev = closing.revenue_items ?? []
  const cash = closing.cash_counts?.[0]
  const orders = closing.order_items ?? []
  const expenseItems = closing.expense_items ?? []
  const handwriteOrders = closing.handwrite_orders ?? []
  const st = statusMap[closing.status] ?? statusMap.draft

  const varColor = Math.abs(closing.variance) === 0 ? 'text-green-600' :
    Math.abs(closing.variance) <= 200 ? 'text-yellow-600' : 'text-red-600'
  const varBg = Math.abs(closing.variance) === 0 ? 'bg-green-50 border-green-300' :
    Math.abs(closing.variance) <= 200 ? 'bg-yellow-50 border-yellow-300' : 'bg-red-50 border-red-300'

  const channelLabel: Record<string, string> = {
    pos: 'POS 現金', uber: 'Uber Eats', panda: '熊貓',
    twpay: '台灣Pay', online: '線上點餐', handwrite: '手寫訂單',
  }
  function channelPhotoLabel(key: string) {
    if (key.startsWith('uber_')) return `Uber Eats（${key.slice(5)}）`
    return channelLabel[key] ?? key
  }
  const channelPhotoEntries = Object.entries((closing.channel_photo_urls as Record<string, string> | null) ?? {}).filter(([, v]) => !!v)
  const platformTotal = rev
    .filter((r: any) => ['uber','panda','twpay','online'].includes(r.channel))
    .reduce((s: number, r: any) => s + r.gross_amount, 0)

  return (
    <div className="max-w-xl mx-auto px-4 py-4 space-y-4 pb-8">
      <Link href="/manager/history" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> 歷史紀錄
      </Link>

      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{closing.business_date}</h1>
          <p className="text-sm text-slate-500">{store?.name}</p>
        </div>
        <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', st.color)}>
          {st.label}
        </span>
      </div>

      {/* 退回提示 */}
      {closing.status === 'disputed' && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
            <p className="text-sm font-semibold text-orange-700">總公司已退回，請修正後重新送出</p>
          </div>
          {closing.dispute_note && (
            <p className="text-sm text-orange-600">{closing.dispute_note}</p>
          )}
          <Link
            href={`/manager/edit/${closing.id}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors"
          >
            前往修改此帳目
          </Link>
        </div>
      )}

      {/* 操作時間 */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500 space-y-1">
        <div className="flex justify-between">
          <span>建立時間</span>
          <span className="tabular-nums font-medium text-slate-700">{fmtTs(closing.created_at)}</span>
        </div>
        {closing.updated_at && closing.updated_at !== closing.created_at && (
          <div className="flex justify-between">
            <span>最後儲存</span>
            <span className="tabular-nums font-medium text-slate-700">{fmtTs(closing.updated_at)}</span>
          </div>
        )}
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
               Math.abs(closing.variance) <= 200 ? '差距微小' : '差距過大'}
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

      {/* 匯款調整 */}
      {(() => {
        const adjustments = (closing.remittance_adjustments as any[]) ?? []
        if (adjustments.length === 0) return null
        const adjTypeMap: Record<string, { label: string; color: string }> = {
          advance:           { label: '代墊補款', color: '#059669' },
          reimburse:         { label: '代墊還款', color: '#d97706' },
          customer_transfer: { label: '顧客轉帳', color: '#2563eb' },
          carryover:         { label: '昨日結轉', color: '#7c3aed' },
          other:             { label: '其他',     color: '#71717a' },
        }
        const adjustmentTotal = adjustments.reduce((sum: number, a: any) => sum + (a.amount ?? 0), 0)
        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
                <Banknote className="h-4 w-4 text-indigo-500" /> 匯款調整
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {adjustments.map((adj: any, i: number) => {
                const meta = adjTypeMap[adj.type] ?? adjTypeMap.other
                return (
                  <div key={adj.id ?? i} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md shrink-0" style={{ background: meta.color + '18', color: meta.color }}>{meta.label}</span>
                      <span className="text-slate-600 truncate">{adj.label || meta.label}{adj.person ? `（${adj.person}）` : ''}</span>
                    </div>
                    <span className="tabular-nums font-medium ml-2 shrink-0" style={{ color: adj.amount >= 0 ? '#059669' : '#dc2626' }}>
                      {adj.amount >= 0 ? '+' : ''}{fmt(adj.amount)}
                    </span>
                  </div>
                )
              })}
              <Separator />
              <div className="flex justify-between text-sm font-semibold">
                <span>調整後實匯入</span>
                <span className="tabular-nums">${fmt((closing.actual_remit ?? 0) + adjustmentTotal)}</span>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* 預留款 */}
      {(() => {
        const reserves = (closing.reserve_items as any[]) ?? []
        if (reserves.length === 0) return null
        const adjustments = (closing.remittance_adjustments as any[]) ?? []
        const adjustmentTotal = adjustments.reduce((sum: number, a: any) => sum + (a.amount ?? 0), 0)
        const totalReserved = reserves.reduce((sum: number, r: any) => sum + (r.amount ?? 0), 0)
        const remitToHQ = (closing.actual_remit ?? 0) + adjustmentTotal - totalReserved
        return (
          <Card style={{ border: '1px solid #fed7aa' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2" style={{ color: '#ea580c' }}>
                <PiggyBank className="h-4 w-4" /> 預留款
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {reserves.map((r: any, i: number) => (
                <div key={r.id ?? i} className="flex justify-between items-center text-sm">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: '#fff7ed', color: '#ea580c' }}>{r.reason}</span>
                  <span className="tabular-nums font-medium" style={{ color: '#ea580c' }}>−{fmt(r.amount)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between text-sm font-semibold">
                <span>今日實際匯入</span>
                <span className="tabular-nums" style={{ color: remitToHQ < 0 ? '#dc2626' : '#18181b' }}>${fmt(remitToHQ)}</span>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* 營收明細 */}
      {rev.filter((r: any) => r.channel !== 'handwrite').length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <Banknote className="h-4 w-4 text-blue-500" /> 營收明細
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rev.filter((r: any) => r.channel !== 'handwrite').map((r: any) => (
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
      )}

      {/* 平台營業額存證照片 */}
      {channelPhotoEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <Camera className="h-4 w-4 text-blue-500" /> 營業額存證照片
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoGrid photos={channelPhotoEntries.map(([key, url]) => ({ label: channelPhotoLabel(key), url }))} />
          </CardContent>
        </Card>
      )}

      {/* 手寫訂單 */}
      {handwriteOrders.length > 0 && (
        <HandwriteOrdersList orders={handwriteOrders} />
      )}

      {/* 菜單影片 */}
      {videoUrl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <Video className="h-4 w-4 text-blue-500" /> 今日菜單影片
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <video src={videoUrl} controls playsInline className="w-full rounded-lg bg-black" style={{ maxHeight: '220px' }} />
            {videoName && <p className="text-xs text-slate-400">{videoName}</p>}
          </CardContent>
        </Card>
      )}

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

      {/* 央廚配送照片 */}
      {closing.ck_delivery_photo_url && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <Camera className="h-4 w-4 text-orange-500" /> 配送單照片
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoGrid photos={[{ label: '配送單', url: closing.ck_delivery_photo_url }]} />
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

      {/* 今日收據 */}
      {receipts && receipts.length > 0 && (
        <ReceiptPhotoViewer receipts={receipts as any} />
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
            <div className="grid grid-cols-[3rem_1fr_1fr_3.5rem] gap-x-2 text-[10px] text-slate-400">
              <span />
              <span className="text-center">張 / 枚</span>
              <span className="text-center">整筆金額</span>
              <span className="text-right">小計</span>
            </div>
            {([
              { label: '千元鈔', ck: 'bills_1000', lk: 'lump_1000', unit: 1000, ul: '張' },
              { label: '五百元', ck: 'bills_500',  lk: 'lump_500',  unit: 500,  ul: '張' },
              { label: '百元鈔', ck: 'bills_100',  lk: 'lump_100',  unit: 100,  ul: '張' },
              { label: '五十元', ck: 'coins_50',   lk: 'lump_50',   unit: 50,   ul: '枚' },
              { label: '十元',   ck: 'coins_10',   lk: 'lump_10',   unit: 10,   ul: '枚' },
              { label: '五元',   ck: 'coins_5',    lk: 'lump_5',    unit: 5,    ul: '枚' },
              { label: '一元',   ck: 'coins_1',    lk: 'lump_1',    unit: 1,    ul: '枚' },
            ]).map(({ label, ck, lk, unit, ul }) => {
              const count = (cash as any)[ck] ?? 0
              const lump  = (cash as any)[lk] ?? 0
              const sub   = count * unit + lump
              if (sub === 0) return null
              return (
                <div key={label} className="grid grid-cols-[3rem_1fr_1fr_3.5rem] gap-x-2 items-baseline text-slate-600">
                  <span className="text-xs">{label}</span>
                  <span className="text-xs text-center">{count > 0 ? `${count} ${ul}` : '—'}</span>
                  <span className="text-xs text-center tabular-nums">{lump > 0 ? `$${fmt(lump)}` : '—'}</span>
                  <span className="text-xs text-right tabular-nums font-medium">${fmt(sub)}</span>
                </div>
              )
            })}
            <Separator />
            <div className="flex justify-between font-medium">
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

      {/* 計算明細 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
            <BarChart3 className="h-4 w-4" /> 計算明細
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>總營業額</span><span className="tabular-nums">${fmt(closing.total_revenue)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>− 平台收款</span><span className="tabular-nums">−${fmt(platformTotal)}</span>
          </div>
          {(closing.total_expenses ?? 0) > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>− 現金支出</span><span className="tabular-nums">−${fmt(closing.total_expenses)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>應包進信封</span><span className="tabular-nums">${fmt(closing.should_include_delivery)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500 pl-2">
            <span>其中央廚費</span><span className="tabular-nums">${fmt(closing.total_cost)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500 pl-2">
            <span>應匯入 HQ（淨）</span>
            <span className="tabular-nums font-medium text-slate-700">${fmt(closing.expected_remit ?? 0)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-medium">
            <span>實際包進信封（現金 − 零用金）</span>
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

      {closing.status === 'draft' && (
        <div className="space-y-2">
          <Link
            href={`/manager/edit/${closing.id}`}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}
          >
            繼續編輯此草稿
          </Link>
          <DeleteDraftButton closingId={closing.id} />
        </div>
      )}
    </div>
  )
}
