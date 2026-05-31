import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClosingsBrowser from '@/components/hq/closings-browser'

export const dynamic = 'force-dynamic'

export default async function ClosingsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; storeId?: string }>
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
  const now = new Date()
  const month = params.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [y, m] = month.split('-')
  const startDate = `${y}-${m}-01`
  const endDate = new Date(parseInt(y), parseInt(m), 0).toISOString().slice(0, 10)

  const admin = createAdminClient()

  const { data: stores } = await admin
    .from('stores').select('id, name').eq('active', true).order('name')

  let query = admin
    .from('daily_closings')
    .select(`
      id, business_date, status, note, dispute_note,
      total_revenue, total_cost, total_expenses, expected_remit, variance,
      ck_delivery_photo_url, channel_photo_urls,
      stores(id, name),
      revenue_items(channel, account_name, gross_amount),
      order_items(item_name, quantity, unit_price, total_amount),
      handwrite_orders(order_number, amount, voided, void_reason)
    `)
    .gte('business_date', startDate)
    .lte('business_date', endDate)
    .order('business_date', { ascending: false })

  if (params.storeId) query = query.eq('store_id', params.storeId)

  const { data: closings } = await query

  // 收據照片
  const receiptsByClosing: Record<string, any[]> = {}
  if (closings && closings.length > 0) {
    await Promise.all(
      closings.map(async (c) => {
        const store = c.stores as any
        if (!store?.id) return
        const { data: receipts } = await admin
          .from('receipts')
          .select('id, vendor_name, total_amount, photo_url')
          .eq('store_id', store.id)
          .eq('business_date', c.business_date)
          .not('photo_url', 'is', null)
          .order('created_at')
        receiptsByClosing[c.id] = receipts ?? []
      })
    )
  }

  // 菜單影片（signed URL）
  const videosByClosing: Record<string, any> = {}
  if (closings && closings.length > 0) {
    await Promise.all(
      closings.map(async (c) => {
        const store = c.stores as any
        if (!store?.id) return
        try {
          const { data: mv } = await admin
            .from('menu_videos')
            .select('id, file_path, file_name')
            .eq('store_id', store.id)
            .eq('business_date', c.business_date)
            .maybeSingle()
          if (mv) {
            const { data: signed } = await admin.storage
              .from('menu-videos')
              .createSignedUrl(mv.file_path, 3600)
            if (signed?.signedUrl) {
              videosByClosing[c.id] = { closing_id: c.id, signed_url: signed.signedUrl, file_name: mv.file_name }
            }
          }
        } catch { /* menu_videos table may not exist */ }
      })
    )
  }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>總公司</p>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>帳目瀏覽 · 審核</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>查看帳目數字、所有照片與影片，並進行審核</p>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-5 pb-28">
        <ClosingsBrowser
          closings={(closings ?? []) as any[]}
          receiptsByClosing={receiptsByClosing}
          videosByClosing={videosByClosing}
          stores={stores ?? []}
          month={month}
          storeId={params.storeId ?? ''}
          canReview={canReview}
        />
      </div>
    </div>
  )
}
