import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const aggregatorSource = await readFile(
  new URL('../lib/ck-aggregator.ts', import.meta.url),
  'utf8',
)

test('央廚舊月份會用歷史訂單補查已解除配送店家的名稱', () => {
  assert.match(aggregatorSource, /const historicalMemberStoreIds = \(orders \?\? \[\]\)/)
  assert.match(aggregatorSource, /new Set\(\[\.\.\.assignedIds, \.\.\.historicalMemberStoreIds\]\)/)
  assert.match(aggregatorSource, /\.in\('id', memberStoreIds\)/)
  assert.match(aggregatorSource, /store_name: memberStoreMap\[o\.store_id\] \?\? o\.store_id/)
})

test('央廚當月仍保留目前指派但尚未叫貨的店家欄位', () => {
  assert.match(aggregatorSource, /memberStoreOrder\.map\(m => \(\{/)
  assert.match(aggregatorSource, /total: memberMap\[m\.id\]\?\.total \?\? 0/)
})
