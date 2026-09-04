import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildAuditChanges, sanitizeAuditMetadata } from '../lib/audit-metadata.ts'
import {
  auditMetadataLabel,
  auditPrimitiveText,
  deriveLegacyCKRecordChanges,
} from '../lib/audit-display.ts'

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
  assert.match(auditClientSource, />修改前</)
  assert.match(auditClientSource, />修改後</)
  assert.match(auditClientSource, /本次操作的完整內容/)
  assert.match(auditClientSource, /SEVERITY_LABELS\[log\.severity\]/)
  assert.doesNotMatch(auditClientSource, /JSON\.stringify\(log\.metadata/)
})

test('操作軌跡的英文欄位與系統值會顯示為繁體中文', () => {
  assert.equal(auditMetadataLabel('expenses'), '支出明細')
  assert.equal(auditMetadataLabel('category'), '分類')
  assert.equal(auditMetadataLabel('doc_type'), '單據類型')
  assert.equal(auditMetadataLabel('payer_name'), '付款人')
  assert.equal(auditMetadataLabel('vendor_group'), '廠商分類')
  assert.equal(auditMetadataLabel('has_receipt_photo'), '已附單據照片')
  assert.equal(auditMetadataLabel('unknown_internal_field'), '其他資料')
  assert.equal(auditPrimitiveText('submitted'), '待審核')
  assert.equal(auditPrimitiveText('info'), '一般')
  assert.equal(auditPrimitiveText(true), '是')
})

test('舊版央廚快照會與上一筆紀錄比較出修改前後差異', () => {
  const changes = deriveLegacyCKRecordChanges(
    {
      status: 'draft',
      member_orders: null,
      expenses: [{ category: '食材', item_name: '順正', amount: 50850 }],
      receipt_photo_count: 2,
    },
    [{
      status: 'draft',
      member_orders: [{ store_id: 'store-1', amount: 1000 }],
      expenses: [{ category: '食材', item_name: '順正', amount: 49850 }],
      receipt_photo_count: 1,
    }],
  )

  assert.deepEqual(changes, [
    {
      field: 'expenses',
      label: '支出明細',
      before: [{ category: '食材', item_name: '順正', amount: 49850 }],
      after: [{ category: '食材', item_name: '順正', amount: 50850 }],
    },
    { field: 'receipt_photo_count', label: '單據照片數', before: 1, after: 2 },
  ])
})

test('刪除帳目時保留舊操作軌跡並保存刪除前快照', () => {
  assert.match(closingActionsSource, /detachClosingAuditLogs\(admin, closing\.id\)/)
  assert.match(closingActionsSource, /before: snapshot/)
  assert.doesNotMatch(closingActionsSource, /audit_logs'\)\.delete\(\)\.eq\('closing_id'/)
})
