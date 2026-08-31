import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const addStoreForm = await readFile(new URL('../components/hq/add-store-form.tsx', import.meta.url), 'utf8')
const storeEditor = await readFile(new URL('../components/hq/store-editor.tsx', import.meta.url), 'utf8')
const storeActions = await readFile(new URL('../app/actions/stores.ts', import.meta.url), 'utf8')
const storesPage = await readFile(new URL('../app/hq/stores/page.tsx', import.meta.url), 'utf8')

test('新增店家只能按建立按鈕，不會由 Enter 鍵送出', () => {
  assert.doesNotMatch(addStoreForm, /onKeyDown=\{[^\n]*handleSubmit/)
  assert.match(addStoreForm, /<button type="button" onClick=\{handleSubmit\}/)
})

test('停用店家會先確認、檢查更新結果並保留歷史帳務', () => {
  assert.match(storeEditor, /window\.confirm\(/)
  assert.match(storeEditor, /停用店家/)
  assert.match(storeActions, /export async function deactivateStore\(storeId: string\)/)
  assert.match(storeActions, /\.update\(\{ active: false \}\)/)
  assert.match(storeActions, /\.select\('id'\)/)
  assert.match(storeActions, /if \(!deactivated\)/)
})

test('店家管理保留已停用店家並清楚標示狀態', () => {
  assert.match(storesPage, /type, active, assigned_store_ids/)
  assert.doesNotMatch(storesPage, /google_sheets_id'\)\n\s*\.eq\('active', true\)/)
  assert.match(storeEditor, /已停用/)
  assert.match(storeEditor, /disabled=\{!isActive\}/)
})

test('已停用店家可以重新啟用並沿用既有資料', () => {
  assert.match(storeEditor, /handleActivate/)
  assert.match(storeEditor, /重新啟用/)
  assert.match(storeActions, /export async function activateStore\(storeId: string\)/)
  assert.match(storeActions, /\.update\(\{ active: true \}\)/)
  assert.match(storeActions, /if \(!activated\)/)
})
