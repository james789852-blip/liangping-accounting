import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('店長端與總公司版面會先顯示骨架並平行載入導覽資料', async () => {
  const [managerLayout, hqLayout] = await Promise.all([
    read('app/manager/layout.tsx'),
    read('app/hq/layout.tsx'),
  ])

  assert.match(managerLayout, /<Suspense fallback={<NavigationSkeleton variant="manager" \/>}>/)
  assert.match(managerLayout, /<ManagerNavigation \/>/)
  assert.match(hqLayout, /<Suspense fallback={<NavigationSkeleton variant="hq" \/>}>/)
  assert.match(hqLayout, /<HQNavigation \/>/)
})

test('帳號設定共用短快取，避免每次切頁重複查詢', async () => {
  const authSource = await read('lib/authed-user.ts')
  assert.match(authSource, /getCachedUserProfile\(claims\.sub\)/)
  assert.doesNotMatch(authSource, /\.select\('active'\)/)
})

test('短時間返回動態頁面會沿用 Router Cache', async () => {
  const config = await read('next.config.ts')
  assert.match(config, /staleTimes:\s*{[\s\S]*dynamic:\s*30/)
})

test('正式站運算節點與東京資料庫部署在同一區域', async () => {
  const vercelConfig = JSON.parse(await read('vercel.json'))
  assert.deepEqual(vercelConfig.regions, ['hnd1'])
  assert.equal(vercelConfig.fluid, true)
})

test('總公司帳目中心只預載選中店家，並避免頻繁整頁刷新', async () => {
  const [page, client] = await Promise.all([
    read('app/hq/accounting/page.tsx'),
    read('components/hq/accounting-client.tsx'),
  ])

  assert.match(page, /fetchDailyClosingWithReceipts\(initialStoreId, date\)/)
  assert.doesNotMatch(page, /from\('receipts'\)[\s\S]*?eq\('business_date', date\)/)
  assert.match(client, /setInterval\(refresh, 60_000\)/)
  assert.doesNotMatch(client, /for \(const store of ckStores\)/)
})

test('央廚帳目中心批次預載當日完整明細，切換央廚不再等待第二次請求', async () => {
  const [page, client, action] = await Promise.all([
    read('app/hq/accounting/page.tsx'),
    read('components/hq/accounting-client.tsx'),
    read('app/actions/ck-overview.ts'),
  ])

  assert.match(page, /loadCKDailyDetails\(ckStores\.map\(store => store\.id\), date\)/)
  assert.match(page, /initialCkDetailByStore={initialCkDetailByStore}/)
  assert.match(client, /Object\.entries\(initialCkDetailByStore\)/)
  assert.match(client, /const initialCached = cacheRef\.current\.get/)
  assert.match(client, /審核明細載入中…/)
  assert.match(client, /!detail && !loading/)
  assert.match(action, /getCachedUserProfile\(user\.id\)/)
  assert.doesNotMatch(action, /createClient\(\)/)
})

test('常用日期與清除操作使用站內切換而不是完整重載', async () => {
  const [ckPage, historyPage, ckForm, closingForm] = await Promise.all([
    read('app/hq/ck/page.tsx'),
    read('app/manager/history/page.tsx'),
    read('components/manager/ck-daily-form.tsx'),
    read('components/manager/closing-form.tsx'),
  ])

  for (const source of [ckPage, historyPage, ckForm, closingForm]) {
    assert.doesNotMatch(source, /<a href="\/(?:hq|manager)\//)
    assert.doesNotMatch(source, /<a href={`\/(?:hq|manager)\//)
  }
})

test('唯讀報表帳號依細分權限進入總公司，不需要取得 is_hq 寫入範圍', async () => {
  const [loginPage, homePage, hqLayout] = await Promise.all([
    read('app/login/page.tsx'),
    read('app/page.tsx'),
    read('app/hq/layout.tsx'),
  ])

  assert.match(loginPage, /hasAnyHQPermission\(profile\)/)
  assert.match(homePage, /hasAnyHQPermission\(profile\)/)
  assert.match(hqLayout, /!hasAnyHQPermission\(profile\)/)
  assert.doesNotMatch(hqLayout, /profile\.role !== '老闆' && profile\.is_hq !== true/)
})
