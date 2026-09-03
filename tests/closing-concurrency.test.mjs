import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const closingFormSource = await readFile(
  new URL('../components/manager/closing-form.tsx', import.meta.url),
  'utf8',
)
const closingActionsSource = await readFile(
  new URL('../app/actions/closings.ts', import.meta.url),
  'utf8',
)

test('結帳草稿必須以 updated_at 版本鎖阻止舊頁面覆蓋', () => {
  assert.match(closingFormSource, /\.eq\('updated_at', baseUpdatedAt\)/)
  assert.match(closingFormSource, /markEditConflict\(current\?\.manager_id, current\?\.updated_at\)/)
})

test('載入時尚無帳目但別頁已建立時不可直接接手覆蓋', () => {
  assert.match(
    closingFormSource,
    /setClosingId\(existing\.id\)[\s\S]*?markEditConflict\(existing\.manager_id, existing\.updated_at\)[\s\S]*?return null/,
  )
})

test('零用金與單據修改也必須帶版本條件', () => {
  assert.match(closingActionsSource, /if \(expectedUpdatedAt\) updateQuery = updateQuery\.eq\('updated_at', expectedUpdatedAt\)/)
  assert.match(closingFormSource, /expectedUpdatedAt: oldReceipt\.updated_at/)
  assert.match(closingFormSource, /deleteQuery = deleteQuery\.eq\('updated_at', receipt\.updated_at\)/)
})
