import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { sortUsersByTitle } from '../lib/user-title-order.ts'

const usersPage = await readFile(new URL('../app/hq/users/page.tsx', import.meta.url), 'utf8')
const createDialog = await readFile(new URL('../components/hq/user-create-dialog.tsx', import.meta.url), 'utf8')

test('每個店面與央廚群組都能直接新增並預選該單位管理者', () => {
  assert.match(usersPage, /initialUnitId=\{storeId\}/)
  assert.match(usersPage, /triggerLabel="新增管理者"/)
  assert.match(createDialog, /initialUnitId\?: string/)
  assert.match(createDialog, /setUnitId\(defaultUnitId\)/)
  assert.match(createDialog, /title: defaultTitle/)
})

test('店面人員依店長、副店長、小幫手順序顯示', () => {
  const users = [
    { name: '甲', title: '小幫手', role: '小幫手' },
    { name: '乙', title: '副店長', role: '副店長' },
    { name: '丙', title: '店長', role: '店長' },
    { name: '丁', title: '副店長', role: '副店長' },
  ]

  assert.deepEqual(sortUsersByTitle(users).map(user => user.name), ['丙', '乙', '丁', '甲'])
  assert.match(usersPage, /sortUsersByTitle\(users\)/)
})
