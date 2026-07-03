'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** 回傳「當前待審核」的店家數與央廚數（給 sidebar badge 用） */
export async function getPendingReviewCount(): Promise<{ stores: number; ck: number; total: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { stores: 0, ck: 0, total: 0 }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { stores: 0, ck: 0, total: 0 }

  const admin = createAdminClient()
  // 店家：status=submitted 的 closings 數
  // 央廚：任何未補款的 record（draft 或 submitted 都算，因為央廚流程可能跳過 submitted）
  const [{ count: storeSubmitted }, { count: ckPending }] = await Promise.all([
    admin.from('daily_closings').select('*', { count: 'exact', head: true })
      .eq('status', 'submitted'),
    admin.from('ck_daily_records').select('*', { count: 'exact', head: true })
      .in('status', ['submitted', 'draft']).eq('hq_paid', false),
  ])
  return {
    stores: storeSubmitted ?? 0,
    ck: ckPending ?? 0,
    total: (storeSubmitted ?? 0) + (ckPending ?? 0),
  }
}
