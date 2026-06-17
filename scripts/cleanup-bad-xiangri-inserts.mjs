// 刪除剛剛 rebuild-vendor-groups 誤插的非品項欄位
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const BAD_NAMES = [
  '日　期', '(手動)POS', '線上點餐', '線上點餐(現金)', '扣除後的$',
  '現場', '(手動)實際$', '配送(月底結)', '結果', '營業額',
  '總', '食材', '耗材', '雜項', // 注意：雜項可能也是真實品項
]
// 額外清掉錯誤的群組命名
const BAD_VG_NAMES = ['梁平退稅', '總收據']

const { data: stores } = await admin.from('stores').select('id, name')
const store = stores?.find(s => s.name === '巷日')

// 對「雜項」要特別處理：如果 vendor_group=null 才刪（系統欄），有群組（菜商雜項）保留
const { data: items } = await admin.from('item_column_mappings')
  .select('id, item_name, vendor_group')
  .eq('store_id', store.id)

let removed = 0
for (const i of items ?? []) {
  let shouldRemove = false
  if (i.item_name === '雜項' && !i.vendor_group) shouldRemove = true  // 系統欄
  else if (BAD_NAMES.includes(i.item_name) && i.item_name !== '雜項') shouldRemove = true
  else if (BAD_VG_NAMES.includes(i.vendor_group)) shouldRemove = true
  if (shouldRemove) {
    const { error } = await admin.from('item_column_mappings').delete().eq('id', i.id)
    if (!error) { removed++; console.log(`  ✗ 刪除 ${i.item_name} (vg=${i.vendor_group ?? 'null'})`) }
  }
}
console.log(`\n共刪 ${removed} 筆`)
