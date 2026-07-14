import { getAuthedUser } from '@/lib/authed-user'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import ManagerNav from '@/components/manager/nav'
import HQNav from '@/components/hq/nav'
import { getCachedUserProfile, getCachedAllStores, getCachedStoreById } from '@/lib/cached-queries'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
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
  isStoreRole,
} from '@/lib/user-permissions'

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const profile = await getCachedUserProfile(user.id)
  // 店面角色固定以自己的主店為主；總公司角色只要有設定主店，也先進店面端。
  // 只有沒有主店的總公司角色才使用總公司端與切店 cookie。
  const isStoreManager = isStoreRole(profile?.role)
  const hasPrimaryStore = !!(profile as any)?.primary_store_id
  const isStoreView = isStoreManager || hasPrimaryStore
  const isHQ = !!profile && hasAnyHQPermission(profile) && !isStoreView

  let storeId: string | null = null
  let storeName = ''
  let storeType = '店面'
  let allStores: { id: string; name: string; type?: string }[] = []

  if (isHQ) {
    const cookieStore = await cookies()
    const cookieStoreId = cookieStore.get('hq_viewing_store')?.value

    if (profile.role === '老闆' || profile.is_hq) {
      allStores = await getCachedAllStores()
    } else {
      const allStoreIds: string[] = profile.store_ids ?? []
      if (allStoreIds.length) {
        const all = await getCachedAllStores()
        allStores = all.filter((s: any) => allStoreIds.includes(s.id))
      }
    }

    if (allStores.length) {
      const primary = (profile as any)?.primary_store_id as string | undefined
      storeId = (cookieStoreId && allStores.some(s => s.id === cookieStoreId))
        ? cookieStoreId
        : (primary && allStores.some(s => s.id === primary))
          ? primary
          : allStores[0].id
      const currentStore = allStores.find(s => s.id === storeId)
      storeName = currentStore?.name ?? ''
      storeType = (currentStore as any)?.type ?? '店面'
    }
  } else {
    // 店長端預設主店，但允許透過導覽列切換到帳號被授權的其他店家。
    const stores = await getCachedAllStores()
    const storeIds = profile?.store_ids ?? []
    allStores = stores.filter((s: any) => storeIds.includes(s.id))
    storeId = await getEffectiveStoreId(profile)

    if (storeId) {
      const store = await getCachedStoreById(storeId)
      storeName = (store as any)?.name ?? ''
      storeType = (store as any)?.type ?? '店面'
    }
  }

  if (isHQ) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <HQNav
          userName={profile?.name ?? user.email ?? ''}
          role={profile?.role ?? ''}
          allStores={allStores}
          currentStoreId={storeId ?? ''}
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

  return (
    <div className="flex min-h-screen bg-slate-50">
      <ManagerNav
        userName={profile?.name ?? user.email ?? ''}
        storeName={storeName}
        role={profile?.role ?? ''}
        storeType={storeType}
        stores={allStores}
        currentStoreId={storeId ?? ''}
      />
      <main className="flex-1 overflow-auto pt-14 pb-20 lg:pt-0 lg:pb-0">
        {children}
      </main>
    </div>
  )
}
