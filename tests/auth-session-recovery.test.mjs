import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('受保護頁面會先在 Proxy 更新 Supabase session', async () => {
  const [proxy, sessionProxy] = await Promise.all([
    read('proxy.ts'),
    read('lib/supabase/proxy.ts'),
  ])

  assert.match(proxy, /export async function proxy/)
  assert.match(proxy, /'\/manager\/:path\*'/)
  assert.match(proxy, /'\/hq\/:path\*'/)
  assert.match(sessionProxy, /await supabase\.auth\.getClaims\(\)/)
  assert.match(sessionProxy, /request\.cookies\.set/)
  assert.match(sessionProxy, /response\.cookies\.set/)
  assert.match(sessionProxy, /refresh_token_already_used/)
  assert.match(sessionProxy, /NextResponse\.redirect\(new URL\('\/login'/)
  assert.match(sessionProxy, /isProtectedPage && isPageNavigation && !hasValidClaims/)
})

test('失效登入狀態不會再讓整個頁面崩潰', async () => {
  const [auth, errorPage] = await Promise.all([
    read('lib/authed-user.ts'),
    read('app/error.tsx'),
  ])

  assert.match(auth, /try\s*{[\s\S]*getClaims\(\)[\s\S]*}\s*catch\s*{[\s\S]*return null/)
  assert.match(errorPage, /頁面暫時無法載入/)
  assert.match(errorPage, /重新登入/)
})

test('導覽列不再一次預載所有受保護頁面', async () => {
  const [managerNav, hqNav, reliableLink] = await Promise.all([
    read('components/manager/nav.tsx'),
    read('components/hq/nav.tsx'),
    read('components/reliable-navigation-link.tsx'),
  ])

  assert.doesNotMatch(managerNav, /router\.prefetch\(/)
  assert.doesNotMatch(hqNav, /router\.prefetch\(/)
  assert.match(managerNav, /ReliableNavigationLink/)
  assert.match(hqNav, /ReliableNavigationLink/)
  assert.match(reliableLink, /prefetch=\{false\}/)
})

test('今日結帳使用站內切換但不做背景預載，避免 PWA 顯示完整頁面載入錯誤', async () => {
  const [managerNav, hqNav, dashboard, closingForm, reliableLink] = await Promise.all([
    read('components/manager/nav.tsx'),
    read('components/hq/nav.tsx'),
    read('app/manager/dashboard/page.tsx'),
    read('components/manager/closing-form.tsx'),
    read('components/reliable-navigation-link.tsx'),
  ])

  assert.doesNotMatch(managerNav, /forceDocument/)
  assert.doesNotMatch(hqNav, /forceDocument/)
  assert.doesNotMatch(dashboard, /forceDocument/)
  assert.match(closingForm, /router\.push\(`\/manager\/closing\?date=/)
  assert.doesNotMatch(reliableLink, /<a href=/)
  assert.match(reliableLink, /prefetch=\{false\}/)
})

test('進入今日結帳前會確認最新版，舊版直接切到最新部署', async () => {
  const [layout, reliableLink, versionGuard, serviceWorker] = await Promise.all([
    read('app/layout.tsx'),
    read('components/reliable-navigation-link.tsx'),
    read('components/app-version-guard.tsx'),
    read('public/sw.js'),
  ])

  assert.match(layout, /data-app-version=\{appVersion\}/)
  assert.match(reliableLink, /mustUseLatestVersion/)
  assert.match(reliableLink, /fetch\(`\/api\/version\?navigation=/)
  assert.match(reliableLink, /window\.location\.replace\(destination\.href\)/)
  assert.match(reliableLink, /router\.push\(hrefString\)/)
  assert.match(versionGuard, /SAFE_AUTO_REFRESH_PATHS/)
  assert.match(versionGuard, /VERSION_CHECK_INTERVAL_MS = 30 \* 1000/)
  assert.match(serviceWorker, /client\.navigate\(url\.href\)/)
  assert.doesNotMatch(serviceWorker, /addEventListener\(['"]fetch['"]/)
})

test('版面導覽不會與實際頁面同時發出登入跳轉', async () => {
  const [managerLayout, hqLayout] = await Promise.all([
    read('app/manager/layout.tsx'),
    read('app/hq/layout.tsx'),
  ])

  assert.match(managerLayout, /if \(!user\) return null/)
  assert.doesNotMatch(managerLayout, /if \(!user\) redirect\('\/login'\)/)
  assert.match(hqLayout, /if \(!user\) return null/)
  assert.doesNotMatch(hqLayout, /if \(!user\) redirect\('\/login'\)/)
})
