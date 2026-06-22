import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FileSpreadsheet } from 'lucide-react'
import NativeExportClient from '@/components/hq/native-export-client'
import { sortStores } from '@/lib/store-order'

export const dynamic = 'force-dynamic'

export default async function NativeExportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && !['老闆', '經理', '總監'].includes(profile?.role ?? '')) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足</div>
  }

  const admin = createAdminClient()
  const { data: storesRaw } = await admin.from('stores').select('id, name, type, mode, closing_layout').eq('active', true)
  const stores = sortStores(storesRaw ?? []).filter((s: any) => s.type !== '央廚')

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <FileSpreadsheet className="h-3.5 w-3.5" />
            原生匯出（測試版）
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>新版 Excel 匯出</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
            由系統 schema 動態生成，不再依賴上傳模板。版型依店家結帳模式自動切換。
          </p>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-5 pb-28">
        <NativeExportClient stores={stores as any[]} />
      </div>
    </div>
  )
}
