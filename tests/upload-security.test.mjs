import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isAllowedExcelFile,
  isAllowedImageMimeType,
  isUuid,
  parseStorageTarget,
} from '../lib/upload-security.ts'

const storeId = '10000000-0000-0000-0000-000000000005'

test('storage paths resolve only explicit store and central-kitchen namespaces', () => {
  assert.equal(isUuid(storeId), true)
  assert.deepEqual(parseStorageTarget('receipts', `stores/${storeId}/2026-08-14/receipts/a.jpg`), {
    kind: 'store',
    storeId,
  })
  assert.deepEqual(parseStorageTarget('receipts', `central-kitchens/${storeId}/2026-08-14/expenses/a.jpg`), {
    kind: 'central-kitchen',
    storeId,
  })
  assert.deepEqual(parseStorageTarget('meeting-reports', `${storeId}/a.jpg`), {
    kind: 'store',
    storeId,
  })
  assert.equal(parseStorageTarget('receipts', `other/${storeId}/a.jpg`), null)
  assert.equal(parseStorageTarget('receipts', 'stores/not-a-uuid/a.jpg'), null)
})

test('uploads accept supported images and xlsx files only', () => {
  assert.equal(isAllowedImageMimeType('image/jpeg; charset=binary'), true)
  assert.equal(isAllowedImageMimeType('image/svg+xml'), false)
  assert.equal(isAllowedExcelFile('template.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), true)
  assert.equal(isAllowedExcelFile('template.xls', 'application/vnd.ms-excel'), false)
  assert.equal(isAllowedExcelFile('template.xlsx.exe', 'application/octet-stream'), false)
})
