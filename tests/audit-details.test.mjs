import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildAuditChanges, sanitizeAuditMetadata } from '../lib/audit-metadata.ts'

const auditClientSource = await readFile(
  new URL('../components/hq/audit-client.tsx', import.meta.url),
  'utf8',
)
const closingActionsSource = await readFile(
  new URL('../app/actions/closings.ts', import.meta.url),
  'utf8',
)

test('操作軌跡會產生欄位層級的修改前後差異', () => {
  assert.deepEqual(
    buildAuditChanges(
      { status: 'submitted', amount: 100, untouched: true },
      { status: 'verified', amount: 120, untouched: true },
      { status: '帳目狀態', amount: '金額' },
    ),
    [
      { field: 'status', label: '帳目狀態', before: 'submitted', after: 'verified' },
      { field: 'amount', label: '金額', before: 100, after: 120 },
    ],
  )
})

test('操作軌跡遞迴遮蔽密碼、Token 與私鑰', () => {
  const sanitized = sanitizeAuditMetadata({
    password: 'birth-date',
    nested: { api_token: 'secret-token', note: 'Bearer abc.def.ghi' },
    privateKeyText: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    amount: 5200,
  })
  assert.deepEqual(sanitized, {
    password: '[敏感資料已遮蔽]',
    nested: { api_token: '[敏感資料已遮蔽]', note: 'Bearer [敏感資料已遮蔽]' },
    privateKeyText: '[敏感資料已遮蔽]',
    amount: 5200,
  })
})

test('操作軌跡展開區使用可讀明細而非只有原始 JSON', () => {
  assert.match(auditClientSource, /變更欄位（\{changes\.length\}）/)
  assert.match(auditClientSource, /完整操作內容/)
  assert.doesNotMatch(auditClientSource, /JSON\.stringify\(log\.metadata/)
})

test('刪除帳目時保留舊操作軌跡並保存刪除前快照', () => {
  assert.match(closingActionsSource, /detachClosingAuditLogs\(admin, closing\.id\)/)
  assert.match(closingActionsSource, /before: snapshot/)
  assert.doesNotMatch(closingActionsSource, /audit_logs'\)\.delete\(\)\.eq\('closing_id'/)
})
