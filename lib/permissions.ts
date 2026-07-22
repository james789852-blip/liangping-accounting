import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVerifiedUser } from '@/lib/authed-user'

export interface AuthContext {
  userId: string
  role: string | null
  isHQ: boolean
  storeIds: string[]
  userName: string | null
  userEmail: string | null
}

/**
 * 取得 caller 身份與權限資訊；未登入則回 null。
 * 所有寫入類 server action 應該先呼叫這個，再判斷是否有權對特定 store 操作。
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getVerifiedUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, is_hq, store_ids, name')
    .eq('user_id', user.id)
    .single()

  return {
    userId: user.id,
    role: (profile?.role as string) ?? null,
    isHQ: !!(profile?.is_hq) || (profile?.role === '老闆'),
    storeIds: (profile?.store_ids as string[]) ?? [],
    userName: (profile?.name as string) ?? null,
    userEmail: user.email ?? null,
  }
}

/**
 * 確認 ctx 是否能存取指定 store_id。
 * HQ 帳號可存取所有店；店長帳號只能存取被指派的店家。
 */
export function canAccessStore(ctx: AuthContext, storeId: string): boolean {
  if (ctx.isHQ) return true
  return ctx.storeIds.includes(storeId)
}

/**
 * 透過 receipt id 反查其 store_id；找不到回 null。
 */
export async function getReceiptStoreId(receiptId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('receipts').select('store_id').eq('id', receiptId).single()
  return (data?.store_id as string) ?? null
}

/**
 * 透過 closing id 反查其 store_id 與 status；找不到回 null。
 */
export async function getClosingMeta(closingId: string): Promise<{ storeId: string; status: string; businessDate: string } | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('daily_closings').select('store_id, status, business_date').eq('id', closingId).single()
  if (!data) return null
  return {
    storeId: data.store_id as string,
    status: data.status as string,
    businessDate: data.business_date as string,
  }
}
