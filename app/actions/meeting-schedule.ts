'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthContext, canAccessStore } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'

export async function updateMeetingSchedule(storeId: string, patch: {
  meeting_anchor_date?: string | null
  meeting_frequency_days?: number
}) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  if (!canAccessStore(ctx, storeId)) return { error: '無權限' as const }

  const admin = createAdminClient()
  const { error } = await admin.from('stores').update(patch).eq('id', storeId)
  if (error) return { error: error.message }

  revalidatePath('/manager/meeting-report')
  revalidatePath('/manager/analytics')
  return { ok: true as const }
}
