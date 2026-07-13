import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Settings as SettingsIcon } from 'lucide-react'
import SystemConfigClient from '@/components/hq/system-config-client'

export const dynamic = 'force-dynamic'

export default async function SystemConfigPage() {
  const supabase = await createClient()
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && !['老闆', '經理', '總監'].includes(profile?.role ?? '')) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足</div>
  }

  const admin = createAdminClient()
  const [{ data: vgs }, { data: items }, { data: storeUsage }] = await Promise.all([
    admin.from('system_vendor_groups').select('*').order('sort_order').order('name'),
    admin.from('system_items').select('*').order('sort_order').order('name'),
    admin.from('store_items').select('system_item_id'),
  ])

  // 計算每個 system_item 被幾家店使用
  const usageCount: Record<string, number> = {}
  for (const su of (storeUsage ?? []) as { system_item_id: string | null }[]) {
    if (su.system_item_id) usageCount[su.system_item_id] = (usageCount[su.system_item_id] ?? 0) + 1
  }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <SettingsIcon className="h-3.5 w-3.5" />
            全公司結帳設定
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>系統設定</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
            管理全公司共用的廠商分類與品項主表。每店可在自己的「品項管理」頁啟用/停用所需項目。
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 pb-28">
        <SystemConfigClient
          initialVendorGroups={(vgs ?? []) as any[]}
          initialItems={(items ?? []) as any[]}
          usageCount={usageCount}
        />
      </div>
    </div>
  )
}
