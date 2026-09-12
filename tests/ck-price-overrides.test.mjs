import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { applyCKPriceOverrides } from '../lib/ck-price-overrides.ts'

const prices = [
  { id: 'fish-ball', item_name: '魚丸', unit_price: 380, unit: '包', excel_column: '魚丸' },
  { id: 'meat-ball', item_name: '貢丸', unit_price: 360, unit: '包', excel_column: '貢丸' },
]

test('applies an HQ price exception only to the selected store business date and item', () => {
  const overrides = [
    { id: 'match', central_kitchen_price_id: 'fish-ball', store_id: 'fuzhong', business_date: '2026-09-12', unit_price: 365, reason: '已提前下訂' },
    { id: 'other-store', central_kitchen_price_id: 'meat-ball', store_id: 'banqiao', business_date: '2026-09-12', unit_price: 1 },
    { id: 'other-date', central_kitchen_price_id: 'meat-ball', store_id: 'fuzhong', business_date: '2026-09-13', unit_price: 2 },
  ]

  const result = applyCKPriceOverrides(prices, overrides, 'fuzhong', '2026-09-12')

  assert.equal(result[0].unit_price, 365)
  assert.equal(result[0].default_unit_price, 380)
  assert.equal(result[0].daily_override?.reason, '已提前下訂')
  assert.equal(result[1].unit_price, 360)
  assert.equal(result[1].daily_override, undefined)
  assert.equal(prices[0].unit_price, 380, 'base HQ price must not be mutated')
})

test('the store closing UI can consume exceptions but cannot manage them', async () => {
  const [closingPage, closingForm, priceActions] = await Promise.all([
    readFile(new URL('../app/manager/closing/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/manager/closing-form.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/actions/ck-prices.ts', import.meta.url), 'utf8'),
  ])

  assert.match(closingPage, /central_kitchen_price_overrides/)
  assert.match(closingForm, /已套用總公司單日特例/)
  assert.doesNotMatch(closingForm, /upsertCKPriceOverride|deleteCKPriceOverride/)
  assert.match(priceActions, /const auth = await requireCKPriceManager\(\)/)
})

test('database uniqueness guarantees one exception per store, date, and item', async () => {
  const migration = await readFile(new URL('../supabase/migrations/068_ck_store_daily_price_overrides.sql', import.meta.url), 'utf8')
  assert.match(migration, /UNIQUE \(store_id, business_date, central_kitchen_price_id\)/)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE[^;]+FROM authenticated/s)
})
