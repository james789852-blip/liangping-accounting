import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../components/hq/ck-overview.tsx', import.meta.url), 'utf8')
const uploader = fs.readFileSync(new URL('../lib/client-photo-upload.ts', import.meta.url), 'utf8')
const ckForm = fs.readFileSync(new URL('../components/manager/ck-daily-form.tsx', import.meta.url), 'utf8')
const closingForm = fs.readFileSync(new URL('../components/manager/closing-form.tsx', import.meta.url), 'utf8')

test('補款照片會先壓縮並以簽名網址直接上傳，不再把原圖送進 Server Action', () => {
  assert.match(source, /await uploadClientPhoto\(\{/)
  assert.match(uploader, /await compressImage\(rawFile\)/)
  assert.match(uploader, /await createSignedUploadUrl\(bucket, uploadPath\)/)
  assert.match(uploader, /\.uploadToSignedUrl\(uploadPath, signed\.token, file, \{ contentType \}\)/)
  assert.doesNotMatch(source, /uploadToStorage\(formData, 'receipts', path\)/)
})

test('補款照片支援常見手機格式並提供明確的檔案限制', () => {
  assert.match(uploader, /heic: 'image\/heic'/)
  assert.match(uploader, /heif: 'image\/heif'/)
  assert.match(source, /MAX_REIMBURSEMENT_PHOTO_BYTES = 20 \* 1024 \* 1024/)
  assert.match(uploader, /只支援 JPG、PNG、WebP、HEIC 或 HEIF 圖片/)
  assert.match(uploader, /照片檔案過大/)
})

test('店面與央廚所有日常帳目照片共用跨裝置直傳流程', () => {
  assert.match(ckForm, /uploadClientPhoto\(\{ rawFile, bucket: 'receipts', path \}\)/)
  assert.match(closingForm, /uploadClientPhoto\(\{ rawFile, bucket: 'receipts', path \}\)/)
  assert.doesNotMatch(ckForm, /uploadToStorage\(/)
  assert.doesNotMatch(closingForm, /uploadToStorage\(/)
})
