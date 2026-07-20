import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import AnalyticsClient from './client'

export const dynamic = 'force-dynamic'

export default async function ManagerAnalyticsPage() {
  const supabase = await createClient()
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) redirect('/manager/dashboard')

  const admin = createAdminClient()
  const { data: store } = await admin
    .from('stores')
    .select('name, type, ichef_uber_linked')
    .eq('id', storeId)
    .single()

  // 央廚的配送統計要能直接標示店家名稱；名稱由伺服器端讀取，
  // 不受店長端資料讀取權限影響。
  let memberStoreNames: Record<string, string> = {}
  if (store?.type === '央廚') {
    const { data: ckStore } = await admin
      .from('ck_stores')
      .select('assigned_store_ids')
      .eq('id', storeId)
      .maybeSingle()
    const assignedIds = ((ckStore?.assigned_store_ids ?? []) as string[]).filter(Boolean)
    if (assignedIds.length > 0) {
      const { data: members } = await admin
        .from('stores')
        .select('id, name')
        .in('id', assignedIds)
      memberStoreNames = Object.fromEntries((members ?? []).map((member: any) => [member.id, member.name]))
    }
  }

  return (
    <AnalyticsClient
      storeId={storeId}
      storeName={(store?.name as string | null) ?? '我的店'}
      storeType={(store?.type as string | null) ?? null}
      ichefUberLinked={Boolean(store?.ichef_uber_linked)}
      memberStoreNames={memberStoreNames}
    />
  )
}
