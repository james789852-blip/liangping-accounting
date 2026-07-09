// Full logical backup helper for the accounting system.
//
// Usage:
//   node scripts/backup-critical-data.mjs
//   BACKUP_STORAGE_FILES=1 node scripts/backup-critical-data.mjs
//
// The default run exports database tables as JSON and writes a manifest of
// Storage objects. Set BACKUP_STORAGE_FILES=1 only when you also want to
// download photos/templates, because that can be large.
import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = process.cwd()
const envPath = `${ROOT}/.env.local`
if (!existsSync(envPath)) {
  console.error('Missing .env.local. Run this from the project root.')
  process.exit(1)
}

const env = readFileSync(envPath, 'utf8')
const supabaseUrl = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim()
const serviceRoleKey = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim()
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  process.exit(1)
}

const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

const TABLES = [
  'companies',
  'stores',
  'user_profiles',
  'role_settings',
  'daily_closings',
  'revenue_items',
  'handwrite_orders',
  'expense_categories',
  'order_items',
  'expense_items',
  'cash_counts',
  'receipts',
  'receipt_items',
  'platform_screenshots',
  'platform_payouts',
  'payout_details',
  'review_logs',
  'audit_logs',
  'central_kitchen_prices',
  'central_kitchen_price_history',
  'ck_daily_records',
  'ck_store_orders',
  'ck_expense_items',
  'ck_vendor_groups',
  'receipt_categories',
  'receipt_vendors',
  'vendor_item_templates',
  'item_column_mappings',
  'system_vendor_groups',
  'system_items',
  'store_items',
  'meeting_reports',
  'meeting_action_items',
  'store_holidays',
]

const BUCKETS = ['receipts', 'meeting-reports', 'excel-templates']
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const dir = `${ROOT}/backups/${stamp}`
mkdirSync(`${dir}/tables`, { recursive: true })
mkdirSync(`${dir}/storage-manifests`, { recursive: true })

async function fetchAll(table) {
  const out = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb.from(table).select('*').range(from, from + pageSize - 1)
    if (error) {
      if (/does not exist|Could not find the table/i.test(error.message)) {
        console.warn(`- ${table}: skipped (${error.message})`)
        return null
      }
      throw new Error(`${table}: ${error.message}`)
    }
    out.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  return out
}

async function listStorageRecursive(bucket, prefix = '') {
  const out = []
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  if (error) {
    console.warn(`- ${bucket}/${prefix}: storage list skipped (${error.message})`)
    return out
  }

  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name
    if (item.id === null) {
      out.push(...await listStorageRecursive(bucket, path))
    } else {
      out.push({
        bucket,
        path,
        id: item.id,
        size: item.metadata?.size ?? null,
        mimeType: item.metadata?.mimetype ?? null,
        updatedAt: item.updated_at ?? null,
        createdAt: item.created_at ?? null,
      })
    }
  }
  return out
}

async function downloadStorageObjects(bucket, objects) {
  for (const object of objects) {
    const { data, error } = await sb.storage.from(bucket).download(object.path)
    if (error || !data) {
      console.warn(`- ${bucket}/${object.path}: download skipped (${error?.message ?? 'no data'})`)
      continue
    }
    const target = join(dir, 'storage-files', bucket, object.path)
    mkdirSync(dirname(target), { recursive: true })
    const bytes = Buffer.from(await data.arrayBuffer())
    writeFileSync(target, bytes)
  }
}

const tableSummary = []
for (const table of TABLES) {
  const rows = await fetchAll(table)
  if (!rows) continue
  writeFileSync(`${dir}/tables/${table}.json`, JSON.stringify(rows, null, 2))
  tableSummary.push({ table, rows: rows.length })
  console.log(`✓ ${table}: ${rows.length} rows`)
}

const storageSummary = []
for (const bucket of BUCKETS) {
  const objects = await listStorageRecursive(bucket)
  writeFileSync(`${dir}/storage-manifests/${bucket}.json`, JSON.stringify(objects, null, 2))
  storageSummary.push({ bucket, objects: objects.length })
  console.log(`✓ ${bucket}: ${objects.length} objects listed`)
  if (process.env.BACKUP_STORAGE_FILES === '1') {
    await downloadStorageObjects(bucket, objects)
    console.log(`  downloaded ${objects.length} objects`)
  }
}

const manifest = {
  createdAt: new Date().toISOString(),
  projectUrl: supabaseUrl,
  storageFilesDownloaded: process.env.BACKUP_STORAGE_FILES === '1',
  tables: tableSummary,
  storage: storageSummary,
}
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2))
console.log(`\nBackup complete: backups/${stamp}`)
