import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { supabasePreviewUrl, supabaseThumbUrl } from '../lib/photo-image-url.ts'

const publicPhoto = 'https://demo.supabase.co/storage/v1/object/public/receipts/store/receipt.jpg'

test('核對清單縮圖只請求小尺寸圖片', () => {
  const url = new URL(supabaseThumbUrl(publicPhoto, 160, 160))
  assert.equal(url.pathname, '/storage/v1/render/image/public/receipts/store/receipt.jpg')
  assert.equal(url.searchParams.get('width'), '160')
  assert.equal(url.searchParams.get('height'), '160')
  assert.equal(url.searchParams.get('resize'), 'cover')
  assert.equal(url.searchParams.get('quality'), '55')
})

test('全螢幕核對使用清晰但較輕量且不裁切的預覽圖', () => {
  const url = new URL(supabasePreviewUrl(publicPhoto))
  assert.equal(url.pathname, '/storage/v1/render/image/public/receipts/store/receipt.jpg')
  assert.equal(url.searchParams.get('width'), '1400')
  assert.equal(url.searchParams.get('height'), '1800')
  assert.equal(url.searchParams.get('resize'), 'contain')
  assert.equal(url.searchParams.get('quality'), '72')
})

test('非 Supabase 圖片網址維持原網址', () => {
  const url = 'https://example.com/receipt.jpg'
  assert.equal(supabaseThumbUrl(url, 160, 160), url)
  assert.equal(supabasePreviewUrl(url), url)
})

test('總公司逐張核對使用閱讀版圖片並預先載入相鄰照片', () => {
  const source = fs.readFileSync(new URL('../components/hq/review-card.tsx', import.meta.url), 'utf8')
  assert.match(source, /image\.src = supabasePreviewUrl\(url\)/)
  assert.match(source, /preloadReviewPhotos\(reviewIndex\)/)
  assert.match(source, /width=\{1400\}/)
  assert.match(source, /height=\{1800\}/)
  assert.match(source, /resize="contain"/)
  assert.match(source, /quality=\{72\}/)
})

test('總公司逐張核對照片可開啟所有裝置共用的放大檢視器', () => {
  const source = fs.readFileSync(new URL('../components/hq/review-card.tsx', import.meta.url), 'utf8')
  assert.match(source, /onClick=\{\(\) => currentPhoto && setLightboxIdx\(reviewIndex\)\}/)
  assert.match(source, /點擊放大/)
  assert.match(source, /aria-label=\{currentPhoto \? `放大檢視\$\{currentPhoto\.label\}`/)
})

test('照片檢視器支援按鈕、滾輪、雙指縮放與拖曳', () => {
  const source = fs.readFileSync(new URL('../components/hq/photo-lightbox.tsx', import.meta.url), 'utf8')
  assert.match(source, /const MAX_SCALE = 5/)
  assert.match(source, /onWheel=\{event =>/)
  assert.match(source, /onPointerDown=\{handlePointerDown\}/)
  assert.match(source, /pinchDistance\.current/)
  assert.match(source, /touchAction: 'none'/)
  assert.match(source, /aria-label="放大照片"/)
  assert.match(source, /aria-label="縮小照片"/)
  assert.match(source, /aria-label="恢復原始大小"/)
})
