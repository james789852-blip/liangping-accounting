'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

  // 先刪子表，再刪主表
  await Promise.all([
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
