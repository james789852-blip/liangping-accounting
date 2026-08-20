import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveReportingActualVendor } from '../lib/reporting-actual-vendor.ts'

test('巷日漏填的菜商在報表中歸到環南', () => {
  assert.equal(resolveReportingActualVendor('巷日', '菜商', null), '環南')
  assert.equal(resolveReportingActualVendor('巷日', '菜商', '  '), '環南')
})

test('已填寫的實際廠商名稱優先於報表預設值', () => {
  assert.equal(resolveReportingActualVendor('巷日', '菜商', '新菜商'), '新菜商')
})

test('其他店家與分類仍維持未指定', () => {
  assert.equal(resolveReportingActualVendor('巷日', '雜貨', null), '未指定')
  assert.equal(resolveReportingActualVendor('幸福', '菜商', null), '未指定')
})
