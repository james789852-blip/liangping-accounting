'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { updateUserHQ } from '@/app/actions/users'
import { cn } from '@/lib/utils'

export default function UserHQToggle({ userId, isHQ }: { userId: string; isHQ: boolean }) {
  const [loading, setLoading] = useState(false)
  const [value, setValue] = useState(isHQ)

  async function toggle() {
    setLoading(true)
    const result = await updateUserHQ(userId, !value)
    if (result.error) {
      toast.error(result.error)
    } else {
      setValue(prev => !prev)
      toast.success(value ? '已取消總公司後台權限' : '已設為總公司人員')
    }
    setLoading(false)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      title={value ? '取消總公司後台' : '設為總公司人員'}
      className={cn(
        'relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50',
        value ? 'bg-blue-500' : 'bg-slate-300'
      )}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
        value ? 'translate-x-4' : 'translate-x-0'
      )} />
    </button>
  )
}
