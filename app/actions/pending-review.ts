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
  // 央廚：已送出待審核 + HQ 已補款但央廚尚未點交
  const [{ count: storeSubmitted }, { count: ckSubmitted }, { count: ckHandoffPending }] = await Promise.all([
    admin.from('daily_closings').select('*', { count: 'exact', head: true })
      .eq('status', 'submitted'),
    admin.from('ck_daily_records').select('*', { count: 'exact', head: true })
      .eq('status', 'submitted'),
    admin.from('ck_daily_records').select('*', { count: 'exact', head: true })
      .eq('hq_paid', true).eq('ck_reimbursement_confirmed', false),
  ])
  const ckPending = (ckSubmitted ?? 0) + (ckHandoffPending ?? 0)
  return {
    stores: storeSubmitted ?? 0,
    ck: ckPending,
    total: (storeSubmitted ?? 0) + ckPending,
  }
}
