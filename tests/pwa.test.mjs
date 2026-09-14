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

test('Service Worker 不快取帳目頁面，斷線導覽改顯示安全備援頁', () => {
  const workerSource = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  const offlineSource = fs.readFileSync(new URL('../public/offline.html', import.meta.url), 'utf8')

  assert.match(workerSource, /e\.request\.mode === 'navigate'/)
  assert.match(workerSource, /fetch\(e\.request\)\.catch\(\(\) => caches\.match\(OFFLINE_URL\)\)/)
  assert.match(workerSource, /PRECACHE_URLS/)
  assert.match(offlineSource, /離線時無法送出帳目或照片/)
  assert.match(offlineSource, /重新連線/)
})

test('手機版使用獨立捲動容器，底部選單不會隨 iOS 頁面捲動漂移', () => {
  const globalSource = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  const hqLayoutSource = fs.readFileSync(new URL('../app/hq/layout.tsx', import.meta.url), 'utf8')
  const managerLayoutSource = fs.readFileSync(new URL('../app/manager/layout.tsx', import.meta.url), 'utf8')
  const hqNavSource = fs.readFileSync(new URL('../components/hq/nav.tsx', import.meta.url), 'utf8')
  const managerNavSource = fs.readFileSync(new URL('../components/manager/nav.tsx', import.meta.url), 'utf8')
  const rootLayoutSource = fs.readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')

  assert.match(hqLayoutSource, /mobile-app-shell/)
  assert.match(hqLayoutSource, /mobile-app-content/)
  assert.match(managerLayoutSource, /mobile-app-shell/)
  assert.match(managerLayoutSource, /mobile-app-content/)
  assert.match(hqNavSource, /mobile-bottom-nav/)
  assert.match(managerNavSource, /mobile-bottom-nav/)
  assert.doesNotMatch(hqNavSource, /mobile-bottom-nav[^\n]*backdrop-blur/)
  assert.doesNotMatch(managerNavSource, /mobile-bottom-nav[^\n]*backdrop-blur/)
  assert.match(globalSource, /\.mobile-app-shell[\s\S]*height: 100dvh/)
  assert.match(globalSource, /\.mobile-app-content[\s\S]*overflow-y: auto/)
  assert.match(globalSource, /\.mobile-bottom-nav[\s\S]*position: fixed/)
  assert.match(globalSource, /\.mobile-bottom-nav[\s\S]*translate3d\(0, 0, 0\)/)
  assert.match(rootLayoutSource, /viewportFit: 'cover'/)
  assert.match(rootLayoutSource, /interactiveWidget: 'resizes-content'/)
})
