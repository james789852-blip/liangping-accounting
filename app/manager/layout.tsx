import { getAuthedUser } from '@/lib/authed-user'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import ManagerNav from '@/components/manager/nav'
import HQNav from '@/components/hq/nav'
import { getCachedUserProfile, getCachedAllStores, getCachedStoreById } from '@/lib/cached-queries'
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

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const profile = await getCachedUserProfile(user.id)
  const isHQ = profile && hasAnyHQPermission(profile)

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
    // 一般店家角色：優先用主店 (primary_store_id)，其次 store_ids 第一個
    const cookieStore = await cookies()
    const cookieStoreId = cookieStore.get('hq_viewing_store')?.value
    const primary = (profile as any)?.primary_store_id as string | undefined
    const storeIds = profile?.store_ids ?? []
    // 店長端以個人主店為固定預設；只有未設定主店時才沿用曾切換的店家。
    // 避免多店權限使用者因總公司端留下的 cookie 被帶到其他店。
    if (primary && storeIds.includes(primary)) storeId = primary
    else if (cookieStoreId && storeIds.includes(cookieStoreId)) storeId = cookieStoreId
    else storeId = storeIds[0] ?? null

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
      />
      <main className="flex-1 overflow-auto pt-14 pb-20 lg:pt-0 lg:pb-0">
        {children}
      </main>
    </div>
  )
}
