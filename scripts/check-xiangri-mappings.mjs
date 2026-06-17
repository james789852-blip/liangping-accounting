import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: stores } = await admin.from('stores').select('id, name')
const store = stores?.find(s => s.name === '巷日')

const { data: maps } = await admin.from('item_column_mappings')
  .select('item_name, excel_column, vendor_group, item_category')
  .eq('store_id', store.id)
  .order('vendor_group', { nullsFirst: true })
  .order('item_name')

console.log(`巷日 共 ${maps?.length ?? 0} 筆 mapping：\n`)
const byVg = {}
for (const m of maps ?? []) {
  const vg = m.vendor_group ?? '(未分類)'
  if (!byVg[vg]) byVg[vg] = []
  byVg[vg].push(m)
}
for (const [vg, items] of Object.entries(byVg)) {
  console.log(`【${vg}】(${items.length} 個)`)
  for (const m of items) console.log(`  ${m.item_name.padEnd(12)} → ${m.excel_column}`)
  console.log('')
}
