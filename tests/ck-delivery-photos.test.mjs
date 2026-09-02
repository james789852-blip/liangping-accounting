import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  ckOrderNeedsDeliveryPhoto,
  ckOrderNeedsTransferPhoto,
  memberDeliveryPhotosFromStoreClosings,
  normalizeCKDeliveryPhotoUrls,
  normalizeCKTransferPhotoUrls,
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

test('只有開啟要求且有叫貨金額時，才必須上傳轉帳成功照片', () => {
  assert.equal(ckOrderNeedsTransferPhoto(1200, true, []), true)
  assert.equal(ckOrderNeedsTransferPhoto(1200, true, ['https://example.com/transfer.jpg']), false)
  assert.equal(ckOrderNeedsTransferPhoto(1200, false, []), false)
  assert.equal(ckOrderNeedsTransferPhoto(0, true, []), false)
  assert.deepEqual(
    normalizeCKTransferPhotoUrls([' a.jpg ', '', null, 'a.jpg', 'b.jpg']),
    ['a.jpg', 'b.jpg'],
  )
})

test('體系內配送單照片只取店面結帳上傳並依店家整理', () => {
  assert.deepEqual(
    memberDeliveryPhotosFromStoreClosings([
      { store_id: 'store-a', ck_delivery_photo_url: ' https://example.com/a.jpg ' },
      { store_id: 'store-a', ck_delivery_photo_url: 'https://example.com/a.jpg' },
      { store_id: 'store-b', ck_delivery_photo_url: 'https://example.com/b.jpg' },
      { store_id: 'store-c', ck_delivery_photo_url: ' ' },
      { store_id: null, ck_delivery_photo_url: 'https://example.com/ignored.jpg' },
    ]),
    {
      'store-a': ['https://example.com/a.jpg'],
      'store-b': ['https://example.com/b.jpg'],
    },
  )
})

test('央廚體系內叫貨不再要求或儲存配送照片，體系外仍需照片', () => {
  const actionSource = fs.readFileSync(new URL('../app/actions/ck.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(actionSource, /missingMemberPhotos/)
  assert.match(actionSource, /missingExternalPhotos/)
  assert.match(actionSource, /體系外叫貨尚未上傳配送單照片/)

  const formSource = fs.readFileSync(new URL('../components/manager/ck-daily-form.tsx', import.meta.url), 'utf8')
  assert.match(formSource, /央廚不需重複上傳/)
  assert.match(formSource, /體系外叫貨配送單/)

  const overviewSource = fs.readFileSync(new URL('../app/hq/ck/page.tsx', import.meta.url), 'utf8')
  assert.match(overviewSource, /ck_delivery_photo_url/)
  assert.match(overviewSource, /memberDeliveryPhotosFromStoreClosings/)
})

test('總公司切換央廚對帳日期後仍從店面帳目同步配送單照片', () => {
  const detailSource = fs.readFileSync(new URL('../lib/ck-daily-detail.ts', import.meta.url), 'utf8')

  assert.match(detailSource, /select\('store_id, total_cost, ck_delivery_photo_url'\)/)
  assert.match(detailSource, /memberDeliveryPhotosFromStoreClosings/)
  assert.match(detailSource, /deliveryPhotoUrls: memberDeliveryPhotosByStore\[storeId\] \?\? \[\]/)
})

test('總公司央廚對帳表使用固定欄寬並明確區分兩邊輸入', () => {
  const overviewSource = fs.readFileSync(new URL('../components/hq/ck-overview.tsx', import.meta.url), 'utf8')

  assert.match(overviewSource, /grid-cols-\[minmax\(180px,1fr\)_84px_136px_136px_92px\]/)
  assert.match(overviewSource, /店面輸入<\/span>/)
  assert.match(overviewSource, /央廚輸入<\/span>/)
  assert.match(overviewSource, /memberTotalDiff === 0 \? '相符'/)
})

test('體系外店家可個別要求轉帳照片，伺服器強制驗證並保留每日快照', () => {
  const actionSource = fs.readFileSync(new URL('../app/actions/ck.ts', import.meta.url), 'utf8')
  const formSource = fs.readFileSync(new URL('../components/manager/ck-daily-form.tsx', import.meta.url), 'utf8')
  const editorSource = fs.readFileSync(new URL('../components/hq/store-editor.tsx', import.meta.url), 'utf8')
  const migrationSource = fs.readFileSync(new URL('../supabase/migrations/067_ck_external_transfer_photos.sql', import.meta.url), 'utf8')

  assert.match(editorSource, /要求轉帳照片/)
  assert.match(editorSource, /updateCKExternalStoreTransferPhotoRequirement/)
  assert.match(formSource, /轉帳成功照片/)
  assert.match(formSource, /transfer-records/)
  assert.match(actionSource, /ckOrderNeedsTransferPhoto/)
  assert.match(actionSource, /請先上傳轉帳成功照片/)
  assert.match(actionSource, /existingRequirementByName\.has\(name\)/)
  assert.match(actionSource, /transfer_photo_required: o\.transferPhotoRequired/)
  assert.match(migrationSource, /ck_external_stores[\s\S]*transfer_photo_required boolean NOT NULL DEFAULT false/)
  assert.match(migrationSource, /ck_store_orders[\s\S]*transfer_photo_required boolean NOT NULL DEFAULT false/)
  assert.match(migrationSource, /transfer_photo_urls jsonb NOT NULL DEFAULT '\[\]'::jsonb/)
})

test('總公司可同時查看體系外配送單與轉帳成功紀錄', () => {
  const pageSource = fs.readFileSync(new URL('../app/hq/ck/page.tsx', import.meta.url), 'utf8')
  const overviewSource = fs.readFileSync(new URL('../components/hq/ck-overview.tsx', import.meta.url), 'utf8')
  const documentsSource = fs.readFileSync(new URL('../app/hq/accounting/documents/page.tsx', import.meta.url), 'utf8')

  assert.match(pageSource, /transfer_photo_required, transfer_photo_urls/)
  assert.match(overviewSource, /轉帳成功紀錄/)
  assert.match(documentsSource, /category: 'remittance'/)
  assert.match(documentsSource, /轉帳成功紀錄/)
})
