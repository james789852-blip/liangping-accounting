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
  canManageItems,
  canManageStoreItems,
  canManageStoreReceipts,
  canManageStoreSettings,
  canManageStores,
  canManageUsers,
  canReviewClosings,
  canExportReports,
  hasAnyHQPermission,
} from '@/lib/user-permissions'

export default async function HQLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getCachedUserProfile(user.id)

  if (!profile || !hasAnyHQPermission(profile)) {
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
    allStores = all.filter((s: any) => storeIds.includes(s.id))
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
          canManageUsers: canManageUsers(profile),
          canManageStores: canManageStores(profile),
          canManageStoreSettings: canManageStoreSettings(profile),
          canManageCKSettings: canManageCKSettings(profile),
          canManageItems: canManageItems(profile),
          canManageStoreItems: canManageStoreItems(profile),
          canManageCKItems: canManageCKItems(profile),
          canManageStoreReceipts: canManageStoreReceipts(profile),
          canManageCKReceipts: canManageCKReceipts(profile),
          canManageCKPrices: canManageCKPrices(profile),
          canReviewClosings: canReviewClosings(profile),
          canExportReports: canExportReports(profile),
        }}
      />
      <main className="flex-1 overflow-auto pt-14 pb-20 lg:pt-0 lg:pb-0">
        {children}
      </main>
    </div>
  )
}
