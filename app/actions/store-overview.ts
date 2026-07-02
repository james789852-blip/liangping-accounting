'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRangeStats, getMonthlyStats, type DailyStats, type MonthlyStats } from '@/lib/store-aggregator'

async function checkHqAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '無權限' as const }
  return { ok: true as const }
}

export async function fetchDailyStats(storeId: string, date: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!storeId || !date) return { error: '缺少參數' as const }

  // 同時撈昨日，讓 UI 顯示 delta
  const yesterday = new Date(date + 'T12:00:00+08:00')
  yesterday.setDate(yesterday.getDate() - 1)
  const yStr = yesterday.toISOString().slice(0, 10)

  const { days } = await getRangeStats(storeId, yStr, date)
  const prev = days.find(d => d.date === yStr) ?? null
  const cur = days.find(d => d.date === date) ?? null
  return { success: true as const, stats: cur as DailyStats | null, prev: prev as DailyStats | null }
}

/** 撈當日 closing + receipts（給店家總覽 daily panel 內嵌審核卡用） */
export async function fetchDailyClosingWithReceipts(storeId: string, date: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!storeId || !date) return { error: '缺少參數' as const }

  const admin = createAdminClient()
  const { data: closings } = await admin
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
    .eq('store_id', storeId)
    .eq('business_date', date)

  const closing = closings?.[0] ?? null
  let receipts: any[] = []
  let submitterName: string | null = null
  if (closing) {
    const { data: recs } = await admin.from('receipts')
      .select('id, vendor_name, receipt_type, total_amount, photo_url, receipt_items(item_name, quantity, unit, unit_price, amount), created_at')
      .eq('store_id', storeId).eq('business_date', date)
      .order('created_at')
    receipts = recs ?? []
    if (closing.submitted_by) {
      const { data: prof } = await admin.from('user_profiles').select('name').eq('user_id', closing.submitted_by).maybeSingle()
      submitterName = prof?.name ?? null
    }
  }
  return { success: true as const, closing, receipts, submitterName }
}

export async function fetchMonthlyStats(storeId: string, year: number, monthNum: number) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!storeId || !year || !monthNum) return { error: '缺少參數' as const }

  // 同時撈上月，讓 UI 顯示 delta
  const prevYear = monthNum === 1 ? year - 1 : year
  const prevMonth = monthNum === 1 ? 12 : monthNum - 1
  const [stats, prev] = await Promise.all([
    getMonthlyStats(storeId, year, monthNum),
    getMonthlyStats(storeId, prevYear, prevMonth),
  ])
  return { success: true as const, stats: stats as MonthlyStats, prev: prev as MonthlyStats }
}
