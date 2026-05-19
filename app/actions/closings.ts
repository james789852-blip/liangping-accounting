'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

interface CashCountsPayload {
  bills_1000: number; bills_500: number; bills_100: number
  coins_50: number; coins_10: number; coins_5: number; coins_1: number
  lump_1000: number; lump_500: number; lump_100: number
  lump_50: number; lump_10: number; lump_5: number; lump_1: number
}

export async function saveCashCounts(closingId: string, counts: CashCountsPayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  // 確認此 closing 屬於該使用者可存取的店家
  const { data: closing } = await supabase
    .from('daily_closings').select('id').eq('id', closingId).single()
  if (!closing) return { error: '無法存取此帳目' }

  // 用 service role 繞過 RLS，確保 INSERT 一定成功
  const admin = createAdminClient()
  await admin.from('cash_counts').delete().eq('closing_id', closingId)
  const { error } = await admin.from('cash_counts').insert({ closing_id: closingId, ...counts })

  if (error) return { error: error.message }
  return { success: true }
}

export async function verifyClosing(closingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile || (!profile.is_hq && profile.role !== '老闆')) return { error: '權限不足' }

  const { error } = await supabase
    .from('daily_closings')
    .update({ status: 'verified', updated_at: new Date().toISOString() })
    .eq('id', closingId)

  if (error) return { error: error.message }
  revalidatePath('/hq/reviews')
  return { success: true }
}

export async function deleteClosing(closingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile || (!profile.is_hq && profile.role !== '老闆')) return { error: '權限不足' }

  // 先刪子表（含 audit_logs），再刪主表
  await Promise.all([
    supabase.from('audit_logs').delete().eq('closing_id', closingId),
    supabase.from('revenue_items').delete().eq('closing_id', closingId),
    supabase.from('cash_counts').delete().eq('closing_id', closingId),
    supabase.from('order_items').delete().eq('closing_id', closingId),
    supabase.from('expense_items').delete().eq('closing_id', closingId),
    supabase.from('handwrite_orders').delete().eq('closing_id', closingId),
  ])

  const { error } = await supabase
    .from('daily_closings').delete().eq('id', closingId)

  if (error) return { error: error.message }
  revalidatePath('/hq/reviews')
  revalidatePath('/manager/history')
  return { success: true }
}

export async function disputeClosing(closingId: string, note: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile || (!profile.is_hq && profile.role !== '老闆')) return { error: '權限不足' }

  const { error } = await supabase
    .from('daily_closings')
    .update({
      status: 'disputed',
      dispute_note: note.trim(),
      disputed_at: new Date().toISOString(),
      disputed_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', closingId)

  if (error) return { error: error.message }
  revalidatePath('/hq/reviews')
  return { success: true }
}
