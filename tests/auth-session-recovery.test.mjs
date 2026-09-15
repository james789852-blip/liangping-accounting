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
  const [managerNav, hqNav] = await Promise.all([
    read('components/manager/nav.tsx'),
    read('components/hq/nav.tsx'),
  ])

  assert.doesNotMatch(managerNav, /router\.prefetch\(/)
  assert.doesNotMatch(hqNav, /router\.prefetch\(/)
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
