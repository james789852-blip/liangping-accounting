import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../components/hq/ck-overview.tsx', import.meta.url), 'utf8')

test('補款照片會先壓縮並以簽名網址直接上傳，不再把原圖送進 Server Action', () => {
  assert.match(source, /await compressImage\(rawFile\)/)
  assert.match(source, /await createSignedUploadUrl\('receipts', path\)/)
  assert.match(source, /\.uploadToSignedUrl\(path, signed\.token, file, \{ contentType \}\)/)
  assert.doesNotMatch(source, /uploadToStorage\(formData, 'receipts', path\)/)
})

test('補款照片支援常見手機格式並提供明確的檔案限制', () => {
  assert.match(source, /heic: 'image\/heic'/)
  assert.match(source, /heif: 'image\/heif'/)
  assert.match(source, /MAX_REIMBURSEMENT_PHOTO_BYTES = 20 \* 1024 \* 1024/)
  assert.match(source, /只支援 JPG、PNG、WebP、HEIC 或 HEIF 圖片/)
  assert.match(source, /照片檔案過大，請選擇 20MB 以下的照片/)
})
