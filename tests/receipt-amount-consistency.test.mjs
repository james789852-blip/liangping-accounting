import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { syncSingleReceiptItemAmount } from '../lib/receipt-amount-consistency.ts'

test('editing a single-item receipt always replaces a stale detail amount', () => {
  const result = syncSingleReceiptItemAmount(
    [{ item_name: '發票', amount: 5_300, quantity: 1 }],
    3_300,
  )

  assert.deepEqual(result, [{ item_name: '發票', amount: 3_300, quantity: 1 }])
})

test('single-item tax receipt uses the untaxed amount', () => {
  const result = syncSingleReceiptItemAmount(
    [{ item_name: '免洗用品', amount: 9_000 }],
    9_450,
    450,
  )

  assert.equal(result[0].amount, 9_000)
})

test('explicit tax detail stays intact while its only base item follows the edited total', () => {
  const result = syncSingleReceiptItemAmount(
    [
      { item_name: '免洗用品', amount: 10_000 },
      { item_name: '免洗稅金', amount: 450 },
    ],
    9_450,
    450,
  )

  assert.deepEqual(result, [
    { item_name: '免洗用品', amount: 9_000 },
    { item_name: '免洗稅金', amount: 450 },
  ])
})

test('single fixed-negative item keeps the negative receipt amount', () => {
  const result = syncSingleReceiptItemAmount(
    [{ item_name: '退貨', amount: -40 }],
    -25,
  )

  assert.equal(result[0].amount, -25)
})

test('multi-item receipt keeps user-entered allocation unchanged', () => {
  const items = [
    { item_name: '米', amount: 3_900 },
    { item_name: '咖哩', amount: 750 },
  ]

  assert.deepEqual(syncSingleReceiptItemAmount(items, 4_870), items)
})

test('closing editor updates the receipt and its items through the guarded server action', () => {
  const source = fs.readFileSync(new URL('../components/manager/closing-form.tsx', import.meta.url), 'utf8')
  const editBlock = source.slice(source.indexOf('async function handleSaveReceiptEdit'), source.indexOf('async function uploadPendingReceiptPhoto'))

  assert.match(editBlock, /await updateReceipt\(editingReceiptId/)
  assert.match(editBlock, /expectedUpdatedAt: oldReceipt\.updated_at/)
  assert.doesNotMatch(editBlock, /from\('receipt_items'\)\.delete/)
})

test('server update preserves photo and uses optimistic concurrency', () => {
  const source = fs.readFileSync(new URL('../app/actions/receipts.ts', import.meta.url), 'utf8')

  assert.match(source, /photo_url: payload\.photoUrl/)
  assert.match(source, /payload\.expectedUpdatedAt/)
  assert.match(source, /syncSingleReceiptItemAmount\(payload\.items/)
})
