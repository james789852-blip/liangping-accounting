'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error('登入失敗：' + (error.message === 'Invalid login credentials' ? '帳號或密碼錯誤' : error.message))
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, is_hq')
      .eq('user_id', user.id)
      .single()

    const isHQ = profile && (profile.is_hq || profile.role === '老闆')
    toast.success('登入成功')
    router.push(isHQ ? '/hq/dashboard' : '/manager/dashboard')
    router.refresh()
  }

  function focusInput(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = '#6366f1'
    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(99,102,241,0.1)'
  }
  function blurInput(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = '#e4e4e7'
    e.currentTarget.style.boxShadow = 'none'
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden"
      style={{ background: '#fafafa' }}>

      {/* Mesh gradient 背景 */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `
          radial-gradient(at 0% 0%, #c7d2fe 0%, transparent 50%),
          radial-gradient(at 100% 0%, #fbcfe8 0%, transparent 50%),
          radial-gradient(at 50% 100%, #fed7aa 0%, transparent 50%)
        `,
        opacity: 0.6,
      }} />

      {/* 卡片 */}
      <div className="relative z-10 w-full" style={{ maxWidth: '440px' }}>
        <div className="relative" style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.5)',
          borderRadius: '24px',
          padding: '48px',
          boxShadow: '0 20px 50px -10px rgba(99,102,241,0.25)',
        }}>

          {/* Logo */}
          <img src="/icon.png" alt="logo" className="mb-7"
            style={{ width: '64px', height: '64px', borderRadius: '20px', objectFit: 'cover' }} />

          <h1 className="font-bold mb-1.5" style={{ fontSize: '28px', letterSpacing: '-0.02em', color: '#18181b' }}>
            歡迎回來
          </h1>
          <p className="text-sm mb-8" style={{ color: '#52525b' }}>登入梁平-作帳系統繼續</p>

          <form onSubmit={handleLogin} className="space-y-[18px]">
            <div>
              <label className="block text-[13px] font-medium mb-1.5" style={{ color: '#52525b' }}>
                電子郵件
              </label>
              <input
                type="email"
                className="w-full outline-none transition-all"
                style={{
                  padding: '12px 16px',
                  border: '1.5px solid #e4e4e7',
                  borderRadius: '12px',
                  fontSize: '15px',
                  background: 'white',
                  color: '#18181b',
                  fontFamily: 'inherit',
                }}
                placeholder="yourname@liang-ping.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[13px] font-medium" style={{ color: '#52525b' }}>密碼</label>
                <a href="/reset-password" className="text-[13px] font-medium" style={{ color: '#4f46e5' }}>
                  忘記密碼？
                </a>
              </div>
              <input
                type="password"
                className="w-full outline-none transition-all"
                style={{
                  padding: '12px 16px',
                  border: '1.5px solid #e4e4e7',
                  borderRadius: '12px',
                  fontSize: '15px',
                  background: 'white',
                  color: '#18181b',
                  fontFamily: 'inherit',
                }}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99]"
              style={{
                marginTop: '8px',
                padding: '13px',
                background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#ec4899 100%)',
                borderRadius: '12px',
                fontSize: '15px',
                border: 'none',
                boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                fontFamily: 'inherit',
              }}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? '登入中...' : '登入'}
            </button>
          </form>

          <p className="text-center text-[13px] mt-6" style={{ color: '#a1a1aa' }}>
            帳號由總公司管理員建立 ·{' '}
            <span style={{ color: '#52525b' }}>如需協助請聯絡總公司</span>
          </p>
        </div>
      </div>
    </div>
  )
}
