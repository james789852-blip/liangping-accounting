import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

test('收據保留照片上傳與手動輸入，但不再呼叫 AI 辨識', async () => {
  const source = await readFile('components/manager/receipt-upload.tsx', 'utf8')
  assert.match(source, /照片上傳中/)
  assert.match(source, /setStep\('review'\)/)
  assert.doesNotMatch(source, /recognize-receipt|AI 辨識|Gemini|Sparkles/)
  assert.equal(await exists('app/api/recognize-receipt/route.ts'), false)
})

test('AI SDK 已移除，不會再被打包到正式系統', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  assert.equal(pkg.dependencies?.['@google/generative-ai'], undefined)
  assert.equal(pkg.dependencies?.['@anthropic-ai/sdk'], undefined)
})

test('影片入口與新上傳權限已移除，但歷史資料 migration 保留', async () => {
  const uploadAction = await readFile('app/actions/upload.ts', 'utf8')
  const initialSchema = await readFile('supabase/migrations/001_initial_schema.sql', 'utf8')
  assert.equal(await exists('app/hq/videos/page.tsx'), false)
  assert.doesNotMatch(uploadAction, /ALLOWED_BUCKETS[^\n]*menu-videos/)
  assert.match(initialSchema, /create table menu_videos/)
})
