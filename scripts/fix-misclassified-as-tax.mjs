// 把錯誤被歸到「退稅」的月繳費項目改回 null（顯示未分類）
// 依據：模板 row 1 為空、row 2 也為空 → 應為未分類
// 經 diagnose-vendor-merges.mjs 驗證，這些品項在所有店模板的 row 1 都是空白
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// 這些都是月繳費類項目，不屬於退稅
const ITEM_NAMES = [
  '天然氣', '瓦斯', '水費', '電費', '電話費', '垃圾費',
  '廚餘費', '保險費', '房租', '獎金', '體檢費用',
]

console.log(`目標品項：${ITEM_NAMES.join(', ')}`)
console.log('規則：vendor_group 從「退稅」改為 null（顯示未分類）\n')

const { data: targets, error: qErr } = await admin
  .from('item_column_mappings')
  .select('id, item_name, vendor_group, store_id')
  .in('item_name', ITEM_NAMES)
  .eq('vendor_group', '退稅')

if (qErr) { console.error('查詢失敗：', qErr); process.exit(1) }

const { data: stores } = await admin.from('stores').select('id, name')
const nameOf = (id) => stores?.find(s => s.id === id)?.name ?? id?.slice(0, 8) ?? '(全域)'

console.log(`找到 ${targets?.length ?? 0} 筆需修正：`)
for (const t of targets ?? []) {
  console.log(`  [${nameOf(t.store_id)}] ${t.item_name}  退稅 → 未分類`)
}

if (!targets?.length) { console.log('沒有需要修正的資料'); process.exit(0) }

let ok = 0, fail = 0
for (const t of targets) {
  const { error } = await admin
    .from('item_column_mappings')
    .update({ vendor_group: null, updated_at: new Date().toISOString() })
    .eq('id', t.id)
  if (error) { console.error(`✗ ${t.item_name}: ${error.message}`); fail++ }
  else ok++
}
console.log(`\n完成：成功 ${ok} 筆、失敗 ${fail} 筆`)
