import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  isUnavailableForReportMonth,
  nextMonthStart,
  taipeiCalendarMonthStart,
  unavailablePeriodsFromStatusEvents,
} from '../lib/item-mapping-availability.ts'

const actions = fs.readFileSync(new URL('../app/actions/item-mappings.ts', import.meta.url), 'utf8')
const mappingSource = fs.readFileSync(new URL('../lib/mapping-based-items.ts', import.meta.url), 'utf8')
const storeWorkbook = fs.readFileSync(new URL('../lib/food-cost-native-workbook.ts', import.meta.url), 'utf8')
const ckWorkbook = fs.readFileSync(new URL('../lib/ck-native-workbook.ts', import.meta.url), 'utf8')
const managerUI = fs.readFileSync(new URL('../components/hq/item-mappings-client.tsx', import.meta.url), 'utf8')

test('停用當月保留，從次月起月報欄位才隱藏', () => {
  const periods = [{ unavailable_from: '2026-10-01', unavailable_until: null }]
  assert.equal(isUnavailableForReportMonth('2026-08', periods), false)
  assert.equal(isUnavailableForReportMonth('2026-09', periods), false)
  assert.equal(isUnavailableForReportMonth('2026-10', periods), true)
  assert.equal(isUnavailableForReportMonth('2027-01', periods), true)
})

test('重新啟用月份恢復欄位，停用區間內的月份維持不顯示', () => {
  const periods = [{ unavailable_from: '2026-10-01', unavailable_until: '2026-12-01' }]
  assert.equal(isUnavailableForReportMonth('2026-10', periods), true)
  assert.equal(isUnavailableForReportMonth('2026-11', periods), true)
  assert.equal(isUnavailableForReportMonth('2026-12', periods), false)
})

test('稽核事件可還原多次停用區間，同月反悔不會改動月報', () => {
  const periods = unavailablePeriodsFromStatusEvents([
    { event_type: 'item_mapping_disabled', created_at: '2026-09-02T00:00:00Z', metadata: { unavailable_from: '2026-10-01' } },
    { event_type: 'item_mapping_reactivated', created_at: '2026-11-02T00:00:00Z', metadata: { available_from: '2026-11-01' } },
    { event_type: 'item_mapping_disabled', created_at: '2026-12-02T00:00:00Z', metadata: { unavailable_from: '2027-01-01' } },
    { event_type: 'item_mapping_reactivated', created_at: '2026-12-20T00:00:00Z', metadata: { available_from: '2026-12-01' } },
  ])
  assert.deepEqual(periods, [{ unavailable_from: '2026-10-01', unavailable_until: '2026-11-01' }])
})

test('台北月份與跨年次月計算不受伺服器時區影響', () => {
  assert.equal(taipeiCalendarMonthStart(new Date('2026-08-31T16:30:00.000Z')), '2026-09-01')
  assert.equal(nextMonthStart('2026-12-01'), '2027-01-01')
})

test('單筆、批次與整個分類都只標記停用，不刪除歷史 mapping', () => {
  assert.match(actions, /export async function deleteItemMapping[\s\S]*?recordMappingDisabled/)
  assert.match(actions, /export async function batchDeleteItemMappings[\s\S]*?recordMappingDisabled/)
  assert.match(actions, /export async function deleteVendorGroupWithItems[\s\S]*?recordMappingDisabled/)
  assert.match(actions, /export async function reactivateItemMapping/)
})

test('新帳目只讀啟用品項，店面與央廚報表都按月份讀取', () => {
  assert.match(mappingSource, /disabledAtFromStatusEvents\(eventsByMapping\.get\(mapping\.id as string\)/)
  assert.match(storeWorkbook, /getStoreItemsFromMappings\(storeId, \{ reportMonth \}\)/)
  assert.match(ckWorkbook, /getStoreItemsFromMappings\(ckStoreId, \{ reportMonth:/)
})

test('管理介面清楚標示安全停用並提供重新啟用', () => {
  assert.match(managerUI, /已安全停用品項/)
  assert.match(managerUI, /本月與過去月份報表仍保留原欄位與金額/)
  assert.match(managerUI, /reactivateItemMapping/)
  assert.match(managerUI, /安全停用（保留歷史帳目與本月報表）/)
})

test('使用既有稽核日誌記錄狀態，不需要刪除 mapping 或變更正式資料庫結構', () => {
  assert.match(actions, /event_type: ITEM_MAPPING_DISABLED_EVENT/)
  assert.match(actions, /event_type: ITEM_MAPPING_REACTIVATED_EVENT/)
  assert.match(actions, /item_mapping_id: mapping\.id/)
})
