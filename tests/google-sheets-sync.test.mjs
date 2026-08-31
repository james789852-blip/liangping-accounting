import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const closingsAction = fs.readFileSync(new URL('../app/actions/closings.ts', import.meta.url), 'utf8')
const ckAction = fs.readFileSync(new URL('../app/actions/ck.ts', import.meta.url), 'utf8')
const closingsUI = fs.readFileSync(new URL('../components/hq/closings-browser.tsx', import.meta.url), 'utf8')
const ckUI = fs.readFileSync(new URL('../components/hq/ck-overview.tsx', import.meta.url), 'utf8')
const storeEditor = fs.readFileSync(new URL('../components/hq/store-editor.tsx', import.meta.url), 'utf8')
const sheetsModule = fs.readFileSync(new URL('../lib/google-sheets.ts', import.meta.url), 'utf8')

test('店面帳目核准後會同步 Google Sheets，失敗時留下操作軌跡', () => {
  assert.match(closingsAction, /import \{ syncClosingToSheets, syncMonthToSheets \} from '@\/lib\/google-sheets'/)
  assert.match(closingsAction, /await syncVerifiedClosingToSheets\(/)
  assert.match(closingsAction, /eventType: 'sheets_sync_failed'/)
})

test('店面與央廚手動同步 action 都會驗證權限與月份', () => {
  assert.match(closingsAction, /export async function reSyncMonthToSheets\(storeId: string, month: string\)/)
  assert.match(closingsAction, /canReviewClosings\(profile\)/)
  assert.match(ckAction, /export async function syncCKMonthToSheets\(ckStoreId: string, month: string\)/)
  assert.match(ckAction, /canManageCKSettingsPermission\(profile\)/)
  assert.match(closingsAction, /MONTH_PATTERN\.test\(month\)/)
  assert.match(ckAction, /MONTH_PATTERN\.test\(month\)/)
})

test('總公司介面可綁定試算表並手動重同步', () => {
  assert.match(storeEditor, /google_sheets_id: googleSheetsId\.trim\(\) \|\| null/)
  assert.match(storeEditor, /Google Sheets 試算表 ID/)
  assert.match(closingsUI, /onClick=\{handleSync\}/)
  assert.match(ckUI, /<SyncSection key=.*ckStoreId=\{d\.ckStore\.id\}/)
})

test('Google Sheets 整合只能載入在伺服器端', () => {
  assert.match(sheetsModule, /^import 'server-only'/)
  assert.match(sheetsModule, /此店家尚未綁定 Google 試算表/)
})
