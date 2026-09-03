'use server'

import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { syncClosingToSheets, syncMonthToSheets } from '@/lib/google-sheets'
import { buildAuditChanges, logAudit } from '@/lib/audit'
import { getAuthContext, canAccessStore, getClosingMeta } from '@/lib/permissions'
import { canReviewClosings } from '@/lib/user-permissions'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

async function syncVerifiedClosingToSheets(input: {
  closingId: string
  storeId: string
  businessDate: string
  userId: string
}) {
  try {
    await syncClosingToSheets(input.closingId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[syncVerifiedClosingToSheets] failed:', error)
    await logAudit({
      eventType: 'sheets_sync_failed',
      severity: 'warn',
      storeId: input.storeId,
      userId: input.userId,
      closingId: input.closingId,
      description: `${input.businessDate} 試算表同步失敗`,
      metadata: { error: message },
    })
  }
}

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

function objectRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
}

const CLOSING_STATUS_LABELS = { status: '帳目狀態' }

async function loadClosingAuditSnapshot(
  admin: ReturnType<typeof createAdminClient>,
  closingId: string,
  storeId: string,
  businessDate: string,
) {
  const [{ data: closing }, { data: receipts }] = await Promise.all([
    admin
      .from('daily_closings')
      .select('*, revenue_items(*), cash_counts(*), expense_items(*), order_items(*), handwrite_orders(*), platform_screenshots(*)')
      .eq('id', closingId)
      .maybeSingle(),
    admin
      .from('receipts')
      .select('*, receipt_items(*)')
      .eq('store_id', storeId)
      .eq('business_date', businessDate)
      .order('created_at'),
  ])
  return closing ? { ...closing, receipts: receipts ?? [] } : null
}

async function detachClosingAuditLogs(
  admin: ReturnType<typeof createAdminClient>,
  closingId: string,
) {
  const { data: logs } = await admin
    .from('audit_logs')
    .select('id, metadata')
    .eq('closing_id', closingId)
  await Promise.all((logs ?? []).map(log => admin
    .from('audit_logs')
    .update({
      closing_id: null,
      metadata: {
        ...((log.metadata as Record<string, unknown> | null) ?? {}),
        original_closing_id: closingId,
      },
    })
    .eq('id', log.id)))
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

  await detachClosingAuditLogs(admin, closing.id)
  await Promise.all([
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

  const { data: linkedOrders } = await admin
    .from('ck_store_orders')
    .select('id, ck_confirmed_amount')
    .eq('store_id', closing.store_id)
    .in('ck_daily_record_id', recordIds)

  const confirmedIds = (linkedOrders ?? [])
    .filter(order => order.ck_confirmed_amount != null)
    .map(order => order.id as string)
  const unconfirmedIds = (linkedOrders ?? [])
    .filter(order => order.ck_confirmed_amount == null)
    .map(order => order.id as string)

  // 刪除／重做店面帳目時，只移除店面自報金額；央廚先前輸入的確認值是
  // 獨立來源，必須保留，等店面重新送出後再進行交叉核對。
  if (confirmedIds.length > 0) {
    await admin.from('ck_store_orders').update({ amount: 0 }).in('id', confirmedIds)
  }
  if (unconfirmedIds.length > 0) {
    await admin.from('ck_store_orders').delete().in('id', unconfirmedIds)
  }
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
  const user = await getVerifiedUser()
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
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canReviewClosings(profile)) return { error: '權限不足' }

  // 撈帳目資訊用於 audit 描述
  const { data: closing } = await supabase
    .from('daily_closings').select('store_id, business_date, status')
    .eq('id', closingId).single()
  if (!closing) return { error: '找不到此帳目' }
  if (closing.status !== 'submitted') {
    return { error: `只能核准店面重新送出的待審帳目（目前狀態：${closing.status}）` }
  }

  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('daily_closings')
    .update({ status: 'verified', updated_at: new Date().toISOString() })
    .eq('id', closingId)
    .eq('status', 'submitted')
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!updated) return { error: '帳目狀態已被其他人變更，請重新整理後再操作' }

  await logAudit({
    eventType: 'closing_verify',
    storeId: closing.store_id,
    userId: user.id,
    closingId,
    description: `${profile.name ?? user.email ?? '未知'} 審核 ${closing.business_date} 帳目`,
    metadata: {
      entity: { type: 'store_closing', id: closingId },
      business_date: closing.business_date,
      before: { status: closing.status },
      after: { status: 'verified' },
      changes: buildAuditChanges({ status: closing.status }, { status: 'verified' }, CLOSING_STATUS_LABELS),
    },
  })

  // 核准先回應畫面，Google Sheets 在 response 後繼續同步。同步失敗
  // 不回滾審核，並照常寫入操作軌跡供總公司後續重同步。
  after(async () => {
    await syncVerifiedClosingToSheets({
      closingId,
      storeId: closing.store_id,
      businessDate: closing.business_date,
      userId: user.id,
    })
  })

  revalidatePath('/hq/reviews')
  revalidatePath('/hq/closings')
  revalidatePath('/hq/accounting')
  revalidatePath('/hq/audit')
  revalidatePath('/manager/dashboard')
  revalidatePath('/manager/history')
  revalidatePath(`/manager/history/${closingId}`)
  return { success: true }
}

export async function verifyClosingsBatch(closingIds: string[]) {
  const supabase = await createClient()
  const user = await getVerifiedUser()
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

  const { data: updatedClosings, error: updateErr } = await admin
    .from('daily_closings')
    .update({ status: 'verified', updated_at: new Date().toISOString() })
    .in('id', okIds)
    .eq('status', 'submitted')
    .select('id')
  if (updateErr) return { error: updateErr.message }

  const updatedIds = (updatedClosings ?? []).map((closing: any) => closing.id as string)
  if (updatedIds.length === 0) return { error: '帳目狀態已被其他人變更，請重新整理後再操作' }

  await Promise.all(updatedIds.map(async (id: string) => {
    const c = closings.find((x: any) => x.id === id)!
    await logAudit({
      eventType: 'closing_verify',
      storeId: c.store_id, userId: user.id, closingId: id,
      description: `${profile.name ?? user.email ?? '未知'} 批次審核 ${c.business_date} 帳目`,
      metadata: {
        entity: { type: 'store_closing', id },
        business_date: c.business_date,
        before: { status: c.status },
        after: { status: 'verified' },
        changes: buildAuditChanges({ status: c.status }, { status: 'verified' }, CLOSING_STATUS_LABELS),
      },
    })
  }))

  // 一次核准可能包含同店同月份的多筆帳目；每個月份只需重建一次分頁。
  const monthlySyncTargets = new Map<string, (typeof closings)[number]>()
  updatedIds.forEach(id => {
    const closing = closings.find(item => item.id === id)
    if (!closing) return
    const month = String(closing.business_date).slice(0, 7)
    monthlySyncTargets.set(`${closing.store_id}:${month}`, closing)
  })
  after(async () => {
    await Promise.all(Array.from(monthlySyncTargets.values()).map(closing =>
      syncVerifiedClosingToSheets({
        closingId: closing.id,
        storeId: closing.store_id,
        businessDate: closing.business_date,
        userId: user.id,
      }),
    ))
  })

  revalidatePath('/hq/reviews')
  revalidatePath('/hq/closings')
  revalidatePath('/hq/accounting')
  revalidatePath('/hq/audit')
  return {
    success: true,
    verified: updatedIds.length,
    skipped: skipped + (okIds.length - updatedIds.length),
  }
}

export async function deleteClosingDraft(closingId: string) {
  const supabase = await createClient()
  const user = await getVerifiedUser()
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
  const snapshot = await loadClosingAuditSnapshot(admin, closingId, closing.store_id, closing.business_date)
  await cleanupClosingRelations(admin, closing as ClosingForDelete)
  await cleanupLinkedCKOrder(admin, closing as ClosingForDelete)

  const { error } = await admin.from('daily_closings').delete().eq('id', closingId)
  if (error) return { error: error.message }

  await logAudit({
    eventType: 'closing_delete',
    severity: 'warn',
    storeId: closing.store_id,
    userId: user.id,
    description: `${user.email ?? '未知'} 刪除 ${closing.business_date} 草稿帳目`,
    metadata: {
      entity: { type: 'store_closing', id: closingId },
      business_date: closing.business_date,
      before: snapshot,
      changes: [{ field: 'status', label: '帳目狀態', before: 'draft', after: '已刪除' }],
    },
  })

  revalidateClosingDeletePaths()
  return { success: true }
}

export async function deleteClosing(closingId: string) {
  const supabase = await createClient()
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canReviewClosings(profile)) return { error: '權限不足' }

  const admin = createAdminClient()
  const { data: closing } = await admin
    .from('daily_closings')
    .select('id, store_id, business_date, status')
    .eq('id', closingId)
    .maybeSingle()
  if (!closing) return { error: '找不到此帳目' }

  const snapshot = await loadClosingAuditSnapshot(admin, closingId, closing.store_id, closing.business_date)
  await cleanupClosingRelations(admin, closing as ClosingForDelete)
  await cleanupLinkedCKOrder(admin, closing as ClosingForDelete)

  const { error } = await admin
    .from('daily_closings').delete().eq('id', closingId)

  if (error) return { error: error.message }
  await logAudit({
    eventType: 'closing_delete',
    severity: 'warn',
    storeId: closing.store_id,
    userId: user.id,
    description: `${profile.name ?? user.email ?? '未知'} 刪除 ${closing.business_date} 帳目`,
    metadata: {
      entity: { type: 'store_closing', id: closingId },
      business_date: closing.business_date,
      before: snapshot,
      changes: [{ field: 'status', label: '帳目狀態', before: closing.status, after: '已刪除' }],
    },
  })
  revalidateClosingDeletePaths()
  return { success: true }
}

export async function disputeClosing(closingId: string, note: string) {
  const supabase = await createClient()
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canReviewClosings(profile)) return { error: '權限不足' }

  const { data: closing } = await supabase
    .from('daily_closings').select('store_id, business_date, status')
    .eq('id', closingId).single()
  if (!closing) return { error: '找不到此帳目' }
  if (!['submitted', 'verified', 'disputed'].includes(closing.status)) {
    return { error: `只能退回已送出、已審核或已退回的帳目（目前狀態：${closing.status}）` }
  }

  // 退回前先保留完整帳務快照。日後即使店長端裝置或網路發生異常，
  // 也能依稽核紀錄精確還原退回當下的內容，而不是只剩彙總數字可推算。
  const admin = createAdminClient()
  const preDisputeSnapshot = await loadClosingAuditSnapshot(admin, closingId, closing.store_id, closing.business_date)

  const cleanNote = note.trim()
  const { data: updated, error } = await admin
    .from('daily_closings')
    .update({
      status: 'disputed',
      dispute_note: cleanNote || null,
      disputed_at: new Date().toISOString(),
      disputed_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', closingId)
    .eq('status', closing.status)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!updated) return { error: '帳目狀態已被其他人變更，請重新整理後再操作' }

  await logAudit({
    eventType: 'closing_dispute', severity: 'warn',
    storeId: closing.store_id, userId: user.id, closingId,
    description: `${profile.name ?? user.email ?? '未知'} 退回 ${closing.business_date} 帳目`,
    metadata: {
      note: cleanNote || null,
      previous_status: closing.status,
      pre_dispute_snapshot: preDisputeSnapshot ?? null,
      before: { status: closing.status },
      after: { status: 'disputed' },
      changes: buildAuditChanges({ status: closing.status }, { status: 'disputed' }, CLOSING_STATUS_LABELS),
    },
  })

  // 已核准帳目被退回時，立即重建該月正式試算表，讓這一天從帳本移除。
  // 草稿／待審資料本來就不在正式帳本內，不需要額外同步。
  if (closing.status === 'verified') {
    after(async () => {
      try {
        await syncMonthToSheets(closing.store_id, String(closing.business_date).slice(0, 7))
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : String(syncError)
        console.error('[disputeClosing] Google Sheets cleanup sync failed:', syncError)
        await logAudit({
          eventType: 'sheets_sync_failed',
          severity: 'warn',
          storeId: closing.store_id,
          userId: user.id,
          closingId,
          description: `${closing.business_date} 退回後試算表清除失敗`,
          metadata: { error: message, month: String(closing.business_date).slice(0, 7) },
        })
      }
    })
  }

  revalidatePath('/hq/reviews')
  revalidatePath('/hq/closings')
  revalidatePath('/hq/audit')
  revalidatePath('/manager/dashboard')
  revalidatePath('/manager/history')
  revalidatePath(`/manager/history/${closingId}`)
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
  // 送出前再由伺服器檢查「永久照片網址」是否已寫入帳目。Client 的 blob 預覽
  // 既不能跨裝置，也會在重新整理後失效，絕不能被視為已完成上傳。
  const { data: submission, error: submissionError } = await admin
    .from('daily_closings')
    .select(`
      actual_remit, remittance_adjustments, reserve_items,
      envelope_photo_url, ck_delivery_photo_url, channel_photo_urls,
      cash_counts(large_expenses), order_items(vendor, quantity),
      revenue_items(channel, account_name, gross_amount)
    `)
    .eq('id', closingId)
    .maybeSingle()

  if (submissionError) return { error: submissionError.message }
  if (!submission) return { error: '找不到此帳目' }

  const adjustments = objectRows(submission.remittance_adjustments)
  const reserves = objectRows(submission.reserve_items)
  const cashRows = objectRows(submission.cash_counts)
  const largeExpenses = cashRows.flatMap(row => objectRows(row.large_expenses))
  const adjustmentTotal = adjustments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  const reserveTotal = reserves.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  const preReservedTotal = largeExpenses.reduce((sum, row) =>
    sum + (row.preReserved === true || row.pre_reserved === true ? Math.abs(Number(row.amount) || 0) : 0), 0)
  const remitToHQ = (Number(submission.actual_remit) || 0) + adjustmentTotal - reserveTotal + preReservedTotal

  if (remitToHQ > 0 && !submission.envelope_photo_url) {
    return { error: '信封袋有金額，但照片尚未完成上傳，請回到確認結帳重新上傳' }
  }

  const hasCKDelivery = objectRows(submission.order_items).some(row =>
    row.vendor === '央廚' && (Number(row.quantity) || 0) > 0)
  if (hasCKDelivery && !submission.ck_delivery_photo_url) {
    return { error: '已有央廚配送品項，但配送單照片尚未完成上傳' }
  }

  const channelPhotoUrls = submission.channel_photo_urls && typeof submission.channel_photo_urls === 'object'
    ? submission.channel_photo_urls as Record<string, unknown>
    : {}
  const missingChannelPhotos = objectRows(submission.revenue_items).flatMap(row => {
    if ((Number(row.gross_amount) || 0) <= 0) return []
    const key = row.channel === 'uber'
      ? `uber_${String(row.account_name ?? '')}`
      : typeof row.channel === 'string' && ['pos', 'panda', 'twpay', 'online'].includes(row.channel)
        ? row.channel as string
        : null
    return key && !channelPhotoUrls[key] ? [key] : []
  })
  if (missingChannelPhotos.length > 0) {
    return { error: '仍有營收通路照片尚未完成上傳，請回到營業額步驟確認' }
  }

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
    metadata: {
      entity: { type: 'store_closing', id: closingId },
      business_date: c.business_date,
      variance: c.variance,
      total_revenue: c.total_revenue,
      previous_status: meta.status,
      before: { status: meta.status },
      after: { status: 'submitted' },
      changes: buildAuditChanges({ status: meta.status }, { status: 'submitted' }, CLOSING_STATUS_LABELS),
    },
  })

  revalidatePath('/manager/dashboard')
  revalidatePath('/manager/history')
  revalidatePath(`/manager/history/${closingId}`)
  revalidatePath('/hq/reviews')
  revalidatePath('/hq/closings')
  return { success: true }
}

export async function logClosingSubmit(closingId: string) {
  const supabase = await createClient()
  const user = await getVerifiedUser()
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
  const user = await getVerifiedUser()
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
  expectedUpdatedAt?: string | null,
) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }

  const meta = await getClosingMeta(closingId)
  if (!meta) return { error: '找不到此帳目' }
  if (!canAccessStore(ctx, meta.storeId)) return { error: '無權限存取此帳目' }

  const admin = createAdminClient()
  const nextUpdatedAt = new Date().toISOString()
  const payload = {
    petty_counts: { counts, lumps, verified_at: new Date().toISOString() },
    manager_id: ctx.userId,
    updated_at: nextUpdatedAt,
  }
  let updateQuery = admin.from('daily_closings').update(payload).eq('id', closingId)
  if (expectedUpdatedAt) updateQuery = updateQuery.eq('updated_at', expectedUpdatedAt)
  const { data: updated, error } = await updateQuery
    .select('id, updated_at')
    .maybeSingle()
  if (error) {
    const missingPettyColumn = error.message.includes("'petty_counts' column") ||
      error.message.includes('petty_counts') && error.message.includes('schema cache')
    if (missingPettyColumn) {
      console.warn('[savePettyCounts] petty_counts column is missing; allowing closing flow to continue until migration is applied.')
      return { success: true, warning: 'petty_counts column missing' }
    }
    return { error: error.message }
  }
  if (!updated) {
    const { data: current } = await admin.from('daily_closings')
      .select('manager_id, updated_at')
      .eq('id', closingId)
      .maybeSingle()
    return {
      conflict: true as const,
      managerId: current?.manager_id as string | null | undefined,
      updatedAt: current?.updated_at as string | null | undefined,
    }
  }
  return { success: true as const, updatedAt: (updated.updated_at as string | null) ?? nextUpdatedAt }
}

export async function reSyncMonthToSheets(storeId: string, month: string) {
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' }
  if (!storeId?.trim()) return { error: '請選擇店家' }
  if (!MONTH_PATTERN.test(month)) return { error: '月份格式錯誤' }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()
  if (!canReviewClosings(profile)) return { error: '權限不足' }

  try {
    await syncMonthToSheets(storeId, month)
    return { success: true as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[reSyncMonthToSheets] failed:', error)
    await logAudit({
      eventType: 'sheets_sync_failed',
      severity: 'warn',
      storeId,
      userId: user.id,
      description: `${month} 試算表手動同步失敗`,
      metadata: { error: message, month },
    })
    return { error: message }
  }
}
