'use client'

import { useRouter } from 'next/navigation'

interface Store { id: string; name: string }

export default function StoreSelector({ stores, currentStoreId }: { stores: Store[]; currentStoreId: string }) {
  const router = useRouter()
  return (
    <select value={currentStoreId} onChange={e => router.push(`/hq/receipt-settings?storeId=${e.target.value}`)}
      style={{
        width: '100%', height: 44, padding: '0 14px', border: '1.5px solid #e4e4e7',
        borderRadius: 10, fontSize: 14, outline: 'none', background: 'white', fontFamily: 'inherit',
      }}>
      {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  )
}
