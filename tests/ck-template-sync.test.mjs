import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { ckTemplateHasStoreColumns, clearCKCrossSheetFormulas, fillCKWorksheet, prepareCKTemplateStoreColumns } from '../lib/ck-template.ts'

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

test('Google 只同步月分頁時會移除跨分頁公式並保留同分頁公式', () => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('8月食耗成本')
  worksheet.getCell('A1').value = { formula: "SUM('統計'!A1:A3)" }
  worksheet.getCell('A2').value = { formula: 'SUM(B2:C2)' }

  clearCKCrossSheetFormulas(worksheet)

  assert.equal(worksheet.getCell('A1').value, null)
  assert.deepEqual(worksheet.getCell('A2').value, { formula: 'SUM(B2:C2)' })
})

test('央廚舊月份模板會更新日期並以資料庫金額取代跨分頁公式', () => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('6月食耗成本')
  worksheet.getRow(3).values = ['日期', '', '梁鑫', '公館', '營業額', '食材', '耗材', '雜項', '總']
  worksheet.getCell('A4').value = '6月'
  worksheet.getCell('D5').value = { formula: "SUM('體系外店家'!C4:G4)" }
  worksheet.getCell('E5').value = { formula: 'SUM(C5:D5)' }

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
  assert.equal(worksheet.getCell('B5').value, '星期六')
  assert.equal(worksheet.getCell('C5').value, 100)
  assert.equal(worksheet.getCell('D5').value, 200)
  assert.equal(worksheet.getCell('D6').value, null)
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
