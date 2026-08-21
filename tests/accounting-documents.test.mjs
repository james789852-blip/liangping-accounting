import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  accountingCategoryFromConfiguredDocTypes,
  accountingCategoryFromDocType,
  accountingCategoryFromReceiptType,
  matchesAccountingDocument,
  normalizeAccountingDateRange,
  normalizeAccountingPhotoUrls,
} from '../lib/accounting-documents.ts'

test('單據類型會整理成總公司照片分類', () => {
  assert.equal(accountingCategoryFromReceiptType('invoice'), 'invoice')
  assert.equal(accountingCategoryFromReceiptType('receipt'), 'receipt')
  assert.equal(accountingCategoryFromReceiptType('delivery_note'), 'delivery')
  assert.equal(accountingCategoryFromDocType('公司開'), 'company_invoice')
  assert.equal(accountingCategoryFromDocType('估價單'), 'estimate')
  assert.equal(accountingCategoryFromDocType('配送單'), 'delivery')
  assert.equal(accountingCategoryFromDocType(''), 'other')
  assert.equal(accountingCategoryFromConfiguredDocTypes(['收據', '收據']), 'receipt')
  assert.equal(accountingCategoryFromConfiguredDocTypes(['發票']), 'invoice')
  assert.equal(accountingCategoryFromConfiguredDocTypes(['公司開']), 'company_invoice')
  assert.equal(accountingCategoryFromConfiguredDocTypes([]), 'other')
  assert.equal(accountingCategoryFromConfiguredDocTypes(['發票', '收據']), 'other')
})

test('照片查詢一次限制在 31 天且會交換反向日期', () => {
  assert.deepEqual(normalizeAccountingDateRange('2026-08-20', '2026-08-01', '2026-08-20'), {
    from: '2026-08-01',
    to: '2026-08-20',
    wasClamped: false,
  })
  assert.deepEqual(normalizeAccountingDateRange('2026-08-01', '2026-09-01', '2026-08-20'), {
    from: '2026-08-02',
    to: '2026-09-01',
    wasClamped: true,
  })
})

test('央廚照片網址會去空值、空白與重複', () => {
  assert.deepEqual(normalizeAccountingPhotoUrls([' a.jpg ', '', null, 'a.jpg', 'b.jpg']), ['a.jpg', 'b.jpg'])
})

test('照片可依分類、店名、廠商與品項關鍵字篩選', () => {
  const document = {
    id: '1',
    url: 'https://example.com/a.jpg',
    locationId: 'store-1',
    locationName: '巷日店',
    locationKind: 'store',
    businessDate: '2026-08-20',
    category: 'invoice',
    title: '環南市場',
    subtitle: '雞肉、蔬菜',
  }
  assert.equal(matchesAccountingDocument(document, 'invoice', '雞肉'), true)
  assert.equal(matchesAccountingDocument(document, 'all', '巷日'), true)
  assert.equal(matchesAccountingDocument(document, 'receipt', ''), false)
  assert.equal(matchesAccountingDocument({ ...document, vendorGroup: '環南' }, 'all', '', '環南'), true)
  assert.equal(matchesAccountingDocument({ ...document, vendorGroup: '環南' }, 'all', '', '振源'), false)
  assert.equal(matchesAccountingDocument({ ...document, itemCategory: '雜項' }, 'all', '', 'all', '雜項'), true)
  assert.equal(matchesAccountingDocument({ ...document, itemCategory: '雜項' }, 'all', '', 'all', '食材'), false)
})

test('總公司單據頁會彙整店面與央廚所有主要照片來源', () => {
  const source = fs.readFileSync(new URL('../app/hq/accounting/documents/page.tsx', import.meta.url), 'utf8')
  for (const expected of [
    "from('receipts')",
    "from('daily_closings')",
    "from('item_column_mappings')",
    "from('ck_daily_records')",
    "from('ck_expense_items')",
    "from('ck_store_orders')",
    'delivery_photo_urls',
    'hq_reimbursement_photo_urls',
    'doc_type_override',
    'accountingCategoryFromConfiguredDocTypes(configuredDocTypes)',
    'name="vendor"',
    'name="itemCategory"',
  ]) {
    assert.match(source, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.doesNotMatch(source, /accountingCategoryFromReceiptType\(receipt\.receipt_type\)/)

  const gallerySource = fs.readFileSync(new URL('../components/hq/accounting-documents-gallery.tsx', import.meta.url), 'utf8')
  assert.match(gallerySource, /單據：\{document\.documentTypeLabel/)
  assert.match(gallerySource, /廠商：\{document\.vendorGroup/)
  assert.match(gallerySource, /品項：\{document\.itemCategory/)

  const locationSelectSource = fs.readFileSync(new URL('../components/hq/accounting-location-select.tsx', import.meta.url), 'utf8')
  assert.match(locationSelectSource, /vendorSelect\.value = 'all'/)
  assert.match(locationSelectSource, /form\.requestSubmit\(\)/)
})
