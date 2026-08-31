import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { buildCKDataMap, ckTemplateHasStoreColumns, materializeCKCrossSheetFormulas, refreshCKFormulaResults, fillCKWorksheet, prepareCKTemplateStoreColumns } from '../lib/ck-template.ts'

test('央廚模板缺少目前店家欄位時會判定為過期', () => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('8月食耗成本')
  worksheet.getRow(3).values = ['日期', '', '府中', '幸福', '哇哥', '營業額']

  assert.equal(ckTemplateHasStoreColumns(worksheet, ['府中', '幸福']), true)
  assert.equal(ckTemplateHasStoreColumns(worksheet, ['府中', '幸福', '景新']), false)
})

test('央廚舊模板會沿用既有欄位排版並替換為目前店家', () => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('6月食耗成本')
  worksheet.getRow(3).values = ['日期', '', '府中', '幸福', '福城', '福城', '海山', '土城', '哇哥', '現場', '營業額']
  worksheet.getCell('F3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } }
  worksheet.getColumn(6).hidden = true
  worksheet.getColumn(10).hidden = true
  worksheet.getColumn(6).width = 3

  assert.equal(prepareCKTemplateStoreColumns(
    worksheet,
    ['府中', '幸福', '福城', '心惦', '景新', '海山', '土城', '沐香'],
  ), true)
  assert.deepEqual(
    Array.from({ length: 8 }, (_, offset) => worksheet.getRow(3).getCell(3 + offset).value),
    ['府中', '幸福', '福城', '心惦', '景新', '海山', '土城', '沐香'],
  )
  assert.equal(worksheet.getCell('F3').fill.fgColor.argb, 'FFFF0000')
  assert.equal(worksheet.getColumn(6).hidden, false)
  assert.equal(worksheet.getColumn(10).hidden, false)
  assert.ok(worksheet.getColumn(6).width >= 12)
})

test('Excel 與 Google 會將跨分頁公式固定為相同結果並保留同分頁公式', () => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('8月食耗成本')
  worksheet.getCell('A1').value = { formula: "SUM('統計'!A1:A3)", result: 123 }
  worksheet.getCell('A2').value = { formula: 'SUM(B2:C2)' }

  materializeCKCrossSheetFormulas(worksheet)

  assert.equal(worksheet.getCell('A1').value, 123)
  assert.deepEqual(worksheet.getCell('A2').value, { formula: 'SUM(B2:C2)' })
})

test('央廚 Excel 會更新同分頁公式的暫存結果以吻合 Google', () => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('8月食耗成本')
  worksheet.getCell('Q1').value = '退稅'
  worksheet.getCell('R1').value = '一般'
  worksheet.getCell('Q2').value = '發票'
  worksheet.getCell('R2').value = '收據'
  worksheet.getCell('Q4').value = 100
  worksheet.getCell('R4').value = 50
  worksheet.getCell('AC4').value = 10
  worksheet.getCell('BO4').value = 5
  worksheet.getCell('N1').value = { formula: 'SUMIFS(Q4:R4,Q2:R2,"發票",Q1:R1,"退稅")+P1+AC4', result: 999 }
  worksheet.getCell('N2').value = { formula: 'SUMIFS(Q4:R4,Q2:R2,"發票")-BO4', result: 999 }
  worksheet.getCell('P2').value = { formula: 'SUMIFS(Q4:R4,Q2:R2,"收據")' }
  worksheet.getCell('C5').value = 10
  worksheet.getCell('C6').value = 20
  worksheet.getCell('C7').value = null
  worksheet.getCell('C8').value = { formula: 'AVERAGE(C5:C7)', result: 999 }
  worksheet.getCell('C9').value = { formula: 'MAX(C5:C7)-MIN(C5:C7)', result: 999 }
  worksheet.getCell('D1').value = { formula: "'統計'!A1", result: 7 }
  worksheet.getCell('D2').value = { formula: '100-D1', result: 999 }
  worksheet.getCell('D3').value = { formula: '1-1', result: 999 }
  worksheet.getCell('C10').value = { formula: 'SUM(C5:C6)', result: 999 }
  worksheet.getCell('D5').value = 30
  worksheet.getCell('D6').value = 40
  worksheet.getCell('D10').value = { sharedFormula: 'C10', result: 999 }

  materializeCKCrossSheetFormulas(worksheet)
  refreshCKFormulaResults(worksheet)

  assert.equal(worksheet.getCell('D1').value, 7)
  assert.equal(worksheet.getCell('N1').value.result, 110)
  assert.equal(worksheet.getCell('N2').value.result, 95)
  assert.equal(worksheet.getCell('P2').value.result, 50)
  assert.equal(worksheet.getCell('C8').value.result, 15)
  assert.equal(worksheet.getCell('C9').value.result, 10)
  assert.equal(worksheet.getCell('D2').value.result, 93)
  assert.equal(worksheet.getCell('D3').value, 0)
  assert.equal(worksheet.getCell('D10').value.formula, 'SUM(D5:D6)')
  assert.equal(worksheet.getCell('D10').value.result, 70)
})

test('Excel 與 Google 共用相同的央廚每日資料組裝', () => {
  const dataMap = buildCKDataMap(
    [{ id: 'r1', business_date: '2026-08-01' }],
    [
      { ck_daily_record_id: 'r1', store_id: 's1', external_store_name: null, amount: 999, ck_confirmed_amount: 100 },
      { ck_daily_record_id: 'r1', store_id: null, external_store_name: '外店', amount: 200, ck_confirmed_amount: null },
    ],
    [
      { ck_daily_record_id: 'r1', category: '食材', item_name: '雞肉', amount: 30 },
      { ck_daily_record_id: 'r1', category: '耗材', item_name: '紙盒', amount: '20' },
      { ck_daily_record_id: 'r1', category: '其他', item_name: '運費', amount: 10 },
    ],
    { s1: '府中' },
  )
  assert.deepEqual(dataMap['2026-08-01'], {
    storeRevenues: { 府中: 100, 外店: 200 },
    expenses: { 雞肉: 30, 紙盒: 20, 運費: 10 },
    foodTotal: 30,
    packTotal: 20,
    miscTotal: 10,
    totalRevenue: 300,
    totalExpense: 60,
  })
})

test('央廚舊月份模板會更新日期並以資料庫金額取代跨分頁公式', () => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('6月食耗成本')
  worksheet.getRow(3).values = ['日期', '', '梁鑫', '公館', '營業額', '食材', '耗材', '雜項', '總']
  worksheet.getCell('A4').value = '6月'
  worksheet.getCell('D5').value = { formula: "SUM('體系外店家'!C4:G4)" }
  worksheet.getCell('E5').value = { formula: 'SUM(C5:D5)' }
  worksheet.getCell('C5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } }
  worksheet.getCell('D5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } }

  const result = fillCKWorksheet(worksheet, ['2026-08-01', '2026-08-02'], {
    '2026-08-01': {
      storeRevenues: { 梁鑫: 100, 公館: 200 },
      expenses: {},
      foodTotal: 10,
      packTotal: 20,
      miscTotal: 30,
      totalRevenue: 300,
      totalExpense: 60,
    },
  })

  assert.ok(result)
  assert.equal(worksheet.name, '8月食耗成本')
  assert.equal(worksheet.getCell('A4').value, '8月')
  assert.ok(worksheet.getCell('A5').value instanceof Date)
  assert.equal(worksheet.getCell('A5').value.toISOString(), '2026-08-01T00:00:00.000Z')
  assert.equal(worksheet.getCell('B5').value, '星期六')
  assert.equal(worksheet.getCell('C5').value, 100)
  assert.equal(worksheet.getCell('D5').value, 200)
  assert.equal(worksheet.getCell('D6').value, null)
  assert.equal(worksheet.getCell('D5').fill.fgColor.argb, 'FFFFFFCC')
  assert.equal(worksheet.getCell('E5').value, 300)
  assert.equal(worksheet.getCell('C4').value, 100)
  assert.equal(worksheet.getCell('D4').value, 200)
  assert.equal(worksheet.getCell('E4').value, 300)
  assert.equal(worksheet.getCell('F4').value, 10)
  assert.equal(worksheet.getCell('G4').value, 20)
  assert.equal(worksheet.getCell('H4').value, 30)
  assert.equal(worksheet.getCell('I4').value, 60)
  assert.ok(worksheet.getColumn(5).width >= '300'.length + 2)
})
