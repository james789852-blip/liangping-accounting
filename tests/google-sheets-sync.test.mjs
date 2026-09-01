import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const closingsAction = fs.readFileSync(new URL('../app/actions/closings.ts', import.meta.url), 'utf8')
const ckAction = fs.readFileSync(new URL('../app/actions/ck.ts', import.meta.url), 'utf8')
const accountingUI = fs.readFileSync(new URL('../components/hq/accounting-client.tsx', import.meta.url), 'utf8')
const ckUI = fs.readFileSync(new URL('../components/hq/ck-overview.tsx', import.meta.url), 'utf8')
const storeEditor = fs.readFileSync(new URL('../components/hq/store-editor.tsx', import.meta.url), 'utf8')
const sheetsModule = fs.readFileSync(new URL('../lib/google-sheets.ts', import.meta.url), 'utf8')
const ckNativeWorkbook = fs.readFileSync(new URL('../lib/ck-native-workbook.ts', import.meta.url), 'utf8')
const monthCron = fs.readFileSync(new URL('../app/api/cron/ensure-month-sheets/route.ts', import.meta.url), 'utf8')
const vercelConfig = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

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

test('央廚審核通過後會自動同步 Google Sheets', () => {
  assert.match(ckAction, /if \(decision === 'verified'\)/)
  assert.match(ckAction, /await syncCKMonthToSheetsImpl\(ckStoreId, date\.slice\(0, 7\)\)/)
  assert.match(ckAction, /央廚 \$\{date\.slice\(0, 7\)\} 審核後試算表同步失敗/)
})

test('央廚 Google Sheets 與系統下載 Excel 共用原生工作簿', () => {
  assert.match(sheetsModule, /import \{ buildCKNativeWorkbook \} from '@\/lib\/ck-native-workbook'/)
  assert.match(sheetsModule, /await buildCKNativeWorkbook\(ckStoreId, year, monthNum\)/)
  assert.match(sheetsModule, /for \(const \[worksheetIndex, ws\] of workbook\.worksheets\.entries\(\)\)/)
  assert.match(sheetsModule, /gridProperties: \{ rowCount: gridRowCount, columnCount: gridColumnCount \}/)
  assert.doesNotMatch(sheetsModule, /download\(`ck-\$\{ckStoreId\}\.xlsx`\)/)
})

test('Google Sheets 合併儲存格跨過凍結線時保留 Excel 合併排版', () => {
  assert.match(sheetsModule, /m\.r0 < frozenRowCount && m\.r1 > frozenRowCount/)
  assert.match(sheetsModule, /m\.c0 < frozenColumnCount && m\.c1 > frozenColumnCount/)
})

test('央廚沒有廠商明細時總計為零，不會產生自我加總循環公式', () => {
  assert.match(ckNativeWorkbook, /cell\.value = rows\.length > 0/)
  assert.match(ckNativeWorkbook, /SUM\(\$\{letter\}4:\$\{letter\}\$\{totalRow - 1\}\)/)
  assert.doesNotMatch(ckNativeWorkbook, /Math\.max\(4, totalRow - 1\)/)
})

test('總公司介面可綁定試算表並手動重同步', () => {
  assert.match(storeEditor, /google_sheets_id: googleSheetsId\.trim\(\) \|\| null/)
  assert.match(storeEditor, /Google Sheets 試算表 ID/)
  assert.match(accountingUI, /同步試算表/)
  assert.match(accountingUI, /reSyncMonthToSheets\(storeId, month\)/)
  assert.match(accountingUI, /syncCKMonthToSheets\(storeId, month\)/)
  assert.match(ckUI, /<SyncSection key=.*ckStoreId=\{d\.ckStore\.id\}/)
})

test('Google Sheets 整合只能載入在伺服器端', () => {
  assert.match(sheetsModule, /^import 'server-only'/)
  assert.match(sheetsModule, /此店家尚未綁定 Google 試算表/)
})

test('店面 Google Sheets 與當月 Excel 共用原生活頁簿', () => {
  assert.match(sheetsModule, /import \{ buildFoodCostNativeWorkbook \} from '@\/lib\/food-cost-native-workbook'/)
  assert.match(sheetsModule, /await buildFoodCostNativeWorkbook\(storeId, year, monthNum\)/)
  assert.match(sheetsModule, /for \(const worksheet of workbook\.worksheets\)/)
  assert.match(sheetsModule, /const tabName = `\$\{year\}年\$\{worksheet\.name\}`/)
  assert.match(sheetsModule, /await writeDateColumnsAsText\(sheets, sheetsId, tabName, worksheet\)/)
  assert.match(sheetsModule, /valueInputOption: 'RAW'/)
  assert.doesNotMatch(sheetsModule, /EXCEL_COLUMNS/)
})

test('新月份即使尚無帳目，也能直接由 Excel 工作簿建立試算表分頁', () => {
  assert.match(sheetsModule, /export async function syncStoreMonthToSheets\(storeId: string, month: string\)/)
  assert.match(sheetsModule, /await syncStoreMonthToSheetsImpl\(storeId, businessDate\.slice\(0, 7\), true\)/)
  assert.match(sheetsModule, /await syncStoreMonthToSheets\(storeId, month\)/)
  assert.doesNotMatch(sheetsModule, /此月份無帳目資料/)
})

test('每天台北時間午夜會補建所有已綁定店面與央廚的當月分頁', () => {
  assert.match(sheetsModule, /export async function ensureMonthSheetsTabs/)
  assert.match(sheetsModule, /timeZone: 'Asia\/Taipei'/)
  assert.match(sheetsModule, /\.eq\('active', true\)/)
  assert.match(sheetsModule, /\.not\('google_sheets_id', 'is', null\)/)
  assert.match(sheetsModule, /if \(target\.type === '央廚'\)/)
  assert.match(monthCron, /process\.env\.CRON_SECRET/)
  assert.match(monthCron, /await ensureMonthSheetsTabs\(\)/)
  assert.deepEqual(vercelConfig.crons, [{
    path: '/api/cron/ensure-month-sheets',
    schedule: '0 16 * * *',
  }])
})
