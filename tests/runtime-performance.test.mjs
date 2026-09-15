import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('production layout records real-user speed metrics', () => {
  const source = fs.readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')

  assert.match(source, /@vercel\/speed-insights\/next/)
  assert.match(source, /<SpeedInsights \/>/)
})

test('production font is bundled locally and never blocks a build on Google Fonts', () => {
  const layout = fs.readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
  const globalCss = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

  assert.match(layout, /@fontsource-variable\/noto-sans-tc/)
  assert.doesNotMatch(layout, /next\/font\/google/)
  assert.match(globalCss, /'Noto Sans TC Variable'/)
})

test('immutable photo paths receive one-year browser and CDN caching', () => {
  const clientUploader = fs.readFileSync(new URL('../lib/client-photo-upload.ts', import.meta.url), 'utf8')
  const serverUploader = fs.readFileSync(new URL('../app/actions/upload.ts', import.meta.url), 'utf8')
  const receiptUploader = fs.readFileSync(new URL('../components/manager/receipt-upload.tsx', import.meta.url), 'utf8')
  const meetingUploader = fs.readFileSync(new URL('../components/manager/section-photo-grid.tsx', import.meta.url), 'utf8')

  assert.match(clientUploader, /cacheControl: '31536000'/)
  assert.match(serverUploader, /bucket === 'excel-templates' \? \{\} : \{ cacheControl: '31536000' \}/)
  assert.match(receiptUploader, /cacheControl: '31536000'/)
  assert.match(meetingUploader, /cacheControl: '31536000'/)
})

test('database migration indexes the production database hot paths that are still uncovered', () => {
  const source = fs.readFileSync(new URL('../supabase/migrations/075_runtime_performance_indexes.sql', import.meta.url), 'utf8')

  assert.match(source, /idx_receipts_store_date/)
  assert.match(source, /idx_receipt_items_receipt/)
  assert.match(source, /idx_ck_daily_records_date_status/)
  assert.match(source, /idx_ck_expense_items_daily_record_sort/)
  assert.match(source, /idx_audit_logs_event_created/)
  assert.match(source, /idx_audit_logs_metadata_gin/)
  assert.match(source, /idx_user_profiles_store_ids_gin/)
  assert.match(source, /WHERE status = 'disputed'/)
  assert.doesNotMatch(source, /CREATE INDEX IF NOT EXISTS idx_ck_daily_records_store_date/)
  assert.doesNotMatch(source, /CREATE INDEX IF NOT EXISTS idx_ck_store_orders_daily_record/)
})
