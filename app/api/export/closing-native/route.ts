/**
 * 原生 Excel 匯出 API
 *
 *   單月：GET /api/export/closing-native?storeId=...&month=YYYY-MM
 *         或 GET /api/export/closing-native?storeId=...&type=month&year=YYYY&monthNum=N
 *   年度：GET /api/export/closing-native?storeId=...&type=year&year=YYYY
 */
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMonthLastDay } from '@/lib/business-date'
import { getStoreItemsResolved } from '@/lib/store-items-resolver'
import { buildNativeWorkbook, buildAnnualWorkbook, type DayData, type StoreInfo } from '@/lib/native-excel-export'

/** 從 source sheet 複製整份到 target workbook（保留 styles / formulas / merges） */
function copySheetInto(target: ExcelJS.Workbook, source: ExcelJS.Worksheet, newName: string): ExcelJS.Worksheet {
  const ws = target.addWorksheet(newName, {
    views: source.views ? JSON.parse(JSON.stringify(source.views)) : undefined,
    properties: source.properties ? JSON.parse(JSON.stringify(source.properties)) : undefined,
  })
  const totalCols = (source as any).columnCount ?? 0
  for (let c = 1; c <= totalCols; c++) {
    const src = source.getColumn(c)
    const dst = ws.getColumn(c)
    if (src.width) dst.width = src.width
    if (src.hidden) dst.hidden = src.hidden
    if (src.style) dst.style = { ...src.style }
  }
  source.eachRow({ includeEmpty: true }, (row, rowNum) => {
    const newRow = ws.getRow(rowNum)
    if (row.height) newRow.height = row.height
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const newCell = newRow.getCell(colNum)
      const v = cell.value as any
      if (v && typeof v === 'object' && 'formula' in v) {
        newCell.value = { formula: v.formula, result: v.result } as any
      } else if (v !== null && v !== undefined) {
        newCell.value = v
      }
      if (cell.style) newCell.style = JSON.parse(JSON.stringify(cell.style))
      if (cell.note) newCell.note = cell.note
    })
  })
  const merges = (source.model as any)?.merges as string[] | undefined
  if (merges) for (const m of merges) { try { ws.mergeCells(m) } catch { /* ignore */ } }
  return ws
}

/**
 * 呼叫 food-cost route 產食耗成本 xlsx，抽出「N月食耗成本」sheet 合併到 target workbook。
 * 失敗時 return false，caller 決定要不要 continue（不 fatal）。
 */
async function attachFoodCostSheet(
  target: ExcelJS.Workbook,
  origin: string,
  cookie: string,
  storeId: string,
  monthStr: string,
  sheetName: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/api/export/food-cost?storeId=${storeId}&month=${monthStr}`, {
      headers: { cookie },
    })
    if (!res.ok) { console.warn(`[attachFoodCostSheet] food-cost 回 ${res.status}`); return false }
    const arrBuf = await res.arrayBuffer()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(arrBuf as any)
    const src = wb.getWorksheet(sheetName) ?? wb.worksheets.find(s => s.name.includes('食耗')) ?? wb.worksheets[0]
    if (!src) { console.warn(`[attachFoodCostSheet] 食耗 sheet 找不到`); return false }
    copySheetInto(target, src, sheetName)
    return true
  } catch (e) {
    console.warn(`[attachFoodCostSheet] failed:`, e)
    return false
  }
}

function emptyDay(): DayData {
  return { pos: 0, online: 0, online_cash: 0, uber: {}, panda: 0, twpay: 0, nft: 0, actual: 0, ck: 0, total_revenue: 0, items: {}, notes: {}, ckItems: {} }
}

interface ItemMeta { category: '食材' | '耗材' | '雜項'; vendor_group: string }

async function fetchRangeData(
  storeId: string,
  firstDay: string,
  lastDay: string,
  itemMetaMap?: Map<string, ItemMeta>,
): Promise<Record<string, DayData>> {
  const admin = createAdminClient()
  const [{ data: closings }, { data: receipts }] = await Promise.all([
    // 排序：verified > submitted > disputed > draft（用 updated_at 倒序避免拿到舊草稿覆蓋）
    admin.from('daily_closings')
      .select('business_date, status, updated_at, actual_remit, total_revenue, total_cost, revenue_items(channel, account_name, gross_amount), order_items(item_name, total_amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay)
      .order('updated_at', { ascending: true }),  // 由舊到新，後面覆寫前面 → 最終得到最新版
    admin.from('receipts')
      .select('business_date, vendor_name, total_amount, tax_amount, notes, receipt_items(item_name, amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
  ])

  const dataByDate: Record<string, DayData> = {}
  const ensure = (d: string) => (dataByDate[d] ?? (dataByDate[d] = emptyDay()))

  // 同日多筆 closings → 優先取 verified/submitted，再 fallback 到 draft
  const STATUS_PRIORITY: Record<string, number> = { verified: 4, submitted: 3, disputed: 2, draft: 1 }
  const closingsByDate: Record<string, any[]> = {}
  for (const c of (closings ?? []) as any[]) {
    if (!closingsByDate[c.business_date]) closingsByDate[c.business_date] = []
    closingsByDate[c.business_date].push(c)
  }
  // 每日選優先序最高的那筆
  const bestClosings = Object.values(closingsByDate).map(arr =>
    arr.sort((a, b) => (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0))[0]
  )

  for (const c of bestClosings) {
    const dd = ensure(c.business_date)
    dd.actual = (c.actual_remit ?? 0) as number
    dd.ck = (c.total_cost ?? 0) as number
    dd.total_revenue = (c.total_revenue ?? 0) as number
    for (const rv of (c.revenue_items ?? []) as any[]) {
      switch (rv.channel) {
        case 'pos':         dd.pos += rv.gross_amount ?? 0; break
        case 'handwrite':   dd.pos += rv.gross_amount ?? 0; break  // 手寫店：填入 POS 欄
        case 'online':      dd.online += rv.gross_amount ?? 0; break
        case 'online_cash': dd.online_cash += rv.gross_amount ?? 0; break
        case 'panda':       dd.panda += rv.gross_amount ?? 0; break
        case 'twpay':       dd.twpay += rv.gross_amount ?? 0; break
        case 'nft':         dd.nft += rv.gross_amount ?? 0; break
        case 'uber':
          if (rv.account_name) dd.uber[rv.account_name] = (dd.uber[rv.account_name] ?? 0) + (rv.gross_amount ?? 0)
          break
      }
    }
    for (const oi of (c.order_items ?? []) as any[]) {
      if (oi.item_name === '央廚配送') continue
      const amt = oi.total_amount ?? 0
      if (!amt) continue
      dd.items[oi.item_name] = (dd.items[oi.item_name] ?? 0) + amt
    }
  }
  for (const r of (receipts ?? []) as any[]) {
    const dd = ensure(r.business_date)
    const note = (r.notes as string)?.trim()
    let itemsSum = 0
    for (const it of (r.receipt_items ?? []) as any[]) {
      const name = it.item_name as string
      if (!name) continue
      dd.items[name] = (dd.items[name] ?? 0) + (it.amount ?? 0)
      if (note) dd.notes[name] = dd.notes[name] ? `${dd.notes[name]}\n${note}` : note
      itemsSum += it.amount ?? 0
    }
    // 退稅：receipt.total_amount > items 加總 → 差額視為退稅金額
    // 條件：receipt_items 必須有資料（itemsSum > 0），否則代表使用者還沒拆品項，
    //       整筆 total 不該被當成退稅算進「梁平退稅」欄
    const receiptItemsCount = (r.receipt_items ?? []).filter((it: any) => it.item_name && (it.amount ?? 0) > 0).length
    const taxAmount = (r.total_amount ?? 0) - itemsSum
    if (taxAmount > 0 && receiptItemsCount > 0) {
      let cat: '食材' | '耗材' | '雜項' = '雜項'
      let vg = ''
      if (itemMetaMap) {
        for (const it of (r.receipt_items ?? []) as any[]) {
          const meta = itemMetaMap.get(it.item_name as string)
          if (meta) { cat = meta.category; vg = meta.vendor_group; break }
        }
      }
      // 雙寫 magic key：`__tax_vg_{vg}__` 帶 vendor_group 優先匹配命名相近的退稅欄
      //                 `__tax_{cat}__`   退到 category 對應退稅欄
      // Phase 3 會優先用 vg key
      if (vg) {
        dd.items[`__tax_vg_${vg}__`] = (dd.items[`__tax_vg_${vg}__`] ?? 0) + taxAmount
      } else {
        dd.items[`__tax_${cat}__`] = (dd.items[`__tax_${cat}__`] ?? 0) + taxAmount
      }
    }
  }
  return dataByDate
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('未登入', { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const type = searchParams.get('type') ?? 'month'
  const yearParam = searchParams.get('year')
  const monthParam = searchParams.get('month')
  if (!storeId) return new NextResponse('缺少 storeId', { status: 400 })

  const admin = createAdminClient()

  // 1) 撈店家
  const { data: storeRow } = await admin.from('stores')
    .select('id, name, mode, closing_layout, ichef_uber_linked, uber_enabled, uber_accounts, panda_enabled, twpay_enabled, online_enabled, online_cash_enabled, nft_enabled')
    .eq('id', storeId).single()
  if (!storeRow) return new NextResponse('找不到店家', { status: 404 })
  const store = storeRow as unknown as StoreInfo

  // 2) 撈品項
  const items = await getStoreItemsResolved(storeId)
  // 建 item_name → {category, vendor_group} map（給 fetchRangeData 推退稅對應欄位用）
  const itemMetaMap = new Map<string, { category: '食材' | '耗材' | '雜項'; vendor_group: string }>(
    items.map(i => [i.name, { category: i.category, vendor_group: i.vendor_group }] as const),
  )

  // ─ 分流：年度 vs 單月 ─
  if (type === 'year') {
    const year = parseInt(yearParam ?? '')
    if (!year) return new NextResponse('缺少 year 參數', { status: 400 })

    const dataByMonth: Record<number, Record<string, DayData>> = {}
    for (let m = 1; m <= 12; m++) {
      const firstDay = `${year}-${String(m).padStart(2, '0')}-01`
      const lastDay = getMonthLastDay(year, m)
      dataByMonth[m] = await fetchRangeData(storeId, firstDay, lastDay, itemMetaMap)
    }

    // 年度：只產「年度總覽」sheet，接著附上 12 個「N月食耗成本」sheets → 共 13 分頁
    const nativeBuf = await buildAnnualWorkbook({ year, store, items, dataByMonth, includeMonthly: false })
    // 讀成 workbook，額外附上 1~12 月食耗成本 sheet
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(nativeBuf as any)
    const origin = req.nextUrl.origin
    const cookie = req.headers.get('cookie') ?? ''
    for (let m = 1; m <= 12; m++) {
      const monthStr = `${year}-${String(m).padStart(2, '0')}`
      await attachFoodCostSheet(wb, origin, cookie, storeId, monthStr, `${m}月食耗成本`)
    }
    const merged = Buffer.from(await wb.xlsx.writeBuffer())
    const filename = encodeURIComponent(`${store.name}_${year}年度_食耗成本.xlsx`)
    return new NextResponse(merged as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'X-Export-Mode': 'native-annual',
      },
    })
  }

  // 單月：支援兩種參數格式
  let year: number, monthNum: number
  if (monthParam && monthParam.includes('-')) {
    const [y, m] = monthParam.split('-')
    year = parseInt(y); monthNum = parseInt(m)
  } else {
    year = parseInt(yearParam ?? '')
    monthNum = parseInt(searchParams.get('monthNum') ?? '')
  }
  if (!year || !monthNum) return new NextResponse('月份格式錯誤', { status: 400 })

  const firstDay = `${year}-${String(monthNum).padStart(2, '0')}-01`
  const lastDay = getMonthLastDay(year, monthNum)
  const dataByDate = await fetchRangeData(storeId, firstDay, lastDay, itemMetaMap)

  // 預警：抓出有金額但沒對應 system_items / store_items 欄位的 item — 這些會在匯出時被丟掉
  const itemNames = new Set(items.map(i => i.name))
  const orphanItems = new Map<string, number>()
  for (const d of Object.values(dataByDate)) {
    for (const [name, amt] of Object.entries(d.items)) {
      if (!itemNames.has(name) && amt) {
        orphanItems.set(name, (orphanItems.get(name) ?? 0) + amt)
      }
    }
  }
  const orphanWarning = orphanItems.size > 0
    ? Array.from(orphanItems.entries()).map(([n, a]) => `${n}:${Math.round(a)}`).join(',')
    : null

  const nativeBuf = await buildNativeWorkbook({ year, monthNum, store, items, dataByDate })
  // 讀成 workbook，額外附上「N月食耗成本」sheet
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(nativeBuf as any)
  const monthStr = `${year}-${String(monthNum).padStart(2, '0')}`
  await attachFoodCostSheet(wb, req.nextUrl.origin, req.headers.get('cookie') ?? '', storeId, monthStr, `${monthNum}月食耗成本`)
  const merged = Buffer.from(await wb.xlsx.writeBuffer())

  const filename = encodeURIComponent(`${store.name}_${year}年${monthNum}月_食耗成本.xlsx`)
  const headers: Record<string, string> = {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    'X-Export-Mode': 'native',
  }
  if (orphanWarning) headers['X-Orphan-Items'] = encodeURIComponent(orphanWarning)
  return new NextResponse(merged as any, { headers })
}
