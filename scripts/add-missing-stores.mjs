/**
 * 新增缺少的店家並指派人員
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envContent = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#'))
    .map(line => { const [k, ...v] = line.split('='); return [k.trim(), v.join('=').trim()] })
)

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const COMPANY_ID = '00000000-0000-0000-0000-000000000001'

// 要新增的店家
const NEW_STORES = [
  { name: '鑫雞肉央廚', mode: 'handwrite' },
  { name: '新莊央廚',   mode: 'handwrite' },
  { name: '泉州鑫廚房', mode: 'handwrite' },
]

// 需要補指派的人員（employee_id → 要加的店名）
const USER_STORE_MAP = {
  'tw0010001': ['鑫雞肉央廚'],  // 吳世輝
  'tw0010003': ['鑫雞肉央廚'],  // 郭泰麟
  'tw0010014': ['鑫雞肉央廚'],  // 陳昭雄
  'tw0070003': ['新莊央廚'],    // 文祥軒
  'tw0070010': ['新莊央廚'],    // 蘇寬毅
  'tw0070008': ['新莊央廚'],    // 陳啟源
  'tw0070001': ['泉州鑫廚房'],  // 鄭恩閎
  'tw0070002': ['泉州鑫廚房'],  // 呂冠儁
}

async function main() {
  // 1. 新增店家
  console.log('🏪 新增店家...')
  const storeIdMap = {}

  for (const s of NEW_STORES) {
    // 先查是否已存在
    const { data: existing } = await supabase
      .from('stores').select('id, name').eq('name', s.name).single()

    if (existing) {
      console.log(`⏭  ${s.name} 已存在`)
      storeIdMap[s.name] = existing.id
      continue
    }

    const { data, error } = await supabase.from('stores').insert({
      company_id: COMPANY_ID,
      name: s.name,
      mode: s.mode,
      uber_enabled: false,
      uber_accounts: [],
      panda_enabled: false,
      panda_rate: 28,
      online_enabled: false,
      online_rate: 3.17,
      twpay_enabled: false,
      twpay_rate: 1,
      ichef_uber_linked: false,
      petty_cash: 30000,
      active: true,
    }).select('id').single()

    if (error) { console.error(`❌ 新增 ${s.name} 失敗：`, error.message); continue }
    storeIdMap[s.name] = data.id
    console.log(`✅  新增店家：${s.name}（${data.id}）`)
  }

  // 2. 更新人員店家指派
  console.log('\n👤 更新人員店家指派...')

  for (const [employeeId, storeNames] of Object.entries(USER_STORE_MAP)) {
    // 直接用 employee_id 查 user_profiles
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('user_id, store_ids, name')
      .eq('employee_id', employeeId)
      .single()

    if (!profile) { console.error(`❌ 找不到 employee_id=${employeeId}`); continue }

    // 合併新的 store IDs
    const existingIds = profile.store_ids ?? []
    const newIds = storeNames.map(n => storeIdMap[n]).filter(Boolean)
    const merged = [...new Set([...existingIds, ...newIds])]

    const { error } = await supabase
      .from('user_profiles').update({ store_ids: merged }).eq('user_id', profile.user_id)

    if (error) {
      console.error(`❌ 更新 ${profile.name} 失敗：`, error.message)
    } else {
      console.log(`✅  ${profile.name} → 加入 ${storeNames.join('、')}`)
    }
  }

  console.log('\n✅ 完成！')
}

main().catch(err => { console.error(err); process.exit(1) })
