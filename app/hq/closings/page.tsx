import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClosingsBrowser from '@/components/hq/closings-browser'
import { getMonthLastDay } from '@/lib/business-date'
import { sortStores } from '@/lib/store-order'

export const dynamic = 'force-dynamic'

function getTaipeiDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
}

export default async function ClosingsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; date?: string; storeId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile || !profile.is_hq) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足</div>
  }

  const canReview = ['經理', '總監', '老闆'].includes(profile.role ?? '')

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
      actual_remit, should_include_delivery, remittance_adjustments,
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
  const videosByClosing: Record<string, any> = {}
  if (closings && closings.length > 0) {
    const storeIds = [...new Set(closings.map((c: any) => (c.stores as any)?.id).filter(Boolean))]
    const dates = [...new Set(closings.map((c: any) => c.business_date as string))]
    if (storeIds.length > 0 && dates.length > 0) {
      const [receiptsBulk, videosBulk] = await Promise.all([
        admin.from('receipts')
          .select('id, store_id, business_date, vendor_name, receipt_type, total_amount, photo_url, receipt_items(item_name, quantity, unit, unit_price, amount), created_at')
          .in('store_id', storeIds).in('business_date', dates)
          .order('created_at'),
        admin.from('menu_videos')
          .select('id, store_id, business_date, file_path, file_name')
          .in('store_id', storeIds).in('business_date', dates)
          .then(r => r, () => ({ data: [] as any[] })),
      ])

      // group receipts by (store_id|date) → receiptsByClosing[closing.id]
      const recKey = (sId: string, d: string) => `${sId}|${d}`
      const recMap: Record<string, any[]> = {}
      for (const r of (receiptsBulk.data ?? []) as any[]) {
        const k = recKey(r.store_id, r.business_date)
        if (!recMap[k]) recMap[k] = []
        recMap[k].push(r)
      }
      for (const c of closings) {
        const sId = (c.stores as any)?.id
        if (!sId) { receiptsByClosing[c.id] = []; continue }
        receiptsByClosing[c.id] = recMap[recKey(sId, c.business_date)] ?? []
      }

      // group videos + 批次 signed URL
      const vidMap: Record<string, any> = {}
      const videos = ((videosBulk as any)?.data ?? []) as any[]
      const signedResults = await Promise.all(
        videos.map(v =>
          admin.storage.from('menu-videos').createSignedUrl(v.file_path, 3600)
            .then(r => ({ v, signedUrl: r.data?.signedUrl }))
            .catch(() => ({ v, signedUrl: null }))
        )
      )
      for (const { v, signedUrl } of signedResults) {
        if (!signedUrl) continue
        vidMap[recKey(v.store_id, v.business_date)] = { closing_id: '', signed_url: signedUrl, file_name: v.file_name }
      }
      for (const c of closings) {
        const sId = (c.stores as any)?.id
        if (!sId) continue
        const entry = vidMap[recKey(sId, c.business_date)]
        if (entry) videosByClosing[c.id] = { ...entry, closing_id: c.id }
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
          videosByClosing={videosByClosing}
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
