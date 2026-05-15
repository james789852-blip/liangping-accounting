import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HQDashboard() {
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
      <h1 className="text-2xl font-bold text-slate-900">總公司儀表板</h1>
      <p className="text-slate-500 mt-1">
        歡迎回來，{profile?.name ?? user.email}（{profile?.role}）
      </p>
      <div className="mt-8 p-6 bg-green-50 rounded-xl border border-green-200">
        <p className="text-green-700 font-medium">登入成功！總公司端功能建置中...</p>
        <p className="text-green-500 text-sm mt-1">階段 5 將建立總公司儀表板</p>
      </div>
    </div>
  )
}
