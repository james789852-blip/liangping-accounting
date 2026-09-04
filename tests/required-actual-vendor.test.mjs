import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  normalizeActualVendorName,
  requiredActualVendorError,
  requiresActualVendorName,
} from '../lib/required-actual-vendor.ts'

test('店面菜商、雜貨、免洗必須填寫實際廠商', () => {
  for (const group of ['菜商', '雜貨', '免洗', ' 免洗 ']) {
    assert.equal(requiresActualVendorName(group), true)
    assert.match(requiredActualVendorError(group, ''), /必須選擇或新增實際廠商名稱/)
    assert.match(requiredActualVendorError(group, '　 '), /必須選擇或新增實際廠商名稱/)
    assert.equal(requiredActualVendorError(group, '名 陽'), null)
  }
})

test('其他分類維持實際廠商選填，廠商名稱沿用既有正規化', () => {
  for (const group of ['央廚', '日常用品', '雜項', '', null]) {
    assert.equal(requiresActualVendorName(group), false)
    assert.equal(requiredActualVendorError(group, ''), null)
  }
  assert.equal(normalizeActualVendorName(' 名　陽 '), '名陽')
})

test('新增與修改收據的 Server Action 都會再次驗證必填規則', async () => {
  const source = await readFile(new URL('../app/actions/receipts.ts', import.meta.url), 'utf8')
  const checks = source.match(/requiredActualVendorError\(payload\.vendorName, payload\.actualVendorName\)/g) ?? []
  assert.equal(checks.length, 2)
})

test('今日做帳新增與修改畫面都標示必填並阻止未選實際廠商', async () => {
  const source = await readFile(new URL('../components/manager/closing-form.tsx', import.meta.url), 'utf8')
  assert.match(source, /const saveResult = await saveReceipt\(\{/)
  assert.doesNotMatch(source, /from\('receipts'\)\.insert\(/)
  assert.match(source, /實際廠商名稱（\{requiresActualVendorName\(form\.vendor_name\) \? '必填' : '選填'\}）/)
  assert.match(source, /requiredActualVendorError\(form\.vendor_name, form\.actual_vendor_name\)/)
  assert.match(source, /實際廠商名稱（\{requiresActualVendorName\(editVendor\) \? '必填' : '選填'\}）/)
  assert.match(source, /requiredActualVendorError\(editVendor, editActualVendor\)/)
})

test('先前已存成草稿的單據在整份帳目送出前仍會被攔下', async () => {
  const client = await readFile(new URL('../components/manager/closing-form.tsx', import.meta.url), 'utf8')
  const server = await readFile(new URL('../app/actions/closings.ts', import.meta.url), 'utf8')
  assert.match(client, /const missingActualVendorCount = localReceipts\.filter/)
  assert.match(client, /尚未填寫實際廠商/)
  assert.match(server, /\.eq\('business_date', meta\.businessDate\)/)
  assert.match(server, /requiredActualVendorError\(receipt\.vendor_name, receipt\.actual_vendor_name\)/)
})
