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

  // 央廚的配送統計要能直接標示店家名稱。歷史配送紀錄可能早於
  // 「指派店家」設定，因此要以全店家名稱表對照，不能只讀目前指派名單。
  let memberStoreNames: Record<string, string> = {}
  if (store?.type === '央廚') {
    const { data: members } = await admin.from('stores').select('id, name')
    memberStoreNames = Object.fromEntries((members ?? []).map((member: any) => [member.id, member.name]))
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
