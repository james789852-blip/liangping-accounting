// 幸福店設定腳本：上傳欄位 JSON + 新增品項對應
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const STORE_ID = '10000000-0000-0000-0000-000000000009'
const STORE_NAME = '幸福'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ─── 幸福店欄位結構（對應 Excel row 3）─────────────────────────
const XINFU_COLUMNS = {
  '食材': [
    // 央廚配送 (6)
    '雞肉','好吃醬','雞湯','貢丸','魚丸','辣椒',
    // 豆漿 (1)
    '豆漿',
    // 菜商 (9)
    '滷蛋','油豆腐','菜商魚丸','芹菜','高麗菜','蚵白','油菜','青江菜','小松',
    // 雜貨 (8)
    '米','咖哩1','咖哩4','萬家香','味霖','特砂','沙拉油','白胡椒',
  ],
  '耗材': [
    // 容器 (12)
    '一體大','四方底','900碗','900蓋','390碗','390蓋','320杯','2632蓋','紙杯',
    '6吋圓盤','4杯底座','6杯底座',
    // 袋 (8)
    '一斤提袋','二斤袋','三碗袋','大一杯','六兩袋','三斤袋','二碗袋','夾鏈袋',
    // 消耗品 (10) + 稅 (1)
    '湯匙','筷子','橡皮筋','手套','牙籤','300抽','廚房紙巾','洗碗精','漂白水','垃圾袋',
    '免洗稅金',
  ],
  '雜項': [
    // 感熱/Duskin/消毒 (13)
    '感熱紙','感熱稅','地墊','洗手乳','酒精','口罩','收據本','菜單','洗劑','影印',
    '冷氣','消毒','其他',
    // 固定費用 (11)
    '水費','瓦斯','電費','電話費','垃圾費','廚餘費','保險費','房租','稅金','獎金','體檢費用',
  ],
}

// ─── 品項對應（item_name → excel_column, item_category）────────
const MAPPINGS = [
  // 食材
  ...['雞肉','好吃醬','雞湯','貢丸','魚丸','辣椒','豆漿',
      '滷蛋','油豆腐','菜商魚丸','芹菜','高麗菜','蚵白','油菜','青江菜','小松',
      '米','咖哩1','咖哩4','萬家香','味霖','特砂','沙拉油','白胡椒',
  ].map(name => ({ item_name: name, excel_column: name, item_category: '食材' })),

  // 耗材
  ...['一體大','四方底','900碗','900蓋','390碗','390蓋','320杯','2632蓋','紙杯',
      '6吋圓盤','4杯底座','6杯底座',
      '一斤提袋','二斤袋','三碗袋','大一杯','六兩袋','三斤袋','二碗袋','夾鏈袋',
      '湯匙','筷子','橡皮筋','手套','牙籤','300抽','廚房紙巾','洗碗精','漂白水','垃圾袋',
      '免洗稅金',
  ].map(name => ({ item_name: name, excel_column: name, item_category: '耗材' })),

  // 雜項
  ...['感熱紙','感熱稅','地墊','洗手乳','酒精','口罩','收據本','菜單','洗劑','影印',
      '冷氣','消毒','其他',
      '水費','瓦斯','電費','電話費','垃圾費','廚餘費','保險費','房租','稅金','獎金','體檢費用',
  ].map(name => ({ item_name: name, excel_column: name, item_category: '雜項' })),
]

async function main() {
  console.log(`開始設定 ${STORE_NAME}店 (${STORE_ID})`)

  // 1. 確認 store_id 欄位存在
  const { error: testErr } = await admin
    .from('item_column_mappings').select('store_id').limit(1)
  if (testErr) {
    console.error('❌ store_id 欄位不存在，請先在 Supabase Dashboard 執行 migration 010:')
    console.error('  ALTER TABLE item_column_mappings ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE CASCADE;')
    console.error('  CREATE INDEX IF NOT EXISTS idx_item_col_mappings_store ON item_column_mappings(store_id);')
    process.exit(1)
  }
  console.log('✅ store_id 欄位確認存在')

  // 2. 確保 Storage bucket 存在並上傳欄位 JSON
  await admin.storage.createBucket('excel-templates', { public: false }).catch(() => {/* already exists */})
  const colJson = JSON.stringify(XINFU_COLUMNS, null, 2)
  const fileName = `${STORE_ID}-columns.json`
  const { error: uploadErr } = await admin.storage
    .from('excel-templates')
    .upload(fileName, colJson, { contentType: 'application/json', upsert: true })
  if (uploadErr) {
    console.warn('⚠️  上傳欄位 JSON 失敗:', uploadErr.message, '（匯出 Excel 時將使用預設欄位）')
  } else {
    console.log(`✅ 欄位 JSON 上傳成功 → ${fileName}`)
    console.log(`   食材 ${XINFU_COLUMNS['食材'].length} 欄 | 耗材 ${XINFU_COLUMNS['耗材'].length} 欄 | 雜項 ${XINFU_COLUMNS['雜項'].length} 欄`)
  }

  // 3. 刪除舊有幸福店對應（避免重複）
  const { error: delErr } = await admin
    .from('item_column_mappings').delete().eq('store_id', STORE_ID)
  if (delErr) {
    console.error('❌ 刪除舊對應失敗:', delErr.message)
    process.exit(1)
  }
  console.log(`🗑  清除舊有 ${STORE_NAME}店 對應`)

  // 4. 批次插入新對應
  const records = MAPPINGS.map(m => ({
    ...m,
    store_id: STORE_ID,
    updated_at: new Date().toISOString(),
  }))
  const { error: insErr } = await admin.from('item_column_mappings').insert(records)
  if (insErr) {
    console.error('❌ 插入對應失敗:', insErr.message)
    process.exit(1)
  }
  console.log(`✅ 插入 ${records.length} 筆 ${STORE_NAME}店 品項對應`)
  console.log(`   食材 ${MAPPINGS.filter(m => m.item_category === '食材').length} 筆`)
  console.log(`   耗材 ${MAPPINGS.filter(m => m.item_category === '耗材').length} 筆`)
  console.log(`   雜項 ${MAPPINGS.filter(m => m.item_category === '雜項').length} 筆`)
  console.log('完成！')
}

main().catch(err => { console.error(err); process.exit(1) })
