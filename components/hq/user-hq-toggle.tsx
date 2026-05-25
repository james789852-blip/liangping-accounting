'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { updateUserHQ } from '@/app/actions/users'

export default function UserHQToggle({ userId, isHQ }: { userId: string; isHQ: boolean }) {
  const [loading, setLoading] = useState(false)
  const [value, setValue] = useState(isHQ)

  async function toggle() {
    setLoading(true)
    const result = await updateUserHQ(userId, !value)
    if (result.error) { toast.error(result.error) }
    else { setValue(prev => !prev); toast.success(value ? '已取消總公司後台權限' : '已設為總公司人員') }
    setLoading(false)
  }

  return (
    <button type="button" onClick={toggle} disabled={loading}
      title={value ? '取消總公司後台' : '設為總公司人員'}
      style={{
        position: 'relative', width: '36px', height: '20px', borderRadius: '10px', flexShrink: 0,
        background: value ? '#6366f1' : '#d4d4d8', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.5 : 1, transition: 'background 0.2s',
      }}>
      <span style={{
        position: 'absolute', top: '2px', left: '2px', width: '16px', height: '16px',
        background: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transform: value ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform 0.2s',
      }} />
    </button>
  )
}
