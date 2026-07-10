'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { hasAnyHQPermission, isStoreRole } from '@/lib/user-permissions'

export default function LoginPage() {
  const router = useRouter()
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('lp_saved_account')
    if (saved) { setAccount(saved); setRemember(true) }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!account.trim()) { toast.error('請輸入帳號（身分證字號）'); return }
    setLoading(true)

    const email = `${account.trim().toUpperCase()}@liang-ping.com`

    if (remember) {
      localStorage.setItem('lp_saved_account', account.trim().toUpperCase())
    } else {
      localStorage.removeItem('lp_saved_account')
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error('帳號或密碼錯誤，請確認後重試')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, is_hq, can_manage_users, can_manage_stores, can_manage_store_settings, can_manage_ck_settings, can_manage_items, can_manage_store_items, can_manage_ck_items, can_manage_store_receipts, can_manage_ck_receipts, can_manage_ck_prices, can_review_closings, can_export_reports')
      .eq('user_id', user.id)
      .single()

    // 店家角色（店長/副店長/小幫手/廠長/副廠長）一律進 manager dashboard，不論 is_hq
    const storeRole = isStoreRole(profile?.role)
    const isHQ = hasAnyHQPermission(profile)
    toast.success('登入成功')
    router.push(isHQ ? '/hq/dashboard' : '/manager/dashboard')
    router.refresh()
  }

  function focusInput(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = '#F59E0B'
    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(245,158,11,0.12)'
  }
  function blurInput(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = '#e4e4e7'
    e.currentTarget.style.boxShadow = 'none'
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden"
      style={{ background: '#fafafa' }}>

      <div className="absolute inset-0 pointer-events-none" style={{
        background: `
          radial-gradient(at 0% 0%, #FDE68A 0%, transparent 50%),
          radial-gradient(at 100% 0%, #fde68a 0%, transparent 50%),
          radial-gradient(at 50% 100%, #fed7aa 0%, transparent 50%)
        `,
        opacity: 0.6,
      }} />

      <div className="relative z-10 w-full" style={{ maxWidth: '440px' }}>
        <div className="relative" style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.5)',
          borderRadius: '24px',
          padding: '48px',
          boxShadow: '0 20px 50px -10px rgba(245,158,11,0.2)',
        }}>

          <img src="/icon-192.png" alt="logo" className="mb-7"
            style={{ width: '64px', height: '64px', borderRadius: '20px', objectFit: 'cover' }} />

          <h1 className="font-bold mb-1.5" style={{ fontSize: '28px', letterSpacing: '-0.02em', color: '#18181b' }}>
            歡迎回來
          </h1>
          <p className="text-sm mb-8" style={{ color: '#52525b' }}>登入結帳系統繼續</p>

          <form onSubmit={handleLogin} className="space-y-[18px]">
            <div>
              <label className="block text-[13px] font-medium mb-1.5" style={{ color: '#52525b' }}>
                帳號（身分證字號）<span style={{ color: '#a1a1aa', fontWeight: 400 }}>· 第一個字母請大寫</span>
              </label>
              <input
                type="text"
                className="w-full outline-none transition-all"
                style={{
                  padding: '12px 16px',
                  border: '1.5px solid #e4e4e7',
                  borderRadius: '12px',
                  fontSize: '15px',
                  background: 'white',
                  color: '#18181b',
                  fontFamily: 'inherit',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
                placeholder=""
                value={account}
                onChange={e => setAccount(e.target.value.toUpperCase())}
                required
                autoComplete="username"
                autoCapitalize="characters"
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium mb-1.5" style={{ color: '#52525b' }}>
                密碼（出生年月日 YYMMDD）
              </label>
              <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                className="w-full outline-none transition-all"
                style={{
                  padding: '12px 44px 12px 16px',
                  border: '1.5px solid #e4e4e7',
                  borderRadius: '12px',
                  fontSize: '15px',
                  background: 'white',
                  color: '#18181b',
                  fontFamily: 'inherit',
                }}
                placeholder=""
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                onFocus={focusInput}
                onBlur={blurInput}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                {showPw ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
              </button>
              </div>
            </div>

            {/* 記住帳號 */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#F59E0B', cursor: 'pointer' }}
              />
              <span className="text-[13px]" style={{ color: '#52525b' }}>記住帳號</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99]"
              style={{
                marginTop: '8px',
                padding: '13px',
                background: 'linear-gradient(135deg,#FBBF24 0%,#F59E0B 50%,#F97316 100%)',
                borderRadius: '12px',
                fontSize: '15px',
                border: 'none',
                boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
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
