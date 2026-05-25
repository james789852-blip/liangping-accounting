'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { updateUserStatus } from '@/app/actions/users'

export default function UserToggle({ userId, active }: { userId: string; active: boolean }) {
  const [loading, setLoading] = useState(false)
  const [isActive, setIsActive] = useState(active)

  async function toggle() {
    setLoading(true)
    const result = await updateUserStatus(userId, !isActive)
    if (result.error) { toast.error(result.error) }
    else { setIsActive(prev => !prev); toast.success(isActive ? '帳號已停用' : '帳號已啟用') }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle} disabled={loading}
      className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl"
      style={{
        background: isActive ? 'white' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
        color: isActive ? '#52525b' : 'white',
        border: isActive ? '1px solid #e4e4e7' : 'none',
        opacity: loading ? 0.5 : 1,
        boxShadow: isActive ? 'none' : '0 2px 8px rgba(99,102,241,0.25)',
      }}>
      {isActive ? '停用' : '啟用'}
    </button>
  )
}
