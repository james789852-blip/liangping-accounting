/**
 * 批次建立使用者帳號腳本
 * 執行方式：node scripts/seed-users.mjs
 *
 * 注意：執行前請先完成 Supabase migration 014
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 讀取 .env.local
const envPath = join(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf-8')
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

// ============================================================
// 使用者資料
// ============================================================
const USERS = [
  {
    account: 'A123456789', password: '123456',
    name: '梁老闆', employee_id: '', title: '老闆',
    role: '老闆', store_names: [], is_hq: true,
  },
  {
    account: 'E125050010', password: '830719',
    name: '蔡尚恩', employee_id: 'tw0030001', title: '營運總監',
    role: '總監', store_names: [], is_hq: true,
  },
  {
    account: 'K122427658', password: '781213',
    name: '吳世輝', employee_id: 'tw0010001', title: '央廚總監',
    role: '總監', store_names: ['鑫雞肉央廚', '鑫營', '梁鑫'], is_hq: true,
  },
  {
    account: 'A224315636', password: '710703',
    name: '羅麗琴', employee_id: 'tw0050001', title: '財務經理',
    role: '經理', store_names: [], is_hq: true,
  },
  {
    account: 'L224147851', password: '811223',
    name: '羅梓秦', employee_id: 'tw0000003', title: '助理',
    role: '助理', store_names: [], is_hq: true,
  },
  {
    account: 'A127523745', password: '850815',
    name: '文祥軒', employee_id: 'tw0070003', title: '廠長',
    role: '廠長', store_names: ['新莊央廚'], is_hq: false,
  },
  {
    account: 'S123841121', password: '730819',
    name: '郭泰麟', employee_id: 'tw0010003', title: '副廠長',
    role: '副廠長', store_names: ['鑫雞肉央廚', '鑫營', '梁鑫'], is_hq: false,
  },
  {
    account: 'F126294240', password: '731111',
    name: '陳昭雄', employee_id: 'tw0010014', title: '副廠長',
    role: '副廠長', store_names: ['鑫雞肉央廚', '鑫營', '梁鑫'], is_hq: false,
  },
  {
    account: 'R123333356', password: '700709',
    name: '蘇寬毅', employee_id: 'tw0070010', title: '副廠長',
    role: '副廠長', store_names: ['新莊央廚'], is_hq: false,
  },
  {
    account: 'A129736197', password: '810929',
    name: '陳啟源', employee_id: 'tw0070008', title: '副廠長',
    role: '副廠長', store_names: ['新莊央廚'], is_hq: false,
  },
  {
    account: 'A126013526', password: '770806',
    name: '李睿哲', employee_id: 'tw0020001', title: '店長',
    role: '店長', store_names: ['鑫耀鑫'], is_hq: false,
  },
  {
    account: 'F228204442', password: '811125',
    name: '許寧恩', employee_id: 'tw0030009', title: '店長',
    role: '店長', store_names: ['梁鑫'], is_hq: false,
  },
  {
    account: 'F227504130', password: '811210',
    name: '曾子芹', employee_id: 'tw0040008', title: '店長',
    role: '店長', store_names: ['鑫營'], is_hq: false,
  },
  {
    account: 'M122501605', password: '791028',
    name: '李奕詮', employee_id: 'tw0060001', title: '店長',
    role: '店長', store_names: ['景新'], is_hq: false,
  },
  {
    account: 'O100015765', password: '720115',
    name: '鄭恩閎', employee_id: 'tw0070001', title: '店長',
    role: '店長', store_names: ['泉州鑫廚房', '天津'], is_hq: false,
  },
  {
    account: 'Q223891738', password: '830512',
    name: '侯靖軒', employee_id: 'tw0080003', title: '店長',
    role: '店長', store_names: ['巷日雞肉飯'], is_hq: false,
  },
  {
    account: 'A226738539', password: '710506',
    name: '廖書嫺', employee_id: 'tw0080004', title: '店長',
    role: '店長', store_names: ['巷日雞肉飯'], is_hq: false,
  },
  {
    account: 'F126537302', password: '741219',
    name: '張景棠', employee_id: 'tw0090001', title: '店長',
    role: '店長', store_names: ['大直', '大直讚雞肉飯'], is_hq: false,
  },
  {
    account: 'A128410989', password: '831104',
    name: '鍾昊諺', employee_id: 'tw0100011', title: '店長',
    role: '店長', store_names: ['心惦'], is_hq: false,
  },
  {
    account: 'L222909559', password: '700818',
    name: '方緯甄', employee_id: 'tw0040004', title: '店長',
    role: '店長', store_names: ['幸福'], is_hq: false,
  },
  {
    account: 'V221565392', password: '880129',
    name: '黃思媛', employee_id: 'tw0090012', title: '店長',
    role: '店長', store_names: ['福城'], is_hq: false,
  },
  {
    account: 'N223558889', password: '690720',
    name: '林雅雯', employee_id: 'tw0130001', title: '店長',
    role: '店長', store_names: ['福城'], is_hq: false,
  },
  {
    account: 'A129666994', password: '820216',
    name: '任易軒', employee_id: 'tw0040006', title: '副店長',
    role: '副店長', store_names: ['鑫營'], is_hq: false,
  },
  {
    account: 'F228560883', password: '841001',
    name: '林美貞', employee_id: 'tw0050004', title: '副店長',
    role: '副店長', store_names: ['府中'], is_hq: false,
  },
  {
    account: 'A230712472', password: '901227',
    name: '李姿嫻', employee_id: 'tw0060003', title: '副店長',
    role: '副店長', store_names: ['景新'], is_hq: false,
  },
  {
    account: 'A128451917', password: '850810',
    name: '呂冠儁', employee_id: 'tw0070002', title: '副店長',
    role: '副店長', store_names: ['泉州鑫廚房', '天津'], is_hq: false,
  },
  {
    account: 'A128388713', password: '820920',
    name: '陳譽升', employee_id: 'tw0090006', title: '副店長',
    role: '副店長', store_names: ['大直', '大直讚雞肉飯'], is_hq: false,
  },
  {
    account: 'F224731073', password: '690815',
    name: '張以婕', employee_id: 'tw0060012', title: '副店長',
    role: '副店長', store_names: ['心惦'], is_hq: false,
  },
]

async function main() {
  console.log('🔍 正在讀取店家資料...')
  const { data: stores, error: storeErr } = await supabase
    .from('stores').select('id, name').eq('active', true)
  if (storeErr) { console.error('無法讀取店家：', storeErr.message); process.exit(1) }

  console.log(`✅ 找到 ${stores.length} 間店家：${stores.map(s => s.name).join('、')}`)

  // 建立店家名稱模糊對照表
  function findStoreId(namePart) {
    const exact = stores.find(s => s.name === namePart)
    if (exact) return exact.id
    const partial = stores.find(s =>
      s.name.includes(namePart) || namePart.includes(s.name)
    )
    return partial?.id ?? null
  }

  console.log('\n🚀 開始建立使用者...\n')

  let success = 0, failed = 0

  for (const u of USERS) {
    const email = `${u.account.toUpperCase()}@liang-ping.com`

    // 解析店家 IDs
    const store_ids = []
    for (const name of u.store_names) {
      const id = findStoreId(name)
      if (id) store_ids.push(id)
      else console.warn(`  ⚠ 找不到店家：${name}（${u.name}）`)
    }

    // 建立 auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: u.password,
      email_confirm: true,
    })

    if (authErr) {
      if (authErr.message.includes('already been registered')) {
        console.log(`⏭  ${u.name}（${u.title}）帳號已存在，跳過`)
      } else {
        console.error(`❌  ${u.name}（${u.title}）auth 建立失敗：${authErr.message}`)
        failed++
      }
      continue
    }

    // 建立 profile
    const { error: profileErr } = await supabase.from('user_profiles').insert({
      user_id: authData.user.id,
      name: u.name,
      role: u.role,
      title: u.title,
      employee_id: u.employee_id || null,
      store_ids,
      is_hq: u.is_hq,
      active: true,
    })

    if (profileErr) {
      console.error(`❌  ${u.name} profile 建立失敗：${profileErr.message}`)
      await supabase.auth.admin.deleteUser(authData.user.id)
      failed++
    } else {
      const storeStr = store_ids.length ? ` → ${u.store_names.join('/')}` : ''
      console.log(`✅  ${u.name}（${u.title}）${storeStr}`)
      success++
    }
  }

  console.log(`\n📊 完成：成功 ${success} 人，失敗 ${failed} 人`)

  if (failed > 0) {
    console.log('⚠  請檢查上方錯誤訊息，手動補建失敗的帳號')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
