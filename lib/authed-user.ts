import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// 用 React cache() 讓同一個請求內（layout + page + 巢狀元件）
// 只打一次 Supabase Auth 驗證，避免每次換頁重複 round trip。
// 注意：cache() 只在同一次 server render 內生效，跨請求不會共用，安全。
export const getAuthedUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
