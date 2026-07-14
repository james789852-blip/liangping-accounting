'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
// Google Sheets 同步功能已停用（2026-07）
// 保留 import 註解讓 refactor 時容易找回：syncClosingToSheets, syncMonthToSheets from '@/lib/google-sheets'
import { logAudit } from '@/lib/audit'
import { getAuthContext, canAccessStore, getClosingMeta } from '@/lib/permissions'
import { canReviewClosings } from '@/lib/user-permissions'

interface CashCountsPayload {
  bills_1000: number; bills_500: number; bills_100: number
  coins_50: number; coins_10: number; coins_5: number; coins_1: number
  lump_1000: number; lump_500: number; lump_100: number
  lump_50: number; lump_10: number; lump_5: number; lump_1: number
  large_expenses?: { id: string; description: string; amount: number; preReserved?: boolean }[]
}

type ClosingForDelete = {
  id: string
  store_id: string
  business_date: string
}

async function cleanupClosingRelations(admin: ReturnType<typeof createAdminClient>, closing: ClosingForDelete) {
  const [{ data: receiptsByDate }, { data: orderItems }, { data: screenshots }] = await Promise.all([
    admin.from('receipts').select('id').eq('store_id', closing.store_id).eq('business_date', closing.business_date),
    admin.from('order_items').select('id').eq('closing_id', closing.id),
    admin.from('platform_screenshots').select('id').eq('closing_id', closing.id),
  ])

  const receiptIds = (receiptsByDate ?? []).map((r: any) => r.id as string)
  const orderItemIds = (orderItems ?? []).map((o: any) => o.id as string)
  const screenshotIds = (screenshots ?? []).map((s: any) => s.id as string)

  if (receiptIds.length > 0) {
    await Promise.all([
      admin.from('review_logs').delete().in('receipt_id', receiptIds),
      admin.from('receipt_items').delete().in('receipt_id', receiptIds),
    ])
  }
  if (orderItemIds.length > 0) {
    await admin.from('review_logs').delete().in('order_item_id', orderItemIds)
  }
  if (screenshotIds.length > 0) {
    await admin.from('review_logs').delete().in('screenshot_id', screenshotIds)
  }

  await Promise.all([
    admin.from('audit_logs').delete().eq('closing_id', closing.id),
    admin.from('revenue_items').delete().eq('closing_id', closing.id),
    admin.from('cash_counts').delete().eq('closing_id', closing.id),
    admin.from('expense_items').delete().eq('closing_id', closing.id),
    admin.from('handwrite_orders').delete().eq('closing_id', closing.id),
    admin.from('platform_screenshots').delete().eq('closing_id', closing.id),
    admin.from('menu_videos').delete().eq('closing_id', closing.id),
    admin.from('menu_videos').delete().eq('store_id', closing.store_id).eq('business_date', closing.business_date),
    admin.from('order_items').delete().eq('closing_id', closing.id),
  ])

  if (receiptIds.length > 0) {
    await admin.from('receipts').delete().in('id', receiptIds)
  }
}

async function cleanupLinkedCKOrder(admin: ReturnType<typeof createAdminClient>, closing: ClosingForDelete) {
  const { data: ckStores } = await admin
    .from('stores')
    .select('id')
    .eq('type', '央廚')
    .eq('active', true)
    .contains('assigned_store_ids', [closing.store_id])

  const ckStoreIds = (ckStores ?? []).map((s: any) => s.id as string)
  if (ckStoreIds.length === 0) return

  const { data: ckRecords } = await admin
    .from('ck_daily_records')
    .select('id')
    .eq('business_date', closing.business_date)
    .in('ck_store_id', ckStoreIds)

  const recordIds = (ckRecords ?? []).map((r: any) => r.id as string)
  if (recordIds.length === 0) return

  await admin
    .from('ck_store_orders')
    .delete()
    .eq('store_id', closing.store_id)
    .in('ck_daily_record_id', recordIds)
}

function revalidateClosingDeletePaths() {
  revalidatePath('/manager/dashboard')
  revalidatePath('/manager/closing')
  revalidatePath('/manager/history')
  revalidatePath('/manager/order')
  revalidatePath('/manager/receipts')
  revalidatePath('/manager/summary')
  revalidatePath('/manager/cash')
  revalidatePath('/manager/ck')
  revalidatePath('/hq/dashboard')
  revalidatePath('/hq/reviews')
  revalidatePath('/hq/closings')
  revalidatePath('/hq/accounting')
  revalidatePath('/hq/food-cost-preview')
  revalidatePath('/hq/ck')
  revalidatePath('/hq/ck-overview')
  revalidatePath('/hq/store-overview')
}

export async function saveCashCounts(closingId: string, counts: CashCountsPayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  // 確認此 closing 屬於該使用者可存取的店家
  const { data: closing } = await supabase
    .from('daily_closings').select('id').eq('id', closingId).single()
  if (!closing) return { error: '無法存取此帳目' }

  // 用 upsert 避免「先 delete 再 insert」非 atomic：
  // 若 insert 失敗（race / network），原本的 cash_counts 會整筆消失。
  // cash_counts.closing_id 有 unique 約束，可直接以此為 conflict key 做 upsert。
  // 注意：cash_counts 表沒有 updated_at 欄位，不可帶入。
  const admin = createAdminClient()
  const { error } = await admin
    .from('cash_counts')
    .upsert(
      { closing_id: closingId, ...counts },
      { onConflict: 'closing_id' },
    )

  if (error) return { error: error.message }
  return { success: true }
}

export async function verifyClosing(closingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canReviewClosings(profile)) return { error: '權限不足' }

  // 撈帳目資訊用於 audit 描述
  const { data: closing } = await supabase
    .from('daily_closings').select('store_id, business_date, status')
    .eq('id', closingId).single()
  if (!closing) return { error: '找不到此帳目' }
  if (!['submitted', 'disputed'].includes(closing.status)) {
    return { error: `只能審核已送出/退回修改的帳目（目前狀態：${closing.status}）` }
  }

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

  // Google Sheets sync 已停用

  revalidatePath('/hq/reviews')
  revalidatePath('/hq/closings')
  revalidatePath('/hq/audit')
  return { success: true }
}

export async function verifyClosingsBatch(closingIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canReviewClosings(profile)) return { error: '權限不足' }

  if (!Array.isArray(closingIds) || closingIds.length === 0) return { error: '未選擇帳目' }

  const admin = createAdminClient()
  const { data: closings } = await admin
    .from('daily_closings').select('id, store_id, business_date, status')
    .in('id', closingIds)

  if (!closings || closings.length === 0) return { error: '找不到帳目' }

  const okIds = closings.filter((c: any) => c.status === 'submitted').map((c: any) => c.id)
  const skipped = closings.length - okIds.length
  if (okIds.length === 0) return { error: '無可核准帳目（皆非待審狀態）' }

  const { error: updateErr } = await admin
    .from('daily_closings')
    .update({ status: 'verified', updated_at: new Date().toISOString() })
    .in('id', okIds)
  if (updateErr) return { error: updateErr.message }

  await Promise.all(okIds.map(async (id: string) => {
    const c = closings.find((x: any) => x.id === id)!
    await logAudit({
      eventType: 'closing_verify',
      storeId: c.store_id, userId: user.id, closingId: id,
      description: `${profile.name ?? user.email ?? '未知'} 批次審核 ${c.business_date} 帳目`,
    })
  }))

  revalidatePath('/hq/reviews')
  revalidatePath('/hq/closings')
  revalidatePath('/hq/audit')
  return { success: true, verified: okIds.length, skipped }
}

export async function deleteClosingDraft(closingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  // RLS 確保只能讀取自己店的資料；再驗證狀態為草稿
  const { data: closing } = await supabase
    .from('daily_closings')
    .select('id, store_id, business_date, status')
    .eq('id', closingId)
    .single()

  if (!closing) return { error: '找不到此帳目' }
  if (closing.status !== 'draft') return { error: '只能刪除草稿狀態的帳目' }

  const admin = createAdminClient()
  await cleanupClosingRelations(admin, closing as ClosingForDelete)
  await cleanupLinkedCKOrder(admin, closing as ClosingForDelete)

  const { error } = await admin.from('daily_closings').delete().eq('id', closingId)
  if (error) return { error: error.message }

  revalidateClosingDeletePaths()
  return { success: true }
}

export async function deleteClosing(closingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canReviewClosings(profile)) return { error: '權限不足' }

  const admin = createAdminClient()
  const { data: closing } = await admin
    .from('daily_closings')
    .select('id, store_id, business_date')
    .eq('id', closingId)
    .maybeSingle()
  if (!closing) return { error: '找不到此帳目' }

  await cleanupClosingRelations(admin, closing as ClosingForDelete)
  await cleanupLinkedCKOrder(admin, closing as ClosingForDelete)

  const { error } = await admin
    .from('daily_closings').delete().eq('id', closingId)

  if (error) return { error: error.message }
  revalidateClosingDeletePaths()
  return { success: true }
}

export async function disputeClosing(closingId: string, note: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canReviewClosings(profile)) return { error: '權限不足' }

  const { data: closing } = await supabase
    .from('daily_closings').select('store_id, business_date, status')
    .eq('id', closingId).single()
  if (!closing) return { error: '找不到此帳目' }
  if (!['submitted', 'verified', 'disputed'].includes(closing.status)) {
    return { error: `只能退回已送出/已審核/退回修改的帳目（目前狀態：${closing.status}）` }
  }

  const cleanNote = note.trim()
  const { error } = await supabase
    .from('daily_closings')
    .update({
      status: 'disputed',
      dispute_note: cleanNote || null,
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
    metadata: { note: cleanNote || null, previous_status: closing.status },
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

/**
 * 儲存零用金核對結果（鈔票/硬幣張數）。
 * 不需要 status='draft'：送出後仍可清點。
 */
export async function savePettyCounts(
  closingId: string,
  counts: Record<string, number>,
  lumps: Record<string, number>,
) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const meta = await getClosingMeta(closingId)
  if (!meta) return { error: '找不到此帳目' }
  if (!canAccessStore(ctx, meta.storeId)) return { error: '無權限存取此帳目' }

  const admin = createAdminClient()
  const payload = {
    petty_counts: { counts, lumps, verified_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }
  const { error } = await admin.from('daily_closings').update(payload).eq('id', closingId)
  if (error) {
    const missingPettyColumn = error.message.includes("'petty_counts' column") ||
      error.message.includes('petty_counts') && error.message.includes('schema cache')
    if (missingPettyColumn) {
      console.warn('[savePettyCounts] petty_counts column is missing; allowing closing flow to continue until migration is applied.')
      return { success: true, warning: 'petty_counts column missing' }
    }
    return { error: error.message }
  }
  return { success: true }
}

// reSyncMonthToSheets 已停用 — Google Sheets 同步功能移除
export async function reSyncMonthToSheets(_storeId: string, _month: string) {
  return { error: 'Google Sheets 同步已停用' as const }
}
