/**
 * 系統原生「食耗成本」xlsx 匯出（不依模板）
 *   單月：GET /api/export/food-cost-native?storeId=...&year=YYYY&month=M
 *   年度：GET /api/export/food-cost-native?storeId=...&year=YYYY&type=year
 */
import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildFoodCostNativeWorkbook, buildAnnualFoodCostWorkbook } from '@/lib/food-cost-native-workbook'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const user = await getVerifiedUser()
  if (!user) return new NextResponse('未登入', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq, store_ids').eq('user_id', user.id).single()

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const type = searchParams.get('type') ?? 'month'
  const year = parseInt(searchParams.get('year') ?? '')
  const monthNum = parseInt(searchParams.get('month') ?? '')
  if (!storeId || !year) return new NextResponse('缺少參數', { status: 400 })
  if (type === 'month' && !monthNum) return new NextResponse('缺少 month 參數', { status: 400 })

  // HQ / 老闆 可匯出任一店；店長只能匯出自己所屬店家
  const isHq = profile?.is_hq || profile?.role === '老闆'
  const allowedStores = (profile?.store_ids ?? []) as string[]
  if (!isHq && !allowedStores.includes(storeId)) {
    return new NextResponse('無權限', { status: 403 })
  }

  const admin = createAdminClient()
  const { data: storeRow } = await admin.from('stores').select('name').eq('id', storeId).single()
  const storeName = storeRow?.name ?? 'export'

  const wb = type === 'year'
    ? await buildAnnualFoodCostWorkbook(storeId, year)
    : await buildFoodCostNativeWorkbook(storeId, year, monthNum)
  const buffer = await wb.xlsx.writeBuffer()
  const filename = encodeURIComponent(
    type === 'year'
      ? `${storeName}_${year}年度_食耗成本.xlsx`
      : `${storeName}_${year}年${monthNum}月_食耗成本.xlsx`
  )

  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
