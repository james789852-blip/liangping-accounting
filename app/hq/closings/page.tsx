import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { redirect } from 'next/navigation'
import ClosingsBrowser from '@/components/hq/closings-browser'
import { getMonthLastDay } from '@/lib/business-date'
import { sortStores } from '@/lib/store-order'
import { canReviewClosings } from '@/lib/user-permissions'

export const dynamic = 'force-dynamic'

function getTaipeiDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
}

export default async function ClosingsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; date?: string; storeId?: string }>
}) {
  const user = await getAuthedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canReviewClosings(profile)) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足</div>
  }

  const canReview = canReviewClosings(profile)

  const params = await searchParams
  const now = getTaipeiDate()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // 日期模式：date 優先，再 month，預設今天
  let startDate: string
  let endDate: string
  let currentDate = params.date ?? ''
  let currentMonth = params.month ?? ''

  if (currentDate) {
    startDate = currentDate
    endDate = currentDate
  } else if (currentMonth) {
    const [y, m] = currentMonth.split('-')
    startDate = `${y}-${m}-01`
    endDate = getMonthLastDay(parseInt(y), parseInt(m))
  } else {
    // 預設：今天
    startDate = todayStr
    endDate = todayStr
    currentDate = todayStr
  }

  const admin = createAdminClient()

  const { data: storesRaw } = await admin
    .from('stores').select('id, name, type').eq('active', true).neq('type', '央廚')
  const stores = sortStores(storesRaw ?? [])

  let query = admin
    .from('daily_closings')
    .select(`
      id, business_date, status, note, dispute_note, submitted_by,
      total_revenue, total_cost, total_expenses, expected_remit, variance,
      actual_remit, should_include_delivery, remittance_adjustments, reserve_items,
      ck_delivery_photo_url, channel_photo_urls,
      envelope_photo_url, void_invoice_photo_urls, note_photo_url, extra_photo_urls,
      stores(id, name),
      revenue_items(channel, account_name, gross_amount),
      order_items(item_name, quantity, unit_price, total_amount),
      handwrite_orders(order_number, amount, voided, void_reason),
      expense_items(description, amount)
    `)
    .gte('business_date', startDate)
    .lte('business_date', endDate)
    .order('business_date', { ascending: false })

  if (params.storeId) query = query.eq('store_id', params.storeId)

  const { data: closings } = await query

  // 提交者名稱
  const submitterIds = [...new Set((closings ?? []).map((c: any) => c.submitted_by).filter(Boolean))]
  const submitterNames: Record<string, string> = {}
  if (submitterIds.length > 0) {
    const { data: profiles } = await admin
      .from('user_profiles').select('user_id, name').in('user_id', submitterIds)
    profiles?.forEach((p: any) => { if (p.name) submitterNames[p.user_id] = p.name })
  }

  // 收據與菜單影片：一次撈完，JS 端 group by (store_id, business_date)
  // 避免每筆 closing 都各發一次 query（10 店 × 30 天 = 600+ roundtrip）
  const receiptsByClosing: Record<string, any[]> = {}
  if (closings && closings.length > 0) {
    const storeIds = [...new Set(closings.map((c: any) => (c.stores as any)?.id).filter(Boolean))]
    const dates = [...new Set(closings.map((c: any) => c.business_date as string))]
    if (storeIds.length > 0 && dates.length > 0) {
      const { data: receiptsBulk } = await admin.from('receipts')
        .select('id, store_id, business_date, vendor_name, receipt_type, total_amount, photo_url, receipt_items(item_name, quantity, unit, unit_price, amount), created_at')
        .in('store_id', storeIds).in('business_date', dates)
        .order('created_at')

      const recKey = (sId: string, d: string) => `${sId}|${d}`
      const recMap: Record<string, any[]> = {}
      for (const r of (receiptsBulk ?? []) as any[]) {
        const k = recKey(r.store_id, r.business_date)
        if (!recMap[k]) recMap[k] = []
        recMap[k].push(r)
      }
      for (const c of closings) {
        const sId = (c.stores as any)?.id
        if (!sId) { receiptsByClosing[c.id] = []; continue }
        receiptsByClosing[c.id] = recMap[recKey(sId, c.business_date)] ?? []
      }
    }
  }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>總公司</p>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>店面帳目</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>查看店面帳目數字、所有照片與影片，並進行審核</p>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-5 pb-28">
        <ClosingsBrowser
          closings={(closings ?? []) as any[]}
          receiptsByClosing={receiptsByClosing}
          stores={stores}
          currentDate={currentDate}
          currentMonth={currentMonth}
          todayStr={todayStr}
          storeId={params.storeId ?? ''}
          canReview={canReview}
          submitterNames={submitterNames}
        />
      </div>
    </div>
  )
}
