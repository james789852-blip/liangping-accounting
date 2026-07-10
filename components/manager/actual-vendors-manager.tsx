'use client'

import { useMemo, useState, useTransition } from 'react'
import { Archive, Check, Edit3, Merge, Store, X } from 'lucide-react'
import { toast } from 'sonner'
import { deactivateActualVendor, updateActualVendorName } from '@/app/actions/actual-vendors'

export type ActualVendorManagerRow = {
  id: string
  vendor_group: string
  name: string
  active: boolean
  receiptCount: number
  totalAmount: number
}

interface Props {
  storeName: string
  vendors: ActualVendorManagerRow[]
}

function formatCurrency(value: number) {
  return `$${Math.round(value || 0).toLocaleString()}`
}

export default function ActualVendorsManager({ storeName, vendors }: Props) {
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(vendors.map(v => [v.id, v.name])))
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const groups = useMemo(() => {
    const grouped = new Map<string, ActualVendorManagerRow[]>()
    for (const vendor of vendors) {
      const key = vendor.vendor_group || '未分類'
      grouped.set(key, [...(grouped.get(key) ?? []), vendor])
    }
    return Array.from(grouped.entries())
  }, [vendors])

  function handleSave(vendor: ActualVendorManagerRow) {
    const nextName = (names[vendor.id] ?? '').trim()
    if (!nextName) {
      toast.error('請輸入實際廠商名稱')
      return
    }
    setPendingId(vendor.id)
    startTransition(async () => {
      const result = await updateActualVendorName(vendor.id, nextName)
      setPendingId(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(result.merged ? '已合併到既有廠商，歷史收據也已同步' : '實際廠商名稱已更新，歷史收據也已同步')
    })
  }

  function handleDeactivate(vendor: ActualVendorManagerRow) {
    if (!confirm(`停用「${vendor.name}」後，之後輸入收據時不會再出現在下拉選單。\n\n歷史收據不會刪除。確定停用嗎？`)) return
    setPendingId(vendor.id)
    startTransition(async () => {
      const result = await deactivateActualVendor(vendor.id)
      setPendingId(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('已停用，此名稱之後不會再出現在下拉選單')
    })
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
            <Store className="h-4 w-4" />
            {storeName}
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-950">實際廠商管理</h1>
            <p className="mt-1 text-sm font-medium text-zinc-500">
              店長新增過的實際廠商會記在這裡。改名會同步舊收據；改成已存在的名稱會自動合併，避免統計被錯字拆開。
            </p>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-bold text-zinc-400">目前名稱</p>
            <p className="mt-1 text-2xl font-black text-zinc-950">{vendors.length}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-bold text-zinc-400">歷史收據</p>
            <p className="mt-1 text-2xl font-black text-zinc-950">
              {vendors.reduce((sum, vendor) => sum + vendor.receiptCount, 0).toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-bold text-zinc-400">累計金額</p>
            <p className="mt-1 text-2xl font-black text-zinc-950">
              {formatCurrency(vendors.reduce((sum, vendor) => sum + vendor.totalAmount, 0))}
            </p>
          </div>
        </section>

        {groups.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
            <p className="text-base font-bold text-zinc-700">尚未記住任何實際廠商</p>
            <p className="mt-2 text-sm text-zinc-500">店長在收據輸入頁新增後，這裡就能改名或停用。</p>
          </section>
        ) : (
          <section className="space-y-4">
            {groups.map(([groupName, rows]) => (
              <div key={groupName} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
                  <div>
                    <h2 className="text-lg font-black text-zinc-950">{groupName}</h2>
                    <p className="text-xs font-semibold text-zinc-400">{rows.length} 間實際廠商</p>
                  </div>
                  <div className="hidden items-center gap-2 rounded-full bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-500 sm:flex">
                    <Merge className="h-3.5 w-3.5" />
                    改成既有名稱即合併
                  </div>
                </div>

                <div className="divide-y divide-zinc-100">
                  {rows.map(vendor => {
                    const dirty = (names[vendor.id] ?? '') !== vendor.name
                    const loading = isPending && pendingId === vendor.id
                    return (
                      <div key={vendor.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Edit3 className="h-4 w-4 shrink-0 text-zinc-400" />
                            <input
                              value={names[vendor.id] ?? vendor.name}
                              onChange={event => setNames(prev => ({ ...prev, [vendor.id]: event.target.value }))}
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-base font-bold text-zinc-950 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                            />
                          </div>
                          <p className="mt-2 text-xs font-medium text-zinc-400">
                            {vendor.receiptCount.toLocaleString()} 筆收據 · {formatCurrency(vendor.totalAmount)}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={!dirty || loading}
                          onClick={() => handleSave(vendor)}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-black text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
                        >
                          <Check className="h-4 w-4" />
                          儲存
                        </button>

                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleDeactivate(vendor)}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-black text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {loading ? <X className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                          停用
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}

