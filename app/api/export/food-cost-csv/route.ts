/**
 * CSV 匯出食耗成本 — 給會計軟體 / Google Sheets 讀取用
 *   GET /api/export/food-cost-csv?storeId=...&year=YYYY&month=M
 */
import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMonthlyStats } from '@/lib/store-aggregator'

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
  const user = await getVerifiedUser()
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
  const storeName = storeRow?.name ?? 'export'

  const monthly = await getMonthlyStats(storeId, year, monthNum)

  const lines: string[] = []
  // Section 1: 每日主要欄位
  lines.push('== 每日主要 ==')
  lines.push([
    '日期', '星期', '狀態',
    'POS', 'TWPAY', 'Panda', 'Online', 'Online 現金',
    '現場', '實際', '配送', '結果', '扣除後', '營業額',
    '食材', '耗材', '雜項', '總成本',
    '總發票', '總收據', '估價單', '梁平退稅',
  ].map(csvEscape).join(','))
  for (const d of monthly.daily) {
    lines.push([
      d.date, d.weekday, d.closingStatus,
      d.pos, d.twpay, d.panda, d.online, d.online_cash,
      d.onsite, d.actual, d.ck, d.variance, d.after_deduct, d.revenue,
      d.food, d.pack, d.misc, d.totalCost,
      d.invoiceTotal, d.receiptTotal, d.estimateTotal, d.taxRefund,
    ].map(csvEscape).join(','))
  }
  // 月合計 row
  lines.push([
    '月合計', '', '',
    monthly.totals.pos, monthly.totals.twpay, monthly.totals.panda, monthly.totals.online, monthly.totals.online_cash,
    monthly.totals.onsite, monthly.totals.actual, monthly.totals.ck, monthly.totals.variance, monthly.totals.after_deduct, monthly.totals.revenue,
    monthly.totals.food, monthly.totals.pack, monthly.totals.misc, monthly.totals.totalCost,
    monthly.totalInvoice, monthly.totalReceipt, monthly.totals.estimateTotal, monthly.liangpingRefund,
  ].map(csvEscape).join(','))

  lines.push('')

  // Section 2: 品項月合計
  lines.push('== 品項月合計 ==')
  lines.push(['廠商群組', '單據類型', '品項', '分類', '金額'].map(csvEscape).join(','))
  for (const row of monthly.itemMonthlyTotals) {
    lines.push([row.vendor_group, row.doc_type, row.item_name, row.category, row.total].map(csvEscape).join(','))
  }

  // 在 CSV 前加 BOM 讓 Excel 開啟時正確辨識 UTF-8
  const body = '﻿' + lines.join('\r\n')
  const filename = encodeURIComponent(`${storeName}_${year}年${monthNum}月_食耗成本.csv`)

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
    },
  })
}
