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
