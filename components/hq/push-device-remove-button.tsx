'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { removeUserPushDevice } from '@/app/actions/push-management'

export default function PushDeviceRemoveButton({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function remove() {
    if (!window.confirm('確定解除這台裝置的推播綁定？裝置下次登入時仍可重新開啟。')) return
    setPending(true)
    const result = await removeUserPushDevice(subscriptionId)
    if ('error' in result) toast.error(result.error)
    else {
      toast.success(`${result.deviceName}已解除綁定`)
      router.refresh()
    }
    setPending(false)
  }

  return (
    <button type="button" onClick={remove} disabled={pending}
      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50">
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
      解除
    </button>
  )
}
