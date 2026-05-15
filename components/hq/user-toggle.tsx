'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { updateUserStatus } from '@/app/actions/users'

export default function UserToggle({ userId, active }: { userId: string; active: boolean }) {
  const [loading, setLoading] = useState(false)
  const [isActive, setIsActive] = useState(active)

  async function toggle() {
    setLoading(true)
    const result = await updateUserStatus(userId, !isActive)
    if (result.error) {
      toast.error(result.error)
    } else {
      setIsActive(prev => !prev)
      toast.success(isActive ? '帳號已停用' : '帳號已啟用')
    }
    setLoading(false)
  }

  return (
    <Button
      variant={isActive ? 'outline' : 'default'}
      size="sm"
      onClick={toggle}
      disabled={loading}
      className="shrink-0 text-xs"
    >
      {isActive ? '停用' : '啟用'}
    </Button>
  )
}
