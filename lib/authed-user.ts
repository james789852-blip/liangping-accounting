import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// 用 getClaims() 做「本地 JWT 驗證」：
// 專案現用簽章金鑰為非對稱金鑰（ECC / P-256），getClaims 會抓取並快取公鑰(JWKS)，
// 之後在本地用公鑰驗證 access token，免去每次對 Supabase Auth 伺服器的網路往返。
// （相較之下 getUser() 每次都會連 Auth 伺服器重新驗證。）
//
// 回傳物件對齊原本 getUser() 使用到的欄位（id / email / user_metadata），
// 以 User 型別回傳，呼叫端無需更動。
async function resolveAuthedUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return null

  return {
    id: claims.sub,
    email: claims.email,
    user_metadata: claims.user_metadata ?? {},
    app_metadata: claims.app_metadata ?? {},
    aud: Array.isArray(claims.aud) ? (claims.aud[0] ?? '') : (claims.aud ?? ''),
    role: claims.role,
    created_at: '',
  } as unknown as User
}

// 給 Server Component / layout / page 使用：
// 用 React cache() 讓同一次 server render（layout + page + 巢狀元件）內只驗證一次。
// 注意：cache() 只在同一次 render 內生效，跨請求不共用，安全。
export const getAuthedUser = cache(resolveAuthedUser)

// 給 Server Action / Route Handler 使用：
// 這些情境不屬於 React render，不依賴 cache() 的 request scope，直接呼叫本地驗證即可。
export const getVerifiedUser = resolveAuthedUser
