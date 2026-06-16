'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { syncClosingToSheets, syncMonthToSheets } from '@/lib/google-sheets'
import { logAudit } from '@/lib/audit'
import { getAuthContext, canAccessStore, getClosingMeta } from '@/lib/permissions'

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
  const { error } = await admin
    .from('cash_counts')
    .insert({ closing_id: closingId, ...counts })

  if (error) return { error: error.message }
  return { success: true }
}

export async function verifyClosing(closingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq, name').eq('user_id', user.id).single()
  if (!profile || (!profile.is_hq && profile.role !== '老闆')) return { error: '權限不足' }

  // 撈帳目資訊用於 audit 描述
  const { data: closing } = await supabase
    .from('daily_closings').select('store_id, business_date, status')
    .eq('id', closingId).single()
  if (!closing) return { error: '找不到此帳目' }
  if (closing.status !== 'submitted') return { error: `只能審核已送出的帳目（目前狀態：${closing.status}）` }

  const { error } = await supabase
    .from('daily_closings')
    .update({ status: 'verified', updated_at: new Date().toISOString() })
    .eq('id', closingId)

  if (error) return { error: error.message }

  await logAudit({
    eventType: 'closing_verify',
    storeId: closing.store_id,
    userId: user.id,
    closingId,
    description: `${profile.name ?? user.email ?? '未知'} 審核 ${closing.business_date} 帳目`,
  })

  // Fire-and-forget sync to Google Sheets (non-blocking; won't fail verification if Sheets errors)
  try { await syncClosingToSheets(closingId) } catch (e) {
    console.error('[verifyClosing] Sheets sync failed:', e)
    await logAudit({
      eventType: 'sheets_sync_failed', severity: 'warn',
      storeId: closing.store_id, userId: user.id, closingId,
      description: `${closing.business_date} 試算表同步失敗`,
      metadata: { error: (e as Error).message },
    })
  }

  revalidatePath('/hq/reviews')
  revalidatePath('/hq/closings')
  revalidatePath('/hq/audit')
  return { success: true }
}

export async function deleteClosingDraft(closingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  // RLS 確保只能讀取自己店的資料；再驗證狀態為草稿
  const { data: closing } = await supabase
    .from('daily_closings')
    .select('id, status')
    .eq('id', closingId)
    .single()

  if (!closing) return { error: '找不到此帳目' }
  if (closing.status !== 'draft') return { error: '只能刪除草稿狀態的帳目' }

  const admin = createAdminClient()
  await Promise.all([
    admin.from('audit_logs').delete().eq('closing_id', closingId),
    admin.from('revenue_items').delete().eq('closing_id', closingId),
    admin.from('cash_counts').delete().eq('closing_id', closingId),
    admin.from('order_items').delete().eq('closing_id', closingId),
    admin.from('expense_items').delete().eq('closing_id', closingId),
    admin.from('handwrite_orders').delete().eq('closing_id', closingId),
  ])

  const { error } = await admin.from('daily_closings').delete().eq('id', closingId)
  if (error) return { error: error.message }

  revalidatePath('/manager/history')
  revalidatePath('/manager/dashboard')
  return { success: true }
}

export async function deleteClosing(closingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile || (!profile.is_hq && profile.role !== '老闆')) return { error: '權限不足' }

  const admin = createAdminClient()
  await Promise.all([
    admin.from('audit_logs').delete().eq('closing_id', closingId),
    admin.from('revenue_items').delete().eq('closing_id', closingId),
    admin.from('cash_counts').delete().eq('closing_id', closingId),
    admin.from('order_items').delete().eq('closing_id', closingId),
    admin.from('expense_items').delete().eq('closing_id', closingId),
    admin.from('handwrite_orders').delete().eq('closing_id', closingId),
  ])

  const { error } = await admin
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
    .from('user_profiles').select('role, is_hq, name').eq('user_id', user.id).single()
  if (!profile || (!profile.is_hq && profile.role !== '老闆')) return { error: '權限不足' }

  const { data: closing } = await supabase
    .from('daily_closings').select('store_id, business_date, status')
    .eq('id', closingId).single()
  if (!closing) return { error: '找不到此帳目' }
  if (!['submitted', 'verified'].includes(closing.status)) {
    return { error: `只能退回已送出/已審核的帳目（目前狀態：${closing.status}）` }
  }

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

  await logAudit({
    eventType: 'closing_dispute', severity: 'warn',
    storeId: closing.store_id, userId: user.id, closingId,
    description: `${profile.name ?? user.email ?? '未知'} 退回 ${closing.business_date} 帳目`,
    metadata: { note: note.trim(), previous_status: closing.status },
  })

  revalidatePath('/hq/reviews')
  revalidatePath('/hq/closings')
  revalidatePath('/hq/audit')
  return { success: true }
}

/**
 * 原子性把帳目狀態改為 submitted，並寫入 audit log。
 * 用 WHERE status in ('draft','disputed') 防止：
 *  - 雙擊送出
 *  - verified 帳目被誤降級成 submitted
 * 失敗會回傳 error，client 端應顯示。
 */
export async function submitClosing(closingId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const meta = await getClosingMeta(closingId)
  if (!meta) return { error: '找不到此帳目' }
  if (!canAccessStore(ctx, meta.storeId)) return { error: '無權限存取此帳目' }
  if (!['draft', 'disputed'].includes(meta.status)) {
    return { error: `此帳目狀態為「${meta.status}」，無法送出` }
  }

  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('daily_closings')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      submitted_by: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', closingId)
    .in('status', ['draft', 'disputed'])
    .select('id, business_date, total_revenue, variance, store_id')

  if (error) return { error: error.message }
  if (!updated || updated.length === 0) {
    return { error: '此帳目狀態已變更，請重新整理頁面' }
  }

  const c = updated[0]
  await logAudit({
    eventType: 'closing_submit',
    storeId: c.store_id as string,
    userId: ctx.userId,
    closingId,
    description: `${ctx.userName ?? ctx.userEmail ?? '未知'} 送出 ${c.business_date} 帳目（營業額 $${Math.round((c.total_revenue as number) ?? 0).toLocaleString()}，誤差 $${Math.round((c.variance as number) ?? 0).toLocaleString()}）`,
    metadata: { variance: c.variance, total_revenue: c.total_revenue, previous_status: meta.status },
  })

  return { success: true }
}

export async function logClosingSubmit(closingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('name').eq('user_id', user.id).single()
  const { data: closing } = await supabase
    .from('daily_closings').select('store_id, business_date, variance, total_revenue')
    .eq('id', closingId).single()
  if (!closing) return { error: '找不到此帳目' }

  await logAudit({
    eventType: 'closing_submit',
    storeId: closing.store_id,
    userId: user.id,
    closingId,
    description: `${profile?.name ?? user.email ?? '未知'} 送出 ${closing.business_date} 帳目（營業額 $${Math.round(closing.total_revenue ?? 0).toLocaleString()}，誤差 $${Math.round(closing.variance ?? 0).toLocaleString()}）`,
    metadata: { variance: closing.variance, total_revenue: closing.total_revenue },
  })
  return { success: true }
}

export async function logClosingEdit(closingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('name').eq('user_id', user.id).single()
  const { data: closing } = await supabase
    .from('daily_closings').select('store_id, business_date, status')
    .eq('id', closingId).single()
  if (!closing) return { error: '找不到此帳目' }

  await logAudit({
    eventType: 'closing_edit',
    storeId: closing.store_id,
    userId: user.id,
    closingId,
    description: `${profile?.name ?? user.email ?? '未知'} 編輯 ${closing.business_date} 帳目（${closing.status}）`,
  })
  return { success: true }
}

export async function reSyncMonthToSheets(storeId: string, month: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile || (!profile.is_hq && profile.role !== '老闆')) return { error: '權限不足' }

  try {
    await syncMonthToSheets(storeId, month)
    return { success: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
