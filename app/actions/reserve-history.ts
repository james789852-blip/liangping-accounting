'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthContext, canAccessStore } from '@/lib/permissions'
import { buildReserveHistoryContext } from '@/lib/reserve-history'
import { isIsoBusinessDate } from '@/lib/receipt-guards'
import { getBusinessDate } from '@/lib/business-date'

/**
 * 重新讀取店家指定日期以前的預留款狀態。
 *
 * 結帳表單從背景回到前景時只更新這一小段資料，避免整頁 refresh 造成
 * 尚未送出的輸入內容被重新初始化。
 */
export async function refreshReserveHistoryContext(storeId: string, businessDate: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' } as const
  if (!canAccessStore(ctx, storeId)) return { error: '無法存取此店家' } as const
  if (!isIsoBusinessDate(businessDate) || businessDate > getBusinessDate()) {
    return { error: '日期格式錯誤' } as const
  }

  const lookbackDate = new Date(
    new Date(`${businessDate}T00:00:00+08:00`).getTime() - 45 * 86400000,
  ).toISOString().slice(0, 10)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('daily_closings')
    .select('reserve_items, business_date, expense_items(description, amount)')
    .eq('store_id', storeId)
    .gte('business_date', lookbackDate)
    .lt('business_date', businessDate)
    .in('status', ['submitted', 'verified'])
    .order('business_date', { ascending: false })
    .limit(45)

  if (error) return { error: '無法更新預留款狀態' } as const
  return { context: buildReserveHistoryContext(data ?? []) } as const
}
