import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const usersPage = await readFile(new URL('../app/hq/users/page.tsx', import.meta.url), 'utf8')
const createDialog = await readFile(new URL('../components/hq/user-create-dialog.tsx', import.meta.url), 'utf8')

test('每個店面與央廚群組都能直接新增並預選該單位管理者', () => {
  assert.match(usersPage, /initialUnitId=\{storeId\}/)
  assert.match(usersPage, /triggerLabel="新增管理者"/)
  assert.match(createDialog, /initialUnitId\?: string/)
  assert.match(createDialog, /setUnitId\(defaultUnitId\)/)
  assert.match(createDialog, /title: defaultTitle/)
})
