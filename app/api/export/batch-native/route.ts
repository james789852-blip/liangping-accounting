import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canExportReports } from '@/lib/user-permissions'
import { buildFoodCostNativeWorkbook, buildAnnualFoodCostWorkbook } from '@/lib/food-cost-native-workbook'
import { buildCKNativeWorkbook, buildAnnualCKWorkbook } from '@/lib/ck-native-workbook'
import { makeZip } from '@/lib/simple-zip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

type ExportTarget = {
  storeId: string
  kind: 'store' | 'ck'
}

type StoreRow = {
  id: string
  name: string
  type?: string | null
  active?: boolean | null
}

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '').trim() || 'export'
}

function uniqueFileName(base: string, used: Set<string>) {
  let name = base
  let i = 2
  while (used.has(name)) {
    name = base.replace(/\.xlsx$/i, `-${i}.xlsx`)
    i++
  }
  used.add(name)
  return name
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('未登入', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, is_hq, store_ids, can_export_reports')
    .eq('user_id', user.id)
    .single()

  const isHqExport = canExportReports(profile) || profile?.is_hq === true || profile?.role === '老闆'
  const allowedStoreIds = new Set((profile?.store_ids ?? []) as string[])

  let body: { type?: 'month' | 'year'; year?: number; month?: number; targets?: ExportTarget[] }
  try {
    body = await req.json()
  } catch {
    return new NextResponse('格式錯誤', { status: 400 })
  }

  const type = body.type ?? 'month'
  const year = Number(body.year)
  const month = Number(body.month)
  const targets = (body.targets ?? []).filter(t => t.storeId && (t.kind === 'store' || t.kind === 'ck'))

  if (!year) return new NextResponse('缺少年份', { status: 400 })
  if (type === 'month' && !month) return new NextResponse('缺少月份', { status: 400 })
  if (targets.length === 0) return new NextResponse('請至少選擇一間店家或央廚', { status: 400 })
  if (targets.length > 40) return new NextResponse('一次最多匯出 40 間', { status: 400 })

  const admin = createAdminClient()
  const ids = [...new Set(targets.map(t => t.storeId))]
  const { data: stores } = await admin
    .from('stores')
    .select('id, name, type, active')
    .in('id', ids)

  const storeById = new Map<string, StoreRow>((stores ?? []).map((store: StoreRow) => [store.id, store]))
  const files: Array<{ name: string; data: Buffer }> = []
  const usedNames = new Set<string>()

  for (const target of targets) {
    const store = storeById.get(target.storeId)
    if (!store || store.active === false) continue
    if (!isHqExport && !allowedStoreIds.has(target.storeId)) {
      return new NextResponse(`無權限匯出 ${store.name}`, { status: 403 })
    }

    const isCk = store.type === '央廚'
    if ((target.kind === 'ck') !== isCk) continue

    const workbook = isCk
      ? (type === 'year'
          ? await buildAnnualCKWorkbook(target.storeId, year)
          : await buildCKNativeWorkbook(target.storeId, year, month))
      : (type === 'year'
          ? await buildAnnualFoodCostWorkbook(target.storeId, year)
          : await buildFoodCostNativeWorkbook(target.storeId, year, month))

    const workbookBuffer = await workbook.xlsx.writeBuffer()
    const buffer = Buffer.from(workbookBuffer as ArrayBuffer)
    const storeName = safeFileName(store.name)
    const suffix = isCk ? '央廚食耗' : '食耗成本'
    const fileName = type === 'year'
      ? `${storeName}_${year}年度_${suffix}.xlsx`
      : `${storeName}_${year}年${month}月_${suffix}.xlsx`
    files.push({ name: uniqueFileName(fileName, usedNames), data: buffer })
  }

  if (files.length === 0) return new NextResponse('沒有可匯出的資料', { status: 400 })

  const zip = makeZip(files)
  const label = type === 'year' ? `${year}年度` : `${year}年${month}月`
  const filename = encodeURIComponent(`批次Excel_${label}_${files.length}份.zip`)
  return new NextResponse(zip as any, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
