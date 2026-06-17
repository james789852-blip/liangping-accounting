// 清掉誤插的渠道/系統欄
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// 渠道、店名、系統欄位等都不是「品項」
const BAD = [
  '熊貓', 'Taiwan pay', 'taiwan pay', 'NFT', 'PAY', 'pay',
  '心惦', '大直', '北安', '鑫耀鑫', '巷日', '福城', '鑫營', '梁鑫', '幸福', '景新', '府中',
  '配送(月結)', '配送月結', '配送', 'Uber', 'uber',
  'foodpanda', '線上', '線上點餐',
]

const { data } = await admin.from('item_column_mappings').select('id, item_name, store_id, vendor_group').in('item_name', BAD)
console.log(`找到 ${data?.length ?? 0} 筆`)
let removed = 0
for (const r of data ?? []) {
  // 只刪 vendor_group=null 的（避免誤刪有意義的）
  if (r.vendor_group) continue
  const { error } = await admin.from('item_column_mappings').delete().eq('id', r.id)
  if (!error) { removed++; console.log(`  ✗ ${r.item_name} (store=${r.store_id?.slice(0,8)})`) }
}
console.log(`\n共刪 ${removed} 筆`)
