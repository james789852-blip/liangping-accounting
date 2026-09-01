import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  blankWorkbookZero,
  workbookResultValue,
} from '../lib/workbook-zero-display.ts'

const workbookSource = fs.readFileSync(new URL('../lib/food-cost-native-workbook.ts', import.meta.url), 'utf8')

test('一般試算表欄位只把真正的零顯示為空白', () => {
  assert.equal(blankWorkbookZero(0), null)
  assert.equal(blankWorkbookZero(1250), 1250)
  assert.equal(blankWorkbookZero(-1250), -1250)
})

test('結果欄已做帳的零保留，尚未做帳的日期留白', () => {
  assert.equal(workbookResultValue(0, 'draft'), 0)
  assert.equal(workbookResultValue(0, 'submitted'), 0)
  assert.equal(workbookResultValue(0, 'verified'), 0)
  assert.equal(workbookResultValue(0, 'disputed'), 0)
  assert.equal(workbookResultValue(0, 'none'), null)
  assert.equal(workbookResultValue(-20, 'verified'), -20)
})

test('店面 Excel 與 Google Sheets 共用的工作簿已套用空白零規則', () => {
  assert.match(workbookSource, /const BLANK_ZERO_NUM_FMT = '#,##0;-#,##0;'/)
  assert.match(workbookSource, /cell\.value = workbookResultValue\(dd\.variance, dd\.closingStatus\)/)
  assert.match(workbookSource, /cell\.value = blankWorkbookZero\(v\)/)
  assert.match(workbookSource, /cell\.numFmt = BLANK_ZERO_NUM_FMT/)
})
