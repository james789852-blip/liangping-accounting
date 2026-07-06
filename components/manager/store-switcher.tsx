'use client'

import { useTransition } from 'react'
import { setManagerStore } from '@/app/actions/store-select'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

interface Store { id: string; name: string; type?: string }

export default function StoreSwitcher({ stores, currentStoreId, className, style }: { stores: Store[]; currentStoreId: string; className?: string; style?: React.CSSProperties }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextStoreId = e.target.value
    startTransition(async () => {
      await setManagerStore(nextStoreId)
      if (pathname.startsWith('/hq')) {
        const nextStore = stores.find(s => s.id === nextStoreId)
        const params = new URLSearchParams(searchParams.toString())
        if (pathname === '/hq/accounting' && nextStore?.type === '央廚') {
          params.set('tab', 'ck')
          params.set('ckStoreId', nextStoreId)
        } else {
          if (pathname === '/hq/accounting') params.set('tab', 'store')
          params.set('storeId', nextStoreId)
        }
        router.replace(`${pathname}?${params.toString()}`)
      } else {
        router.refresh()
      }
    })
  }

  const hasTypes = stores.some(s => s.type && s.type !== '店面')

  return (
    <select
      value={currentStoreId}
      onChange={handleChange}
      disabled={pending}
      className={className ?? "text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"}
      style={style}
    >
      {hasTypes
        ? (['店面', '央廚'] as const).map(type => {
            const group = stores.filter(s => (s.type ?? '店面') === type)
            if (group.length === 0) return null
            return (
              <optgroup key={type} label={`── ${type} ──`}>
                {group.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            )
          })
        : stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
      }
    </select>
  )
}
