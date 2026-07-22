'use server'

import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

interface PettyCashCountPayload {
  bills_1000: number; bills_500: number; bills_100: number
  coins_50: number; coins_10: number; coins_5: number; coins_1: number
  lump_1000: number; lump_500: number; lump_100: number
  lump_50: number; lump_10: number; lump_5: number; lump_1: number
}

export async function savePettyCashCount(
  storeId: string,
  countDate: string,
  counts: PettyCashCountPayload,
) {
  const supabase = await createClient()
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('petty_cash_counts')
    .upsert(
      {
        store_id: storeId,
        count_date: countDate,
        created_by: user.id,
        updated_at: new Date().toISOString(),
        ...counts,
      },
      { onConflict: 'store_id,count_date' },
    )

  if (error) return { error: error.message }
  revalidatePath('/manager/cash')
  return { success: true }
}
