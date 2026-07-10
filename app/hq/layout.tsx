import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import HQNav from '@/components/hq/nav'
import { getCachedUserProfile, getCachedAllStores } from '@/lib/cached-queries'
import {
  canManageCKItems,
  canManageCKPrices,
  canManageCKReceipts,
  canManageCKSettings,
  canManageStoreItems,
  canManageStoreReceipts,
  canManageStoreSettings,
  hasAnyHQPermission,
} from '@/lib/user-permissions'

export default async function HQLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getCachedUserProfile(user.id)

  const isCKManager = ['廠長', '副廠長'].includes(profile?.role ?? '')

  if (!profile || (!hasAnyHQPermission(profile) && !isCKManager)) {
    redirect('/manager')
  }

  let allStores: { id: string; name: string; type?: string }[] = []
  let currentStoreId = ''

  const cookieStore = await cookies()
  const cookieStoreId = cookieStore.get('hq_viewing_store')?.value

  if (hasAnyHQPermission(profile)) {
    allStores = await getCachedAllStores()
  } else if (profile.store_ids?.length) {
    const all = await getCachedAllStores()
    const storeIds: string[] = profile.store_ids
    allStores = all.filter((s: any) => storeIds.includes(s.id) && (!isCKManager || s.type === '央廚'))
  }

  if (allStores.length) {
    const primary = (profile as any)?.primary_store_id as string | undefined
    currentStoreId = (cookieStoreId && allStores.some(s => s.id === cookieStoreId))
      ? cookieStoreId
      : (primary && allStores.some(s => s.id === primary))
        ? primary
        : allStores[0].id
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <HQNav
        userName={profile?.name ?? user.email ?? ''}
        role={profile?.role ?? ''}
        allStores={allStores}
        currentStoreId={currentStoreId}
        permissions={{
          canManageUsers: !!((profile as any)?.role === '老闆' || (profile as any)?.can_manage_users),
          canManageStores: !!(['老闆', '經理', '總監'].includes((profile as any)?.role ?? '') || (profile as any)?.can_manage_stores),
          canManageStoreSettings: canManageStoreSettings(profile),
          canManageCKSettings: canManageCKSettings(profile),
          canManageItems: !!(['老闆', '經理', '總監'].includes((profile as any)?.role ?? '') || (profile as any)?.can_manage_items),
          canManageStoreItems: canManageStoreItems(profile),
          canManageCKItems: canManageCKItems(profile),
          canManageStoreReceipts: canManageStoreReceipts(profile),
          canManageCKReceipts: canManageCKReceipts(profile),
          canManageCKPrices: canManageCKPrices(profile),
          canReviewClosings: !!(['老闆', '經理', '總監'].includes((profile as any)?.role ?? '') || (profile as any)?.can_review_closings),
          canExportReports: !!(['老闆', '經理', '總監'].includes((profile as any)?.role ?? '') || (profile as any)?.can_export_reports),
        }}
      />
      <main className="flex-1 overflow-auto pt-14 pb-20 lg:pt-0 lg:pb-0">
        {children}
      </main>
    </div>
  )
}
