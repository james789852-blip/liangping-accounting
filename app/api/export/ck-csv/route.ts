/**
 * 央廚 CSV 匯出
 *   GET /api/export/ck-csv?storeId=...&year=YYYY&month=M
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCKMonthlyStats } from '@/lib/ck-aggregator'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('未登入', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq, store_ids').eq('user_id', user.id).single()

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const year = parseInt(searchParams.get('year') ?? '')
  const monthNum = parseInt(searchParams.get('month') ?? '')
  if (!storeId || !year || !monthNum) return new NextResponse('缺少參數', { status: 400 })

  const isHq = profile?.is_hq || profile?.role === '老闆'
  const allowedStores = (profile?.store_ids ?? []) as string[]
  if (!isHq && !allowedStores.includes(storeId)) {
    return new NextResponse('無權限', { status: 403 })
  }

  const admin = createAdminClient()
  const { data: storeRow } = await admin.from('stores').select('name').eq('id', storeId).single()
  const storeName = storeRow?.name ?? '央廚'

  const monthly = await getCKMonthlyStats(storeId, year, monthNum)

  const lines: string[] = []
  // Section 1: 每日主要
  lines.push('== 每日主要 ==')
  lines.push(['日期', '星期', '狀態', '成員收入', '外部收入', '總收入', '食材', '耗材', '雜項', '總支出', '淨額'].map(csvEscape).join(','))
  for (const d of monthly.daily) {
    lines.push([
      d.date, d.weekday, d.status,
      d.memberRevenue, d.externalRevenue, d.revenue,
      d.food, d.pack, d.misc, d.totalExpense, d.balance,
    ].map(csvEscape).join(','))
  }
  lines.push([
    '月合計', '', '',
    monthly.totals.memberRevenue, monthly.totals.externalRevenue, monthly.totals.revenue,
    monthly.totals.food, monthly.totals.pack, monthly.totals.misc,
    monthly.totals.totalExpense, monthly.totals.balance,
  ].map(csvEscape).join(','))

  lines.push('')

  // Section 2: 成員店家訂單月合計
  lines.push('== 成員店家訂單月合計 ==')
  lines.push(['店家', '金額'].map(csvEscape).join(','))
  for (const m of monthly.memberByStore) {
    lines.push([m.store_name, m.total].map(csvEscape).join(','))
  }

  lines.push('')

  // Section 3: 外部店家訂單月合計
  lines.push('== 外部店家訂單月合計 ==')
  lines.push(['店家名稱', '金額'].map(csvEscape).join(','))
  for (const e of monthly.externalByName) {
    lines.push([e.name, e.total].map(csvEscape).join(','))
  }

  lines.push('')

  // Section 4: 支出品項月合計（含廠商 + 單據）
  lines.push('== 支出品項月合計 ==')
  lines.push(['類別', '廠商群組', '單據類型', '品項', '金額'].map(csvEscape).join(','))
  for (const item of monthly.expenseByItem) {
    lines.push([item.category, item.vendor_group, item.doc_type, item.item_name, item.total].map(csvEscape).join(','))
  }

  lines.push('')

  // Section 5: 每日支出明細（含廠商 + 單據 + 付款人）
  lines.push('== 每日支出明細 ==')
  lines.push(['日期', '類別', '廠商群組', '單據類型', '品項', '付款人', '金額'].map(csvEscape).join(','))
  for (const d of monthly.daily) {
    for (const e of d.expenses) {
      lines.push([
        d.date, e.category, e.vendor_group ?? '', e.doc_type ?? '',
        e.item_name, e.payer_name ?? '', e.amount,
      ].map(csvEscape).join(','))
    }
  }

  const body = '﻿' + lines.join('\r\n')
  const filename = encodeURIComponent(`${storeName}_${year}年${monthNum}月_央廚食耗.csv`)

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
    },
  })
}
