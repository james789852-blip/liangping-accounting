import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ManagerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('name, role')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900">店長端儀表板</h1>
      <p className="text-slate-500 mt-1">
        歡迎回來，{profile?.name ?? user.email}（{profile?.role}）
      </p>
      <div className="mt-8 p-6 bg-blue-50 rounded-xl border border-blue-200">
        <p className="text-blue-700 font-medium">登入成功！店長端功能建置中...</p>
        <p className="text-blue-500 text-sm mt-1">階段 4 將建立每日結帳頁面</p>
      </div>
    </div>
  )
}
