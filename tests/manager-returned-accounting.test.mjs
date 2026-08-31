import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('店面今日狀態會獨立查詢所有尚未修正的歷史退回帳目', () => {
  const source = fs.readFileSync(new URL('../app/manager/dashboard/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /select\('id, business_date, dispute_note, disputed_at, updated_at'\)/)
  assert.match(source, /\.eq\('status', 'disputed'\)/)
  assert.match(source, /href: `\/manager\/edit\/\$\{item\.id\}`/)
  assert.match(source, /<ReturnedAccountingAlert items=\{returnedClosings\} entityLabel="店面帳目"/)
})

test('央廚今日狀態也會列出所有尚未修正的退回帳目', () => {
  const source = fs.readFileSync(new URL('../app/manager/dashboard/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /<ReturnedAccountingAlert items=\{returnedRecords\} entityLabel="央廚帳目"/)
  assert.doesNotMatch(source, /\.eq\('status', 'disputed'\)[\s\S]{0,160}\.limit\(6\)/)
})

test('總公司退回店面帳目後會立即失效店長狀態與歷史頁快取', () => {
  const source = fs.readFileSync(new URL('../app/actions/closings.ts', import.meta.url), 'utf8')
  const disputeStart = source.indexOf('export async function disputeClosing')
  const disputeEnd = source.indexOf('/**\n * 原子性把帳目狀態改為 submitted', disputeStart)
  const disputeSource = source.slice(disputeStart, disputeEnd)
  assert.match(disputeSource, /revalidatePath\('\/manager\/dashboard'\)/)
  assert.match(disputeSource, /revalidatePath\('\/manager\/history'\)/)
})
