/**
 * 原生 Excel 匯出
 *
 * 兩種輸出：
 *   buildNativeWorkbook  → 單月，2 分頁：[月度總覽] [N月食耗成本]
 *   buildAnnualWorkbook  → 年度，13 分頁：[年度總覽] [1月] [2月] … [12月]
 *
 * 版型自動依店家模式：
 *   A 型 (handwrite)：店長手動填 POS、可選線上點餐 / 線上現金
 *   B 型 (ichef)：iChef 連動 POS、Uber 帳號、熊貓、台灣 Pay、NFT
 *
 * 內建計算公式（無法被覆寫）：
 *   扣除後的$ = (手動)POS − 配送(月底結) − SUM(平台收入)
 *   現場     = (手動)POS − SUM(平台收入)
 *   結果     = (手動)實際$ − 扣除後的$ − 配送(月底結)
 *   營業額   = IF(現場>0, 結果+現場, "")
 *   月份合計 = SUM(對應欄位 5:35)
 */
import ExcelJS from 'exceljs'
import { getMonthLastDay } from '@/lib/business-date'

// ────────────────────────────────────────────────
// 配色（沿用原本 Excel 模板）
// ────────────────────────────────────────────────
const C = {
  yellow:        'FFFFFF00',   // 強黃：月份合計 / 配送(月底結)
  yellowSoft:    'FFFFFFC0',
  cream:         'FFFFFFCC',   // 米黃：資料列
  yellowSofter:  'FFFFFCDD',
  orange:        'FFFFC000',   // 橘：計算欄表頭
  orangeFaint:   'FFFFF2CC',   // 淡橘：計算欄資料
  greyHeader:    'FFBFBFBF',   // 表頭灰（Row 3）
  grey:          'FFD9D9D9',
  greyDark:      'FFA6A6A6',
  greyLine:      'FFBFBFBF',
  greySoft:      'FFF2F2F2',
  blueLight:     'FFD9E1F2',
  pink:          'FFFFD6D6',
  pinkSoft:      'FFFCE4E4',
  platformRed:   'FFDA9694',   // 平台 1
  platformPink:  'FFF030ED',   // 平台 2
  platformGreen: 'FF00B050',   // 平台 3、4（店家自有）
  vendorOrange:  'FFFBD4B4',
  docInvoice:    'FF00B0F0',
  docReceipt:    'FFE36C09',
  ink:           'FF000000',
  body:          'FF404040',
  muted:         'FF808080',
  faint:         'FFB0B0B0',
  red:           'FFFF0000',
  redText:       'FFC00000',
  white:         'FFFFFFFF',
  black:         'FF000000',
  border:        'FF7F7F7F',
}
// 兩種字體：資料 PMingLiU 12pt、計算欄表頭 MS JhengHei 18pt
const FONT_DATA = 'PMingLiU'
const FONT_CALC = 'Microsoft JhengHei'
const FONT = FONT_CALC   // 月度總覽 / 年度總覽沿用
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

// ────────────────────────────────────────────────
// 共用工具
// ────────────────────────────────────────────────
export function colLetter(col: number): string {
  let s = ''
  while (col > 0) { s = String.fromCharCode(((col - 1) % 26) + 65) + s; col = Math.floor((col - 1) / 26) }
  return s
}

function daysOfMonth(year: number, monthNum: number): string[] {
  const last = parseInt(getMonthLastDay(year, monthNum).split('-')[2])
  const month = String(monthNum).padStart(2, '0')
  return Array.from({ length: last }, (_, i) => `${year}-${month}-${String(i + 1).padStart(2, '0')}`)
}

// ────────────────────────────────────────────────
// 輸入型別
// ────────────────────────────────────────────────
export interface StoreInfo {
  id: string
  name: string
  mode: 'ichef' | 'handwrite' | 'mixed'
  closing_layout?: 'auto' | 'handwrite' | 'ichef'
  ichef_uber_linked: boolean
  uber_enabled: boolean
  uber_accounts: string[]
  panda_enabled: boolean
  twpay_enabled: boolean
  online_enabled: boolean
  online_cash_enabled?: boolean
  nft_enabled?: boolean
}

export interface ItemDef {
  id: string
  name: string
  category: '食材' | '耗材' | '雜項'
  vendor_group: string
  vendor_group_id: string | null
  doc_type: string | null
  is_system: boolean
}

export interface DayData {
  pos: number
  online: number
  online_cash: number
  uber: Record<string, number>
  panda: number
  twpay: number
  nft: number
  actual: number
  ck: number
  /** daily_closings.total_revenue 直接從 DB 撈 — 最權威的營業額來源 */
  total_revenue?: number
  items: Record<string, number>
  notes: Record<string, string>
  ckItems: Record<string, number>
}

// ────────────────────────────────────────────────
// 月度統計（聚合給總覽分頁用）
// ────────────────────────────────────────────────
export interface MonthStats {
  revenue: number             // 結果 + 現場 加總（近似營業額）
  posTotal: number
  ck: number
  food: number
  pack: number
  misc: number
  totalCost: number           // food + pack + misc
  vendorBreakdown: Array<{
    vendor_group: string
    doc_type: string
    food: number
    pack: number
    misc: number
  }>
}

function aggregateMonthStats(items: ItemDef[], dataByDate: Record<string, DayData>, store?: StoreInfo): MonthStats {
  let posTotal = 0, online = 0, onlineCash = 0, uber = 0, panda = 0, twpay = 0, nft = 0
  let actual = 0
  for (const d of Object.values(dataByDate)) {
    posTotal += d.pos || 0
    online += d.online || 0
    onlineCash += d.online_cash || 0
    for (const v of Object.values(d.uber ?? {})) uber += v || 0
    panda += d.panda || 0
    twpay += d.twpay || 0
    nft += d.nft || 0
    actual += d.actual || 0
  }
  // 營業額 = POS + 平台（對非 ichef_uber_linked 店）
  //          = POS（對 ichef_uber_linked 店，pos_cash 已含 Uber，不能再加）
  const platformSum = online + onlineCash + uber + panda + twpay + nft
  const revenue = store?.ichef_uber_linked ? posTotal : posTotal + platformSum

  // 廠商分組金額 — 央廚配送獨立統計到 stats.ck，避免在「食材成本」雙重計算
  const vbMap = new Map<string, { vendor_group: string; doc_type: string; food: number; pack: number; misc: number }>()
  let food = 0, pack = 0, misc = 0, ck = 0
  for (const it of items) {
    let total = 0
    for (const d of Object.values(dataByDate)) total += d.items[it.name] || 0
    if (total === 0) continue
    // 央廚配送獨立累積到 ck，不進 food / vendorBreakdown（避免月度總覽重複算）
    if (it.vendor_group === '央廚配送') { ck += total; continue }
    const key = `${it.vendor_group}|${it.doc_type ?? ''}`
    if (!vbMap.has(key)) vbMap.set(key, { vendor_group: it.vendor_group, doc_type: it.doc_type ?? '', food: 0, pack: 0, misc: 0 })
    const bucket = vbMap.get(key)!
    if (it.category === '食材') { bucket.food += total; food += total }
    else if (it.category === '耗材') { bucket.pack += total; pack += total }
    else { bucket.misc += total; misc += total }
  }
  const vendorBreakdown = Array.from(vbMap.values()).sort((a, b) => (b.food + b.pack + b.misc) - (a.food + a.pack + a.misc))

  return { revenue, posTotal, ck, food, pack, misc, totalCost: food + pack + misc, vendorBreakdown }
}

// ────────────────────────────────────────────────
// 總覽分頁：單月（傳統 Excel 表格風格 — 對齊原本模板）
// ────────────────────────────────────────────────
function addMonthlyOverviewSheet(wb: ExcelJS.Workbook, opts: {
  year: number
  monthNum: number
  store: StoreInfo
  stats: MonthStats
}) {
  const { year, monthNum, store, stats } = opts
  const ws = wb.addWorksheet('月度總覽', { properties: { defaultRowHeight: 22 } })
  ws.views = [{ showGridLines: true, state: 'normal' }]

  for (let i = 1; i <= 8; i++) ws.getColumn(i).width = 27

  // ─ 標題列 ─
  ws.mergeCells('A1:H1')
  const title = ws.getCell('A1')
  title.value = `${store.name}　${year} 年 ${monthNum} 月　月度成本報告`
  title.font = { name: FONT, bold: true, size: 16, color: { argb: C.ink } }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.yellow } }
  title.border = {
    top:    { style: 'medium', color: { argb: C.black } },
    bottom: { style: 'medium', color: { argb: C.black } },
    left:   { style: 'medium', color: { argb: C.black } },
    right:  { style: 'medium', color: { argb: C.black } },
  }
  ws.getRow(1).height = 32

  ws.getRow(2).height = 8  // 留白

  // ─ 月度關鍵數字（傳統表格：標題列 + 數字列） ─
  const totalCost = stats.ck + stats.food + stats.pack + stats.misc
  const remit = stats.revenue - totalCost
  const safePct = (n: number, base: number) => base > 0 ? (n / base * 100).toFixed(1) + '%' : '-'

  // 標題列
  const kpiHeaders = [
    { name: '本月總營業額', bg: C.yellow },
    { name: '央廚配送',     bg: C.orange },
    { name: '食材成本',     bg: C.grey },
    { name: '耗材成本',     bg: C.grey },
    { name: '雜項成本',     bg: C.grey },
    { name: '總成本',       bg: C.orange },
    { name: '應匯入 HQ',    bg: C.yellow },
  ]
  for (let i = 0; i < kpiHeaders.length; i++) {
    const c = ws.getCell(3, i + 1)
    c.value = kpiHeaders[i].name
    c.font = { name: FONT, bold: true, size: 14, color: { argb: C.ink } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: kpiHeaders[i].bg } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = {
      top:    { style: 'medium', color: { argb: C.black } },
      bottom: { style: 'thin',   color: { argb: C.black } },
      left:   { style: 'thin',   color: { argb: C.black } },
      right:  { style: 'thin',   color: { argb: C.black } },
    }
  }
  ws.getRow(3).height = 28

  // 數字列
  const kpiValues = [stats.revenue, stats.ck, stats.food, stats.pack, stats.misc, totalCost, remit]
  for (let i = 0; i < kpiValues.length; i++) {
    const c = ws.getCell(4, i + 1)
    c.value = kpiValues[i]
    c.font = { name: FONT, bold: true, size: 17, color: { argb: i === 0 || i === 6 ? C.red : C.ink } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 0 || i === 6 ? C.yellowSoft : C.yellowSofter } }
    c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
    c.numFmt = '$#,##0'
    c.border = {
      top:    { style: 'thin',   color: { argb: C.black } },
      bottom: { style: 'thin',   color: { argb: C.black } },
      left:   { style: 'thin',   color: { argb: C.black } },
      right:  { style: 'thin',   color: { argb: C.black } },
    }
  }
  ws.getRow(4).height = 36

  // 占比列
  const ratioValues = ['—', safePct(stats.ck, stats.revenue), safePct(stats.food, stats.revenue), safePct(stats.pack, stats.revenue), safePct(stats.misc, stats.revenue), safePct(totalCost, stats.revenue), safePct(remit, stats.revenue)]
  for (let i = 0; i < ratioValues.length; i++) {
    const c = ws.getCell(5, i + 1)
    c.value = i === 0 ? '占營業額' : ratioValues[i]
    c.font = { name: FONT, bold: true, size: 17, color: { argb: C.muted } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.greySoft } }
    c.alignment = { horizontal: i === 0 ? 'center' : 'right', vertical: 'middle', indent: i === 0 ? 0 : 1 }
    c.border = {
      top:    { style: 'thin',   color: { argb: C.black } },
      bottom: { style: 'medium', color: { argb: C.black } },
      left:   { style: 'thin',   color: { argb: C.black } },
      right:  { style: 'thin',   color: { argb: C.black } },
    }
  }
  ws.getRow(5).height = 22

  ws.getRow(6).height = 18  // 留白

  // ─ 各廠商小計表 ─
  ws.mergeCells('A7:H7')
  const sec = ws.getCell('A7')
  sec.value = '各廠商當月小計'
  sec.font = { name: FONT, bold: true, size: 17, color: { argb: C.ink } }
  sec.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  sec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.grey } }
  sec.border = {
    top:    { style: 'medium', color: { argb: C.black } },
    bottom: { style: 'medium', color: { argb: C.black } },
    left:   { style: 'medium', color: { argb: C.black } },
    right:  { style: 'medium', color: { argb: C.black } },
  }
  ws.getRow(7).height = 26

  // 表頭
  const tHeaders = ['廠商分類', '單據類型', '食材', '耗材', '雜項', '合計', '占成本', '備註']
  for (let i = 0; i < tHeaders.length; i++) {
    const c = ws.getCell(8, i + 1)
    c.value = tHeaders[i]
    c.font = { name: FONT, bold: true, size: 17, color: { argb: C.ink } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.grey } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = {
      top:    { style: 'thin', color: { argb: C.black } },
      bottom: { style: 'thin', color: { argb: C.black } },
      left:   { style: 'thin', color: { argb: C.black } },
      right:  { style: 'thin', color: { argb: C.black } },
    }
  }
  ws.getRow(8).height = 24

  // 央廚行 + 各廠商
  const vbWithCK = [
    { vendor_group: '央廚配送', doc_type: '估價單', food: stats.ck, pack: 0, misc: 0, isCK: true },
    ...stats.vendorBreakdown.map(v => ({ ...v, isCK: false })),
  ]

  vbWithCK.forEach((row, i) => {
    const r = 9 + i
    ws.getRow(r).height = 22
    const isAlt = i % 2 === 1
    const isTax = row.vendor_group.includes('退稅')
    const total = (row.food || 0) + (row.pack || 0) + (row.misc || 0)
    const ratio = totalCost > 0 ? (total / totalCost * 100).toFixed(1) + '%' : '-'
    const cellBg = isTax ? C.pinkSoft : (isAlt ? C.yellowSofter : C.white)
    const values: (string | number)[] = [row.vendor_group, row.doc_type, row.food || 0, row.pack || 0, row.misc || 0, total, ratio, '']

    for (let j = 0; j < values.length; j++) {
      const c = ws.getCell(r, j + 1)
      c.value = values[j]
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cellBg } }
      c.border = {
        top:    { style: 'thin', color: { argb: C.greyLine } },
        bottom: { style: 'thin', color: { argb: C.greyLine } },
        left:   { style: 'thin', color: { argb: C.greyLine } },
        right:  { style: 'thin', color: { argb: C.greyLine } },
      }
      if (j <= 1) {
        c.font = { name: FONT, bold: j === 0, size: 17, color: { argb: isTax ? C.red : C.ink } }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
      } else if (j === 5) {
        c.font = { name: FONT, bold: true, size: 14, color: { argb: isTax ? C.red : C.ink } }
        c.numFmt = '#,##0'
        c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.yellowSoft } }
      } else if (j === 6) {
        c.font = { name: FONT, size: 17, color: { argb: C.muted } }
        c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
      } else if (j === 7) {
        c.font = { name: FONT, size: 17, color: { argb: C.muted } }
        c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      } else {
        const v = values[j] as number
        c.font = { name: FONT, size: 17, color: { argb: v === 0 ? C.faint : (isTax ? C.red : C.ink) } }
        c.numFmt = '#,##0'
        c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
      }
    }
  })

  // 合計列 — 食材欄顯示「央廚 + 一般食材」總和（上方央廚列已單獨拆出，這裡要全加回來）
  const totalR = 9 + vbWithCK.length
  ws.getRow(totalR).height = 28
  const grandTotalCost = stats.ck + stats.food + stats.pack + stats.misc
  const totalRow = ['本月合計', '', stats.ck + stats.food, stats.pack, stats.misc, grandTotalCost, '100.0%', '']
  for (let j = 0; j < totalRow.length; j++) {
    const c = ws.getCell(totalR, j + 1)
    c.value = totalRow[j]
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.yellow } }
    c.font = { name: FONT, bold: true, size: 17, color: { argb: j === 5 ? C.red : C.ink } }
    c.border = {
      top:    { style: 'medium', color: { argb: C.black } },
      bottom: { style: 'medium', color: { argb: C.black } },
      left:   { style: 'thin',   color: { argb: C.black } },
      right:  { style: 'thin',   color: { argb: C.black } },
    }
    if (j <= 1) {
      c.alignment = { horizontal: 'center', vertical: 'middle' }
    } else if (j === 6 || j === 7) {
      c.alignment = { horizontal: j === 6 ? 'right' : 'left', vertical: 'middle', indent: 1 }
    } else {
      c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
      c.numFmt = '#,##0'
    }
  }

  ws.getColumn(1).width = 21
  ws.getColumn(2).width = 19
  ws.getColumn(3).width = 20
  ws.getColumn(4).width = 20
  ws.getColumn(5).width = 20
  ws.getColumn(6).width = 21
  ws.getColumn(7).width = 18
  ws.getColumn(8).width = 25
}

// ────────────────────────────────────────────────
// 總覽分頁：年度（傳統 Excel 表格風格，仿 2026鑫營明細）
// ────────────────────────────────────────────────
function addAnnualOverviewSheet(wb: ExcelJS.Workbook, opts: {
  year: number
  store: StoreInfo
  monthlyStats: MonthStats[]
}) {
  const { year, store, monthlyStats } = opts
  const ws = wb.addWorksheet('年度總覽', { properties: { defaultRowHeight: 22 } })
  ws.views = [{ showGridLines: true, state: 'normal' }]

  // 標題列
  ws.mergeCells('A1:I1')
  const title = ws.getCell('A1')
  title.value = `${store.name}　${year} 年度成本報告`
  title.font = { name: FONT, bold: true, size: 16, color: { argb: C.ink } }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.yellow } }
  title.border = {
    top:    { style: 'medium', color: { argb: C.black } },
    bottom: { style: 'medium', color: { argb: C.black } },
    left:   { style: 'medium', color: { argb: C.black } },
    right:  { style: 'medium', color: { argb: C.black } },
  }
  ws.getRow(1).height = 32

  ws.getRow(2).height = 8

  // 表頭
  const hdrs = ['月份', '營業額', '央廚成本', '食材', '耗材', '雜項', '總成本', '應匯入 HQ', '占比']
  const hdrBgs = [C.grey, C.yellow, C.orange, C.grey, C.grey, C.grey, C.orange, C.yellow, C.grey]
  for (let i = 0; i < hdrs.length; i++) {
    const c = ws.getCell(3, i + 1)
    c.value = hdrs[i]
    c.font = { name: FONT, bold: true, size: 14, color: { argb: C.ink } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hdrBgs[i] } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = {
      top:    { style: 'medium', color: { argb: C.black } },
      bottom: { style: 'thin',   color: { argb: C.black } },
      left:   { style: 'thin',   color: { argb: C.black } },
      right:  { style: 'thin',   color: { argb: C.black } },
    }
  }
  ws.getRow(3).height = 28

  // 12 個月資料列
  for (let m = 0; m < 12; m++) {
    const r = 4 + m
    const s = monthlyStats[m]
    const isAlt = m % 2 === 1
    const cellBg = isAlt ? C.yellowSofter : C.white
    const totalCost = s.ck + s.totalCost
    const remit = s.revenue - totalCost
    const ratio = s.revenue > 0 ? (totalCost / s.revenue * 100).toFixed(1) + '%' : '-'
    const values: (string | number)[] = [`${m + 1} 月`, s.revenue, s.ck, s.food, s.pack, s.misc, totalCost, remit, ratio]
    for (let j = 0; j < values.length; j++) {
      const c = ws.getCell(r, j + 1)
      c.value = values[j]
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cellBg } }
      c.border = {
        top:    { style: 'thin', color: { argb: C.greyLine } },
        bottom: { style: 'thin', color: { argb: C.greyLine } },
        left:   { style: 'thin', color: { argb: C.greyLine } },
        right:  { style: 'thin', color: { argb: C.greyLine } },
      }
      if (j === 0) {
        c.font = { name: FONT, bold: true, size: 14, color: { argb: C.ink } }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
      } else if (j === 7) {
        c.font = { name: FONT, bold: true, size: 14, color: { argb: C.red } }
        c.numFmt = '#,##0'
        c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.yellowSoft } }
      } else if (j === 8) {
        c.font = { name: FONT, bold: true, size: 17, color: { argb: C.muted } }
        c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
      } else {
        const v = values[j] as number
        c.font = { name: FONT, size: 17, color: { argb: v === 0 ? C.faint : C.ink } }
        c.numFmt = '#,##0'
        c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
      }
    }
    ws.getRow(r).height = 24
  }

  // 全年合計
  const yearRev = monthlyStats.reduce((s, m) => s + m.revenue, 0)
  const yearCK = monthlyStats.reduce((s, m) => s + m.ck, 0)
  const yearFood = monthlyStats.reduce((s, m) => s + m.food, 0)
  const yearPack = monthlyStats.reduce((s, m) => s + m.pack, 0)
  const yearMisc = monthlyStats.reduce((s, m) => s + m.misc, 0)
  const yearTotalCost = yearCK + yearFood + yearPack + yearMisc
  const yearRemit = yearRev - yearTotalCost
  const yearRatio = yearRev > 0 ? (yearTotalCost / yearRev * 100).toFixed(1) + '%' : '-'

  const totalR = 16
  ws.getRow(totalR).height = 32
  const totalRow: (string | number)[] = ['全年合計', yearRev, yearCK, yearFood, yearPack, yearMisc, yearTotalCost, yearRemit, yearRatio]
  for (let j = 0; j < totalRow.length; j++) {
    const c = ws.getCell(totalR, j + 1)
    c.value = totalRow[j]
    c.font = { name: FONT, bold: true, size: 17, color: { argb: j === 7 ? C.red : C.ink } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.yellow } }
    c.border = {
      top:    { style: 'medium', color: { argb: C.black } },
      bottom: { style: 'medium', color: { argb: C.black } },
      left:   { style: 'thin',   color: { argb: C.black } },
      right:  { style: 'thin',   color: { argb: C.black } },
    }
    if (j === 0 || j === 8) c.alignment = { horizontal: j === 0 ? 'center' : 'right', vertical: 'middle', indent: j === 0 ? 0 : 1 }
    else {
      c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
      c.numFmt = '#,##0'
    }
  }

  // 欄寬
  ws.getColumn(1).width = 17
  for (let i = 2; i <= 8; i++) ws.getColumn(i).width = 22
  ws.getColumn(9).width = 16
}

// ────────────────────────────────────────────────
// 每日明細分頁 — 對齊原本 Excel 模板
// 結構：
//   A 日期 | B 星期 | C (手動)POS | [平台欄...] | 扣除後 | 現場 | (手動)實際$ | 配送(月底結) | 結果 | 營業額
//   | (窄分隔) | 總 | 食材 | 耗材 | 雜項 | [央廚 items...] | [食材 items...] | [耗材 items...] | [雜項 items...]
// ────────────────────────────────────────────────
function addDetailSheet(wb: ExcelJS.Workbook, opts: {
  year: number
  monthNum: number
  store: StoreInfo
  items: ItemDef[]
  dataByDate: Record<string, DayData>
}) {
  const { year, monthNum, store, items, dataByDate } = opts

  const layout: 'handwrite' | 'ichef' =
    store.closing_layout === 'handwrite' ? 'handwrite' :
    store.closing_layout === 'ichef' ? 'ichef' :
    (store.mode === 'handwrite' || store.mode === 'mixed') ? 'handwrite' : 'ichef'

  const ws = wb.addWorksheet(`${monthNum}月食耗成本`)

  // ─ 平台欄位 ─
  // 動態長度：只列出該店實際啟用的平台，沒啟用的不出欄。
  // 顏色依平台種類：
  //   TWPAY            → 桃粉底 + 紅字（DA9694 對比清晰）
  //   所有 Uber 帳號   → 綠底  + 黑字（鑫營 / 五分舖 等統一）
  //   熊貓             → 桃粉底 + 紅字（同類型支付/外送色系，實務上同店少同時出現）
  //   線上自家/線上(現金) → 淺藍底 + 黑字（兩者一致以標示自家通路）
  // 注意：NFT 目前不使用，不列入匯出。
  // 順序：TWPAY → Uber 帳號 → 熊貓 → 線上自家 → 線上(現金)
  const platformStyle = (key: string): { bg: string; color: string } => {
    if (key === 'twpay') return { bg: C.platformRed, color: C.red }
    if (key === 'panda') return { bg: C.platformRed, color: C.red }
    if (key === 'online' || key === 'online_cash') return { bg: C.blueLight, color: C.ink }
    return { bg: C.platformGreen, color: C.ink }
  }
  const platformCols: { key: string; label: string; bg: string; color: string }[] = []
  const enabled: { key: string; label: string }[] = []
  if (store.twpay_enabled) enabled.push({ key: 'twpay', label: 'TWPAY' })
  for (const acc of store.uber_accounts ?? []) enabled.push({ key: `uber:${acc}`, label: acc })
  if (store.panda_enabled) enabled.push({ key: 'panda', label: '熊貓' })
  if (layout === 'handwrite' && store.online_enabled) {
    enabled.push({ key: 'online', label: store.name })
    if (store.online_cash_enabled) enabled.push({ key: 'online_cash', label: '線上(現金)' })
  }
  for (const e of enabled) {
    const st = platformStyle(e.key)
    platformCols.push({ key: e.key, label: e.label, bg: st.bg, color: st.color })
  }

  // 排除與計算欄同名的「配送(月底結)」、「央廚配送」等系統項目
  const CALC_COL_NAMES = new Set(['配送(月底結)', '央廚配送', '配送', '(手動)POS', '(手動)實際$', '扣除後的$', '現場', '結果', '營業額'])
  const filteredItems = items.filter(i => !CALC_COL_NAMES.has(i.name))
  const foodItems = filteredItems.filter(i => i.category === '食材')
  const packItems = filteredItems.filter(i => i.category === '耗材')
  const miscItems = filteredItems.filter(i => i.category === '雜項')

  const colOfKey: Record<string, number> = {}
  // colOfItem 用 (vendor_group + name) 當 key，避免同名不同分組互相覆蓋（例如「魚丸」央廚配送 vs 菜商）
  const colOfItem: Record<string, number> = {}
  const itemKey = (it: { name: string; vendor_group: string }) => `${it.vendor_group || '未分類'}|${it.name}`
  let col = 1

  // A 日期
  colOfKey['date'] = col++
  // B 星期
  colOfKey['weekday'] = col++
  // C POS
  colOfKey['pos'] = col++
  // 平台欄
  const platformStartCol = col
  for (const p of platformCols) { colOfKey[p.key] = col++ }
  const platformEndCol = col - 1
  // 計算欄
  colOfKey['deducted'] = col++
  colOfKey['onsite']   = col++
  colOfKey['actual']   = col++
  colOfKey['ck']       = col++
  colOfKey['result']   = col++
  colOfKey['revenue']  = col++
  // 窄分隔欄
  colOfKey['spacer']   = col++
  // 總／小計
  colOfKey['sub_all']  = col++
  colOfKey['sub_food'] = col++
  colOfKey['sub_pack'] = col++
  colOfKey['sub_misc'] = col++

  // 品項欄（依分類 → vendor_group 群組）
  // 央廚 items 算在食材分類但 vendor_group=央廚配送
  const itemSections = [
    { key: 'food', items: foodItems },
    { key: 'pack', items: packItems },
    { key: 'misc', items: miscItems },
  ]
  const vendorGroupRanges: Array<{ name: string; doc: string | null; start: number; end: number; isTax: boolean }> = []

  for (const sec of itemSections) {
    const byVG: Record<string, ItemDef[]> = {}
    const vgOrder: string[] = []
    for (const it of sec.items) {
      const vg = it.vendor_group || '未分類'
      if (!byVG[vg]) { byVG[vg] = []; vgOrder.push(vg) }
      byVG[vg].push(it)
    }
    for (const vg of vgOrder) {
      const groupItems = byVG[vg]
      const startCol = col
      const docType = groupItems[0]?.doc_type ?? null
      const isTax = /退稅|稅金|感熱稅/.test(vg)
      for (const it of groupItems) {
        colOfItem[itemKey(it)] = col++
      }
      const endCol = col - 1
      vendorGroupRanges.push({ name: vg, doc: docType, start: startCol, end: endCol, isTax })
    }
  }

  const totalCols = col - 1
  const days = daysOfMonth(year, monthNum)

  // ────────────────────────────────────────────────
  // Row 3 表頭
  // ────────────────────────────────────────────────
  const setR3 = (c: number, val: string, opts: { bg: string; font: 'data' | 'calc'; size?: number; color?: string }) => {
    const cell = ws.getRow(3).getCell(c)
    cell.value = val
    const fontName = opts.font === 'calc' ? FONT_CALC : FONT_DATA
    cell.font = { name: fontName, bold: true, size: opts.size ?? (opts.font === 'calc' ? 18 : 12), color: { argb: opts.color ?? C.ink } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } }
    cell.border = thinBlack
  }

  setR3(colOfKey['date'], '日　期', { bg: C.greyHeader, font: 'data' })
  setR3(colOfKey['weekday'], '', { bg: C.greyHeader, font: 'data' })
  // 計算欄表頭：12pt 比 18pt 容易擺得下且仍清楚
  setR3(colOfKey['pos'], '(手動)POS', { bg: C.orange, font: 'calc', size: 14, color: C.red })
  for (const p of platformCols) setR3(colOfKey[p.key], p.label, { bg: p.bg, font: 'calc', size: 14, color: p.color })
  setR3(colOfKey['deducted'], '扣除後的$', { bg: C.orange, font: 'calc', size: 12 })
  setR3(colOfKey['onsite'], '現場', { bg: C.orange, font: 'calc', size: 12 })
  setR3(colOfKey['actual'], '(手動)實際$', { bg: C.orange, font: 'calc', size: 14, color: C.red })
  setR3(colOfKey['ck'], '配送(月底結)', { bg: C.yellow, font: 'calc', size: 14, color: C.red })
  setR3(colOfKey['result'], '結果', { bg: C.orange, font: 'calc', size: 12 })
  setR3(colOfKey['revenue'], '營業額', { bg: C.orange, font: 'calc', size: 12 })
  // spacer: empty no fill
  setR3(colOfKey['sub_all'], '總', { bg: C.greyHeader, font: 'data' })
  setR3(colOfKey['sub_food'], '食材', { bg: C.greyHeader, font: 'data' })
  setR3(colOfKey['sub_pack'], '耗材', { bg: C.greyHeader, font: 'data' })
  setR3(colOfKey['sub_misc'], '雜項', { bg: C.greyHeader, font: 'data' })
  // 品項
  for (const it of items) {
    const c = colOfItem[itemKey(it)]
    if (!c) continue
    const isTaxItem = /稅|稅金/.test(it.name)
    setR3(c, it.name, { bg: C.greyHeader, font: 'data', color: isTaxItem ? C.red : C.ink })
  }

  // 不合併 R3/R4 — 避免 Row 4 月份合計 SUM 公式蓋掉 Row 3 headers
  // R3 = 欄位名稱、R4 = 月份合計（兩列分開呈現）

  // ────────────────────────────────────────────────
  // Row 1（廠商分類）、Row 2（單據類型）— 品項區
  // ────────────────────────────────────────────────
  for (const vg of vendorGroupRanges) {
    if (!vg.name || vg.name === '未分類') continue
    const cell = ws.getRow(1).getCell(vg.start)
    cell.value = vg.name
    cell.font = { name: FONT_DATA, bold: true, size: 14, color: { argb: vg.isTax ? C.red : C.ink } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = thinBlack
    if (vg.end > vg.start) ws.mergeCells(1, vg.start, 1, vg.end)
    if (vg.doc) {
      const dcell = ws.getRow(2).getCell(vg.start)
      dcell.value = vg.doc
      dcell.font = { name: FONT_DATA, bold: true, size: 14, color: { argb: vg.isTax ? C.red : C.ink } }
      dcell.alignment = { horizontal: 'center', vertical: 'middle' }
      dcell.border = thinBlack
      if (vg.end > vg.start) ws.mergeCells(2, vg.start, 2, vg.end)
    }
  }

  // Row 1/2 左半（日期~營業額）淡黃底 + PMingLiU 12pt
  for (let c = 1; c <= colOfKey['revenue']; c++) {
    for (const r of [1, 2]) {
      const cell = ws.getRow(r).getCell(c)
      if (!cell.fill || (cell.fill as any).type !== 'pattern') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cream } }
      }
      cell.font = { name: FONT_DATA, bold: true, size: 14, color: { argb: C.ink } }
      cell.border = thinBlack
    }
  }
  // Row 1/2 subtotal 區 — 對齊原本各店模板的「梁平退稅 / 總發票 / 總收據」summary
  //   O1: 梁平退稅（label）   P1: SUMIFS(發票 且 退稅)  公式
  //   O2: 總發票              P2: SUMIFS(發票) − 梁平退稅
  //   Q2: 總收據              R2: SUMIFS(收據)
  // 範圍 = 所有品項欄（不含 sub_all/sub_food/sub_pack/sub_misc 本身）
  const allItemColsForSumifs = Object.values(colOfItem)
  if (allItemColsForSumifs.length > 0) {
    const firstItemLetter = colLetter(Math.min(...allItemColsForSumifs))
    const lastItemLetter = colLetter(Math.max(...allItemColsForSumifs))
    const range4 = `${firstItemLetter}4:${lastItemLetter}4`
    const range2 = `${firstItemLetter}2:${lastItemLetter}2`
    const range1 = `${firstItemLetter}1:${lastItemLetter}1`

    const subAllLetter  = colLetter(colOfKey['sub_all'])
    const subFoodLetter = colLetter(colOfKey['sub_food'])
    const subPackLetter = colLetter(colOfKey['sub_pack'])
    const subMiscLetter = colLetter(colOfKey['sub_misc'])

    const taxRefundFormula = `SUMIFS(${range4},${range2},"發票",${range1},"退稅")`

    const setSummary = (addr: string, val: string | { formula: string }, opts: { bg: string; color?: string; align?: 'left' | 'right' | 'center' } = { bg: C.cream }) => {
      const cell = ws.getCell(addr)
      cell.value = typeof val === 'string' ? val : { formula: val.formula } as any
      cell.font = { name: FONT_DATA, bold: true, size: 14, color: { argb: opts.color ?? C.ink } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } }
      cell.alignment = { horizontal: opts.align ?? (typeof val === 'string' ? 'center' : 'right'), vertical: 'middle', indent: opts.align === 'right' || typeof val !== 'string' ? 1 : 0 }
      cell.border = thinBlack
      if (typeof val !== 'string') cell.numFmt = '#,##0'
    }

    setSummary(`${subAllLetter}1`,  '梁平退稅',                                              { bg: C.pinkSoft, color: C.red })
    setSummary(`${subFoodLetter}1`, { formula: taxRefundFormula },                            { bg: C.pinkSoft, color: C.red })
    setSummary(`${subAllLetter}2`,  '總發票',                                                { bg: C.blueLight })
    setSummary(`${subFoodLetter}2`, { formula: `SUMIFS(${range4},${range2},"發票")-${subFoodLetter}1` }, { bg: C.blueLight })
    setSummary(`${subPackLetter}2`, '總收據',                                                { bg: C.orangeFaint })
    setSummary(`${subMiscLetter}2`, { formula: `SUMIFS(${range4},${range2},"收據")` },        { bg: C.orangeFaint })
  }

  // ────────────────────────────────────────────────
  // Row 4 月份合計
  // ────────────────────────────────────────────────
  const r4 = ws.getRow(4)
  r4.getCell(1).value = `${monthNum}月`
  r4.getCell(1).font = { name: FONT_DATA, bold: true, size: 14, color: { argb: C.ink } }
  r4.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.yellow } }
  r4.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r4.getCell(1).border = thinBlack
  r4.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.yellow } }
  r4.getCell(2).border = thinBlack

  // 各欄寫 SUM 公式（包含品項、平台、計算、subtotal）
  const allDataCols = [
    colOfKey['pos'], ...platformCols.map(p => colOfKey[p.key]),
    colOfKey['deducted'], colOfKey['onsite'], colOfKey['actual'], colOfKey['ck'],
    colOfKey['result'], colOfKey['revenue'],
    colOfKey['sub_all'], colOfKey['sub_food'], colOfKey['sub_pack'], colOfKey['sub_misc'],
    ...Object.values(colOfItem),
  ]
  for (const c of allDataCols) {
    const letter = colLetter(c)
    const cell = r4.getCell(c)
    cell.value = { formula: `SUM(${letter}5:${letter}35)` } as any
    cell.font = { name: FONT_DATA, bold: true, size: 14, color: { argb: C.ink } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.yellow } }
    cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
    cell.numFmt = '#,##0'
    cell.border = thinBlack
  }

  // ────────────────────────────────────────────────
  // Row 5+ 每日資料 + 公式
  // ────────────────────────────────────────────────
  const posCol = colOfKey['pos']
  const ckCol = colOfKey['ck']
  const actualCol = colOfKey['actual']
  const deductedCol = colOfKey['deducted']
  const onsiteCol = colOfKey['onsite']
  const resultCol = colOfKey['result']
  const revenueCol = colOfKey['revenue']

  const platformSum = (row: number) => platformStartCol <= platformEndCol
    ? `SUM(${colLetter(platformStartCol)}${row}:${colLetter(platformEndCol)}${row})`
    : '0'

  // 央廚分組欄位範圍（用於 K「配送(月底結)」公式 = SUM(央廚分組)）
  // vendor_group === '央廚配送' 的食材分組 — 對齊各店原版
  const ckGroupRange = vendorGroupRanges.find(v => v.name === '央廚配送')
  const ckGroupCols: number[] = ckGroupRange
    ? Array.from({ length: ckGroupRange.end - ckGroupRange.start + 1 }, (_, i) => ckGroupRange.start + i)
    : []

  const foodCols = foodItems.map(i => colOfItem[itemKey(i)]).filter(Boolean)
  const packCols = packItems.map(i => colOfItem[itemKey(i)]).filter(Boolean)
  const miscCols = miscItems.map(i => colOfItem[itemKey(i)]).filter(Boolean)
  const allItemCols = [...foodCols, ...packCols, ...miscCols]

  for (let i = 0; i < days.length; i++) {
    const row = 5 + i
    const date = days[i]
    const dt = new Date(date + 'T12:00:00+08:00')
    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6

    // A: 日期（真實 Date 值 + 格式）
    const aCell = ws.getRow(row).getCell(1)
    aCell.value = dt
    aCell.numFmt = 'm"月"d"日"'
    aCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cream } }
    aCell.font = { name: FONT_DATA, size: 14, color: { argb: C.ink } }
    aCell.alignment = { horizontal: 'center', vertical: 'middle' }
    aCell.border = thinBlack

    // B: 星期（WEEKDAY 公式）
    const bCell = ws.getRow(row).getCell(2)
    bCell.value = { formula: `CHOOSE(WEEKDAY(A${row},1),"星期日","星期一","星期二","星期三","星期四","星期五","星期六")` } as any
    bCell.numFmt = '[$-404]aaaa'
    bCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cream } }
    bCell.font = { name: FONT_DATA, size: 14, color: { argb: isWeekend ? C.red : C.ink }, bold: isWeekend }
    bCell.alignment = { horizontal: 'center', vertical: 'middle' }
    bCell.border = thinBlack

    // 資料填入
    const d = dataByDate[date]
    if (d) {
      // POS 欄（C 欄）= 當日總營業額（手寫/POS + 平台合計）
      // 對齊原版 Excel：H = C − O − SUM(D:G)、I = C − SUM(D:G)
      //   D-G 是各平台金額（拆出來），所以 C 必須包含平台才能讓 I = 現場（純手寫/POS）
      //
      // 各店情境：
      //   handwrite 店      ：d.pos = handwriteTotal，需 + platformTotal 才是 POS 欄
      //   mixed 店          ：d.pos = pos_cash + handwriteTotal，需 + platformTotal
      //   ichef 店（無連動）：d.pos = pos_cash（純現場 POS），需 + platformTotal
      //   ichef_uber_linked ：d.pos = pos_cash（iChef 顯示已含 Uber），直接用 d.pos（已含平台）
      const platformTotal = (d.online || 0) + (d.online_cash || 0) + (d.panda || 0) + (d.twpay || 0) + (d.nft || 0)
        + Object.values(d.uber ?? {}).reduce((s, v) => s + (v || 0), 0)
      const posOnlyValue = store.ichef_uber_linked ? d.pos : d.pos + platformTotal
      // 該日有結帳資料 → 一律寫入（0 也寫，不留空白）；只有「該日完全沒結帳」(d===undefined) 才整列空白
      ws.getRow(row).getCell(posCol).value = posOnlyValue ?? 0
      // 平台
      for (const p of platformCols) {
        const key = p.key
        let val = 0
        if (key === 'online') val = d.online || 0
        else if (key === 'online_cash') val = d.online_cash || 0
        else if (key === 'panda') val = d.panda || 0
        else if (key === 'twpay') val = d.twpay || 0
        else if (key === 'nft') val = d.nft || 0
        else if (key.startsWith('uber:')) val = d.uber[key.slice(5)] || 0
        ws.getRow(row).getCell(colOfKey[key]).value = val
      }
      // 實際$
      ws.getRow(row).getCell(actualCol).value = d.actual ?? 0
      // 配送（K 欄）：對齊原版改為 SUM(央廚分組)，公式在下方統一寫
      // 品項
      //   Phase 1: 精確 match — d.items[item.name] 對到 colOfItem[(vg,name)]
      //   Phase 2: fuzzy match — 處理 receipts 把 vendor_name 跟 item_name 拼一起的情況
      //     例如 "惠敘感熱紙"（vendor「惠敘」+ item「感熱紙」黏在一起）→ 去掉 vg 前綴後對到「感熱紙」
      //   同名不同分組金額只填到第一個 fill，避免雙重計算
      const filledItems = new Set<string>()    // 已填值的 (vg + name) 組合
      const usedRawKeys = new Set<string>()     // d.items 已消化的 raw key

      const fillCell = (it: { name: string; vendor_group: string }, amt: number, rawKey: string) => {
        const c = colOfItem[itemKey(it)]
        if (!c || filledItems.has(itemKey(it))) return false
        const cell = ws.getRow(row).getCell(c)
        cell.value = amt
        const note = d.notes[rawKey]
        if (note) cell.note = note
        filledItems.add(itemKey(it))
        usedRawKeys.add(rawKey)
        return true
      }

      // Phase 1: 精確 match
      for (const it of items) {
        const amt = d.items[it.name]
        if (!amt || usedRawKeys.has(it.name)) continue
        fillCell(it, amt, it.name)
      }

      // Phase 2: fuzzy match（receipts vendor+item 黏一起）
      for (const [rawName, amt] of Object.entries(d.items)) {
        if (!amt || usedRawKeys.has(rawName)) continue
        for (const it of items) {
          if (filledItems.has(itemKey(it))) continue
          const vg = it.vendor_group
          // 試 vendor_group 為前綴：例「惠敘感熱紙」startsWith「惠敘」+ 剩餘 = 「感熱紙」
          if (vg && vg !== '未分類' && rawName.startsWith(vg) && rawName.slice(vg.length) === it.name) {
            if (fillCell(it, amt, rawName)) break
          }
        }
      }

      // Phase 3: 退稅自動配對
      //   `__tax_vg_{vg}__` — 帶 vendor_group 資訊，優先找 vg='退稅' 名稱含 {vg} 字串的欄位
      //                       例：vg=免洗 → 找「免洗稅金」；vg=央廚配送 → 找「X總發票」（無此命名規則時 fallback）
      //   `__tax_{cat}__`   — 只帶 category，找 vg='退稅' category 對應的欄位
      //   `{vendor}-稅`     — 已啟用對應 system_item 時走 Phase 1，否則此處 fallback
      for (const [rawName, amt] of Object.entries(d.items)) {
        if (!amt || usedRawKeys.has(rawName)) continue
        const vgMatch = rawName.match(/^__tax_vg_(.+)__$/)
        const catMatch = vgMatch ? null : rawName.match(/^__tax_(.+)__$/)
        const isVendorTax = !vgMatch && !catMatch && rawName.endsWith('-稅')
        if (!vgMatch && !catMatch && !isVendorTax) continue

        // 1) 帶 vg 的優先：找名稱含 vg 字串的退稅欄
        if (vgMatch) {
          const targetVg = vgMatch[1]
          let filled = false
          for (const it of items) {
            if (it.vendor_group !== '退稅') continue
            if (!it.name.includes(targetVg)) continue
            if (filledItems.has(itemKey(it))) continue
            if (fillCell(it, amt, rawName)) { filled = true; break }
          }
          if (filled) continue
          // fallback：用 itemMeta 推 vg 對應的 category，找該 category 的退稅欄
          const sample = items.find(i => i.vendor_group === targetVg)
          const targetCat = sample?.category ?? null
          for (const it of items) {
            if (it.vendor_group !== '退稅') continue
            if (targetCat && it.category !== targetCat) continue
            if (filledItems.has(itemKey(it))) continue
            if (fillCell(it, amt, rawName)) { filled = true; break }
          }
          if (filled) continue
        }
        // 2) 只帶 category（或 vendor-稅 命名 fallback）
        const targetCat = catMatch ? catMatch[1] : null
        for (const it of items) {
          if (it.vendor_group !== '退稅') continue
          if (targetCat && it.category !== targetCat) continue
          if (filledItems.has(itemKey(it))) continue
          if (fillCell(it, amt, rawName)) break
        }
      }
    }

    // 計算公式 — 對齊各店原版設計（H = C − 總成本 O − 平台；K = SUM 央廚分組）
    const ref = (c: number) => `${colLetter(c)}${row}`
    const ckGroupRange = ckGroupCols.length > 0
      ? `${colLetter(Math.min(...ckGroupCols))}${row}:${colLetter(Math.max(...ckGroupCols))}${row}`
      : null
    const subAllRefLocal = ref(colOfKey['sub_all'])
    ws.getRow(row).getCell(deductedCol).value = { formula: `${ref(posCol)}-${subAllRefLocal}-${platformSum(row)}` } as any
    ws.getRow(row).getCell(onsiteCol).value   = { formula: `${ref(posCol)}-${platformSum(row)}` } as any
    ws.getRow(row).getCell(ckCol).value       = ckGroupRange
      ? { formula: `SUM(${ckGroupRange})` } as any
      : (d?.ck || 0)
    ws.getRow(row).getCell(resultCol).value   = { formula: `${ref(actualCol)}-${ref(deductedCol)}-${ref(ckCol)}` } as any
    ws.getRow(row).getCell(revenueCol).value  = { formula: `IF(${ref(onsiteCol)}>0,${ref(resultCol)}+${ref(onsiteCol)},"")` } as any

    // 小計公式（對齊原版：用範圍 SUM 而非分項加總，公式更簡潔）
    //   O 總   = P + Q + R
    //   P 食材 = SUM(食材範圍)
    //   Q 耗材 = SUM(耗材範圍)
    //   R 雜項 = SUM(雜項範圍)
    const rangeOf = (cols: number[]) => cols.length > 0
      ? `${colLetter(Math.min(...cols))}${row}:${colLetter(Math.max(...cols))}${row}`
      : null
    const foodRange = rangeOf(foodCols)
    const packRange = rangeOf(packCols)
    const miscRange = rangeOf(miscCols)
    ws.getRow(row).getCell(colOfKey['sub_food']).value = foodRange ? { formula: `SUM(${foodRange})` } as any : 0
    ws.getRow(row).getCell(colOfKey['sub_pack']).value = packRange ? { formula: `SUM(${packRange})` } as any : 0
    ws.getRow(row).getCell(colOfKey['sub_misc']).value = miscRange ? { formula: `SUM(${miscRange})` } as any : 0
    ws.getRow(row).getCell(colOfKey['sub_all']).value  = {
      formula: `${ref(colOfKey['sub_food'])}+${ref(colOfKey['sub_pack'])}+${ref(colOfKey['sub_misc'])}`,
    } as any
  }

  // ────────────────────────────────────────────────
  // Row 5~35 樣式（資料列）
  // ────────────────────────────────────────────────
  for (let r = 5; r <= 35; r++) {
    // 計算欄
    for (const c of [posCol, deductedCol, onsiteCol, actualCol, ckCol, resultCol, revenueCol, ...platformCols.map(p => colOfKey[p.key])]) {
      const cell = ws.getRow(r).getCell(c)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cream } }
      cell.font = { name: FONT_DATA, size: 14, color: { argb: C.ink } }
      cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
      cell.numFmt = '#,##0'
      cell.border = thinBlack
    }
    // 小計欄（總/食/耗/雜）
    for (const k of ['sub_all', 'sub_food', 'sub_pack', 'sub_misc']) {
      const cell = ws.getRow(r).getCell(colOfKey[k])
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cream } }
      cell.font = { name: FONT_DATA, size: 14, color: { argb: C.ink } }
      cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
      cell.numFmt = '#,##0'
      cell.border = thinBlack
    }
    // 品項欄
    for (const c of allItemCols) {
      const cell = ws.getRow(r).getCell(c)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.white } }
      cell.font = { name: FONT_DATA, size: 14, color: { argb: C.ink } }
      cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
      cell.numFmt = '#,##0'
      cell.border = thinBlack
    }
  }

  // ────────────────────────────────────────────────
  // 欄寬 & 凍結
  // ────────────────────────────────────────────────
  ws.getColumn(colOfKey['date']).width = 16
  ws.getColumn(colOfKey['weekday']).width = 14
  ws.getColumn(colOfKey['pos']).width = 19
  for (const p of platformCols) ws.getColumn(colOfKey[p.key]).width = 18
  ws.getColumn(colOfKey['deducted']).width = 19
  ws.getColumn(colOfKey['onsite']).width = 18
  ws.getColumn(colOfKey['actual']).width = 19
  ws.getColumn(colOfKey['ck']).width = 21
  ws.getColumn(colOfKey['result']).width = 18
  ws.getColumn(colOfKey['revenue']).width = 18
  ws.getColumn(colOfKey['spacer']).width = 3
  // 小計欄要裝得下月份合計（可能 5-7 位數含千分位逗號）
  ws.getColumn(colOfKey['sub_all']).width = 19
  ws.getColumn(colOfKey['sub_food']).width = 18
  ws.getColumn(colOfKey['sub_pack']).width = 18
  ws.getColumn(colOfKey['sub_misc']).width = 18
  // 品項欄要裝得下月份合計（單品項月合計可能 4-6 位數）
  for (const c of allItemCols) ws.getColumn(c).width = 15

  ws.getRow(1).height = 26
  ws.getRow(2).height = 24
  ws.getRow(3).height = 24
  ws.getRow(4).height = 24
  for (let r = 5; r <= 35; r++) ws.getRow(r).height = 24

  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }]
}

// 細黑邊框（共用）
const thinBlack = {
  top:    { style: 'thin' as const, color: { argb: 'FF000000' } },
  bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
  left:   { style: 'thin' as const, color: { argb: 'FF000000' } },
  right:  { style: 'thin' as const, color: { argb: 'FF000000' } },
}

// ────────────────────────────────────────────────
// 對外 API
// ────────────────────────────────────────────────

/** 單月匯出（2 分頁：月度總覽 + N月食耗成本） */
export async function buildNativeWorkbook(opts: {
  year: number
  monthNum: number
  store: StoreInfo
  items: ItemDef[]
  dataByDate: Record<string, DayData>
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '結帳系統'
  wb.created = new Date()

  const stats = aggregateMonthStats(opts.items, opts.dataByDate, opts.store)
  addMonthlyOverviewSheet(wb, { year: opts.year, monthNum: opts.monthNum, store: opts.store, stats })
  addDetailSheet(wb, opts)

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/** 年度匯出（13 分頁：年度總覽 + 1月~12月） */
export async function buildAnnualWorkbook(opts: {
  year: number
  store: StoreInfo
  items: ItemDef[]
  /** key: monthNum (1-12), value: dataByDate */
  dataByMonth: Record<number, Record<string, DayData>>
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '結帳系統'
  wb.created = new Date()

  const monthlyStats: MonthStats[] = []
  for (let m = 1; m <= 12; m++) {
    monthlyStats.push(aggregateMonthStats(opts.items, opts.dataByMonth[m] ?? {}, opts.store))
  }
  addAnnualOverviewSheet(wb, { year: opts.year, store: opts.store, monthlyStats })

  for (let m = 1; m <= 12; m++) {
    addDetailSheet(wb, {
      year: opts.year,
      monthNum: m,
      store: opts.store,
      items: opts.items,
      dataByDate: opts.dataByMonth[m] ?? {},
    })
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
