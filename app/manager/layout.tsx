import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import ManagerNav from '@/components/manager/nav'
import StoreSwitcher from '@/components/manager/store-switcher'
import { Building2, ArrowLeft } from 'lucide-react'

const HQ_ROLES = ['顧問', '經理', '總監']

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('name, role, store_ids')
    .eq('user_id', user.id)
    .single()

  const isHQ = profile && HQ_ROLES.includes(profile.role)

  // 決定要看哪家店
  let storeId: string | null = null
  let storeName = ''

  if (isHQ) {
    // HQ 用戶：從 cookie 取選擇的店，沒有就用第一家
    const cookieStore = await cookies()
    const cookieStoreId = cookieStore.get('hq_viewing_store')?.value
    const allStoreIds: string[] = profile.store_ids ?? []
    storeId = (cookieStoreId && allStoreIds.includes(cookieStoreId))
      ? cookieStoreId
      : allStoreIds[0] ?? null
  } else {
    storeId = profile?.store_ids?.[0] ?? null
  }

  if (storeId) {
    const { data: store } = await supabase
      .from('stores').select('name').eq('id', storeId).single()
    storeName = store?.name ?? ''
  }

  // 給 HQ 用戶用的店家清單（只顯示被指派的店）
  let allStores: { id: string; name: string }[] = []
  if (isHQ && profile?.store_ids?.length) {
    const { data: stores } = await supabase
      .from('stores')
      .select('id, name')
      .eq('active', true)
      .in('id', profile.store_ids)
      .order('name')
    allStores = stores ?? []
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <ManagerNav
        userName={profile?.name ?? user.email ?? ''}
        storeName={storeName}
        role={profile?.role ?? ''}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {/* HQ 用戶專用橫幅 */}
        {isHQ && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 shrink-0">
            <Building2 className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-xs text-amber-700 font-medium">總公司視角</span>
            <span className="text-xs text-amber-600">正在查看：</span>
            <StoreSwitcher stores={allStores} currentStoreId={storeId ?? ''} />
            <div className="ml-auto">
              <Link
                href="/hq/dashboard"
                className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium"
              >
                <ArrowLeft className="h-3 w-3" />
                返回總公司端
              </Link>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-auto pt-12 pb-20 lg:pt-0 lg:pb-0">
          {children}
        </main>
      </div>
    </div>
  )
}
