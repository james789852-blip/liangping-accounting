import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ckOrderNeedsDeliveryPhoto,
  normalizeCKDeliveryPhotoUrls,
} from '../lib/ck-delivery-photos.ts'

test('有叫貨金額但沒有配送單照片時不可送出', () => {
  assert.equal(ckOrderNeedsDeliveryPhoto(1200, []), true)
  assert.equal(ckOrderNeedsDeliveryPhoto(1200, null), true)
})

test('零元或已附配送單的叫貨可送出', () => {
  assert.equal(ckOrderNeedsDeliveryPhoto(0, []), false)
  assert.equal(ckOrderNeedsDeliveryPhoto(null, []), false)
  assert.equal(ckOrderNeedsDeliveryPhoto(1200, ['https://example.com/delivery.jpg']), false)
})

test('配送單網址會去除空白、空值與重複項目', () => {
  assert.deepEqual(
    normalizeCKDeliveryPhotoUrls([' a.jpg ', '', null, 'a.jpg', 'b.jpg']),
    ['a.jpg', 'b.jpg'],
  )
})
