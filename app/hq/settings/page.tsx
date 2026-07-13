import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { redirect } from 'next/navigation'
import { Settings } from 'lucide-react'

export default async function SettingsPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('user_id', user.id).single()

  if (!profile || !['顧問', '經理', '總監'].includes(profile.role)) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足</div>
  }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <Settings className="h-3.5 w-3.5" />
            系統設定
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>系統設定</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>系統相關設定</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 pb-28">
        <div className="bg-white rounded-2xl p-6 text-center" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <p className="text-sm" style={{ color: '#a1a1aa' }}>目前無可設定項目</p>
        </div>
      </div>
    </div>
  )
}
