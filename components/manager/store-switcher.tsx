'use client'

import { useTransition } from 'react'
import { setManagerStore } from '@/app/actions/store-select'
import { useRouter } from 'next/navigation'

interface Store { id: string; name: string }

export default function StoreSwitcher({ stores, currentStoreId, className }: { stores: Store[]; currentStoreId: string; className?: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    startTransition(async () => {
      await setManagerStore(e.target.value)
      router.refresh()
    })
  }

  return (
    <select
      value={currentStoreId}
      onChange={handleChange}
      disabled={pending}
      className={className ?? "text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"}
    >
      {stores.map(s => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  )
}
