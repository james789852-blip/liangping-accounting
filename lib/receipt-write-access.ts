import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { isIsoBusinessDate, lockedReceiptMessage } from '@/lib/receipt-guards'

type AdminClient = ReturnType<typeof createAdminClient>

export async function receiptDateWriteError(
  admin: AdminClient,
  storeId: string,
  businessDate: string,
): Promise<string | null> {
  if (!isIsoBusinessDate(businessDate)) return '收據日期格式不正確'

  const { data, error } = await admin
    .from('daily_closings')
    .select('status')
    .eq('store_id', storeId)
    .eq('business_date', businessDate)
    .maybeSingle()

  if (error) return '無法確認該日期的帳目狀態，請稍後再試'
  return lockedReceiptMessage(data?.status as string | null | undefined)
}
