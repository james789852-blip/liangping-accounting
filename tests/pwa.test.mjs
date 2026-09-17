import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('PWA manifest 提供安裝、獨立視窗與手機圖示設定', () => {
  const manifestSource = fs.readFileSync(new URL('../app/manifest.ts', import.meta.url), 'utf8')

  assert.match(manifestSource, /id: '\/'/)
  assert.match(manifestSource, /scope: '\/'/)
  assert.match(manifestSource, /display: 'standalone'/)
  assert.match(manifestSource, /purpose: 'maskable'/)
  assert.match(manifestSource, /theme_color: '#f59e0b'/)
})

test('全站提供 Android 安裝按鈕、iPhone 加入主畫面教學與斷線提示', () => {
  const shellSource = fs.readFileSync(new URL('../components/pwa-shell.tsx', import.meta.url), 'utf8')
  const layoutSource = fs.readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')

  assert.match(layoutSource, /<PWAShell \/>/)
  assert.match(layoutSource, /appleWebApp:/)
  assert.match(shellSource, /beforeinstallprompt/)
  assert.match(shellSource, /安裝結帳系統/)
  assert.match(shellSource, /加入主畫面/)
  assert.match(shellSource, /目前沒有網路，帳目與照片暫時無法送出/)
  assert.match(shellSource, /網路已恢復，可以繼續操作/)
})

test('Service Worker 僅保留推播，不攔截頁面與靜態資源載入', () => {
  const workerSource = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

  assert.doesNotMatch(workerSource, /addEventListener\('fetch'/)
  assert.doesNotMatch(workerSource, /respondWith\(/)
  assert.doesNotMatch(workerSource, /caches\.match\(/)
  assert.doesNotMatch(workerSource, /caches\.open\(/)
  assert.match(workerSource, /addEventListener\('push'/)
  assert.match(workerSource, /addEventListener\('notificationclick'/)
  assert.match(workerSource, /showNotification\(title/)
  assert.match(workerSource, /client\.navigate\(destination\)/)
  assert.match(workerSource, /key\.startsWith\('lp-'\)/)
})

test('手機導覽改為左上角抽屜並釋放底部操作空間', () => {
  const globalSource = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  const hqLayoutSource = fs.readFileSync(new URL('../app/hq/layout.tsx', import.meta.url), 'utf8')
  const managerLayoutSource = fs.readFileSync(new URL('../app/manager/layout.tsx', import.meta.url), 'utf8')
  const hqNavSource = fs.readFileSync(new URL('../components/hq/nav.tsx', import.meta.url), 'utf8')
  const managerNavSource = fs.readFileSync(new URL('../components/manager/nav.tsx', import.meta.url), 'utf8')
  const rootLayoutSource = fs.readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')

  assert.match(hqLayoutSource, /min-h-screen/)
  assert.match(managerLayoutSource, /min-h-screen/)
  assert.doesNotMatch(hqLayoutSource, /mobile-app-shell/)
  assert.doesNotMatch(managerLayoutSource, /mobile-app-shell/)
  assert.doesNotMatch(hqNavSource, /mobile-bottom-nav/)
  assert.doesNotMatch(managerNavSource, /mobile-bottom-nav/)
  assert.doesNotMatch(globalSource, /\.mobile-bottom-nav/)
  assert.match(hqNavSource, /aria-label="開啟功能選單"/)
  assert.match(managerNavSource, /aria-label="開啟功能選單"/)
  assert.match(hqNavSource, /aria-modal="true" aria-label="功能選單"/)
  assert.match(managerNavSource, /aria-modal="true" aria-label="功能選單"/)
  assert.match(hqNavSource, /absolute inset-y-0 left-0 flex w-\[min\(86vw,360px\)\]/)
  assert.match(managerNavSource, /absolute inset-y-0 left-0 flex w-\[min\(86vw,340px\)\]/)
  assert.match(globalSource, /@media \(max-width: 1023px\)[\s\S]*\.app-layout-root \{[\s\S]*height: 100dvh[\s\S]*overflow: hidden/)
  assert.match(globalSource, /@media \(max-width: 1023px\)[\s\S]*\.app-content-shell \{[\s\S]*overflow-y: auto[\s\S]*safe-area-inset-bottom/)
  assert.match(hqLayoutSource, /app-content-shell min-h-0/)
  assert.match(managerLayoutSource, /app-content-shell min-h-0/)
  assert.doesNotMatch(hqLayoutSource, /pb-20/)
  assert.doesNotMatch(managerLayoutSource, /pb-20/)
  assert.match(rootLayoutSource, /viewportFit: 'cover'/)
})

test('總公司帳目上方不再顯示照片捷徑，避免手機功能列溢出', () => {
  const accountingSource = fs.readFileSync(new URL('../components/hq/accounting-client.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(accountingSource, /accounting\/documents\?from=/)
})

test('手機頂端只保留端別與通知，HR 和端別切換集中在抽屜最上方', () => {
  const mappingSource = fs.readFileSync(new URL('../components/hq/item-mappings-client.tsx', import.meta.url), 'utf8')
  const notificationSource = fs.readFileSync(new URL('../components/notification-center.tsx', import.meta.url), 'utf8')
  const hqNavSource = fs.readFileSync(new URL('../components/hq/nav.tsx', import.meta.url), 'utf8')
  const managerNavSource = fs.readFileSync(new URL('../components/manager/nav.tsx', import.meta.url), 'utf8')
  const globalSource = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  const hqMobileHeader = hqNavSource.slice(hqNavSource.indexOf('{/* ── 手機頂部 */}'), hqNavSource.indexOf('{/* ── 手機左側功能選單 */}'))
  const managerMobileHeader = managerNavSource.slice(managerNavSource.indexOf('{/* ── 手機頂部 */}'), managerNavSource.indexOf('{/* ── 手機左側功能選單 */}'))

  assert.match(mappingSource, /bottom-\[calc\(1rem\+env\(safe-area-inset-bottom\)\)\]/)
  assert.match(notificationSource, /createPortal\(/)
  assert.match(notificationSource, /relative flex h-10 w-10[\s\S]*lg:hidden/)
  assert.match(notificationSource, /fixed bottom-6 right-6[\s\S]*hidden h-12 w-12[\s\S]*lg:flex/)
  assert.doesNotMatch(notificationSource, /top-\[calc\(4\.25rem/)
  assert.doesNotMatch(hqNavSource, /desktop-notification-slot/)
  assert.doesNotMatch(managerNavSource, /desktop-notification-slot/)
  assert.match(hqMobileHeader, /mobile-header-notification[\s\S]*<NotificationCenter \/>/)
  assert.match(managerMobileHeader, /mobile-header-notification[\s\S]*<NotificationCenter \/>/)
  assert.doesNotMatch(hqMobileHeader, /HR_SYSTEM_URL/)
  assert.doesNotMatch(managerMobileHeader, /HR_SYSTEM_URL/)
  assert.match(hqNavSource, /快速入口[\s\S]*HR 系統[\s\S]*(?:總公司端|店長端)/)
  assert.match(managerNavSource, /快速入口[\s\S]*HR 系統[\s\S]*總公司端/)
  assert.match(hqNavSource, /hq-mobile-header-title[^"]*overflow-hidden/)
  assert.match(globalSource, /\.closing-form-bottom-bar \{[\s\S]*bottom: 0;[\s\S]*padding-bottom: calc\(0\.75rem \+ env\(safe-area-inset-bottom, 0px\)\)/)
  assert.match(globalSource, /\.manager-sticky-action-bar \{[\s\S]*bottom: 0;/)
})
