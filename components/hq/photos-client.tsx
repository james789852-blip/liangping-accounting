'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, ChevronDown, ExternalLink, Image as ImageIcon, Search, Store, X } from 'lucide-react'

export interface PhotoLibraryItem {
  id: string
  url: string
  storeId: string
  storeName: string
  storeType: string
  date: string
  kind: string
  label: string
  source: string
}

interface Props {
  photos: PhotoLibraryItem[]
  year: number
  month: number
  currentYear: number
}

function fmtDate(value: string) {
  return value ? value.replace(/-/g, '/') : '—'
}

export default function PhotosClient({ photos, year, month, currentYear }: Props) {
  const router = useRouter()
  const [storeFilter, setStoreFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<PhotoLibraryItem | null>(null)

  const stores = useMemo(() => Array.from(new Map(photos.map(photo => [photo.storeId, { id: photo.storeId, name: photo.storeName, type: photo.storeType }])).values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')), [photos])
  const kinds = useMemo(() => Array.from(new Set(photos.map(photo => photo.kind))).sort((a, b) => a.localeCompare(b, 'zh-Hant')), [photos])
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return photos.filter(photo => {
      if (storeFilter !== 'all' && photo.storeId !== storeFilter) return false
      if (kindFilter !== 'all' && photo.kind !== kindFilter) return false
      if (keyword && !`${photo.storeName} ${photo.kind} ${photo.label} ${photo.source}`.toLowerCase().includes(keyword)) return false
      return true
    })
  }, [kindFilter, photos, search, storeFilter])
  const storeSummaries = useMemo(() => {
    const map = new Map<string, { storeId: string; storeName: string; storeType: string; photos: PhotoLibraryItem[] }>()
    for (const photo of filtered) {
      const key = `${photo.storeType}|${photo.storeId}`
      const group = map.get(key) ?? { storeId: photo.storeId, storeName: photo.storeName, storeType: photo.storeType, photos: [] }
      group.photos.push(photo)
      map.set(key, group)
    }
    return [...map.values()].sort((a, b) => `${a.storeType}${a.storeName}`.localeCompare(`${b.storeType}${b.storeName}`, 'zh-Hant'))
  }, [filtered])
  const selectedStore = storeFilter === 'all' ? null : stores.find(store => store.id === storeFilter) ?? null
  const dateGroups = useMemo(() => {
    if (!selectedStore) return []
    const byDate = new Map<string, Map<string, PhotoLibraryItem[]>>()
    for (const photo of filtered) {
      const kindMap = byDate.get(photo.date) ?? new Map<string, PhotoLibraryItem[]>()
      const items = kindMap.get(photo.kind) ?? []
      items.push(photo)
      kindMap.set(photo.kind, items)
      byDate.set(photo.date, kindMap)
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, kindMap]) => ({
        date,
        kinds: [...kindMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b, 'zh-Hant'))
          .map(([kind, items]) => ({ kind, photos: items })),
      }))
  }, [filtered, selectedStore])

  function changeMonth(nextYear: number, nextMonth: number) {
    router.push(`/hq/photos?year=${nextYear}&month=${nextMonth}`)
  }

  const years = Array.from({ length: 6 }, (_, index) => currentYear - index)
  const monthOptions = Array.from({ length: 12 }, (_, index) => index + 1)

  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-2xl border border-orange-100 bg-white px-5 py-5 shadow-sm sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-orange-700"><ImageIcon className="h-4 w-4" />總公司 · 照片管理</div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">帳目照片分類</h1>
              <p className="mt-1 text-sm text-slate-500">先選店家，再依日期與照片類型查看，避免不同帳目的照片混在一起。</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-sm font-bold text-orange-800">
              <ImageIcon className="h-4 w-4" /> {filtered.length} 張
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[auto_auto_1fr]">
            <label className="flex h-11 items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-orange-900">
              <Calendar className="h-4 w-4" />
              <select aria-label="照片年份" value={year} onChange={e => changeMonth(Number(e.target.value), month)} className="cursor-pointer bg-transparent outline-none">
                {years.map(value => <option key={value} value={value}>{value} 年</option>)}
              </select>
            </label>
            <label className="flex h-11 items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-orange-900">
              <select aria-label="照片月份" value={month} onChange={e => changeMonth(year, Number(e.target.value))} className="cursor-pointer bg-transparent outline-none">
                {monthOptions.map(value => <option key={value} value={value}>{value} 月</option>)}
              </select>
            </label>
            <label className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋店家、照片類型或說明" className="min-w-0 flex-1 bg-transparent outline-none" />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="relative flex min-w-[170px] flex-1 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 sm:flex-none">
              <Store className="mr-2 h-4 w-4 text-slate-400" />
              <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)} aria-label="店家篩選" className="h-10 w-full appearance-none bg-transparent pr-5 outline-none">
                <option value="all">全部店面與央廚</option>
                {stores.map(store => <option key={store.id} value={store.id}>{store.type} · {store.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" />
            </label>
            <label className="relative flex min-w-[170px] flex-1 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 sm:flex-none">
              <select value={kindFilter} onChange={e => setKindFilter(e.target.value)} aria-label="照片類型篩選" className="h-10 w-full appearance-none bg-transparent pr-5 outline-none">
                <option value="all">全部照片類型</option>
                {kinds.map(kind => <option key={kind} value={kind}>{kind}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" />
            </label>
          </div>
        </header>

        {storeSummaries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-400">這個月份與篩選條件沒有照片</div>
        ) : !selectedStore ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div>
                <h2 className="font-bold text-slate-900">店家照片總覽</h2>
                <p className="mt-0.5 text-xs text-slate-500">選擇店家後，會依日期與照片類型分類顯示。</p>
              </div>
              <span className="text-sm font-semibold text-slate-500">{storeSummaries.length} 個單位</span>
            </div>
            {(['店面', '央廚'] as const).map(type => {
              const groups = storeSummaries.filter(group => group.storeType === type)
              if (!groups.length) return null
              return (
                <section key={type} className="space-y-3">
                  <div className="flex items-center gap-2 px-1"><span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${type === '央廚' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-800'}`}>{type}</span><span className="text-sm font-semibold text-slate-500">{groups.reduce((sum, group) => sum + group.photos.length, 0)} 張</span></div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {groups.map(group => {
                      const kinds = [...new Set(group.photos.map(photo => photo.kind))]
                      const dates = group.photos.map(photo => photo.date).sort()
                      return (
                        <button key={group.storeId} type="button" onClick={() => setStoreFilter(group.storeId)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md">
                          <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-900">{group.storeName}</h3><p className="mt-1 text-xs text-slate-500">{fmtDate(dates[0])} — {fmtDate(dates[dates.length - 1])}</p></div><span className="rounded-lg bg-orange-50 px-2.5 py-1 text-sm font-bold text-orange-700">{group.photos.length} 張</span></div>
                          <p className="mt-4 line-clamp-2 text-xs leading-5 text-slate-500">{kinds.slice(0, 4).join(' · ')}{kinds.length > 4 ? ` 等 ${kinds.length} 類` : ''}</p>
                          <p className="mt-4 text-sm font-bold text-orange-700">查看分類照片 →</p>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
              <div className="flex items-center gap-3"><button type="button" onClick={() => setStoreFilter('all')} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="回到全部店家"><ArrowLeft className="h-4 w-4" /></button><div><p className="text-xs font-semibold text-slate-500">{selectedStore.type}</p><h2 className="font-bold text-slate-900">{selectedStore.name}</h2></div></div>
              <span className="rounded-lg bg-orange-50 px-3 py-1.5 text-sm font-bold text-orange-700">{filtered.length} 張</span>
            </div>
            {dateGroups.map(({ date, kinds }, index) => {
              const count = kinds.reduce((sum, group) => sum + group.photos.length, 0)
              return (
                <details key={date} open={index === 0} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-5"><div><h3 className="font-bold text-slate-900">{fmtDate(date)}</h3><p className="mt-0.5 text-xs text-slate-500">{kinds.length} 種照片類型</p></div><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-600">{count} 張</span></summary>
                  <div className="space-y-5 border-t border-slate-100 p-4 sm:p-5">
                    {kinds.map(group => (
                      <section key={group.kind}>
                        <div className="mb-2 flex items-center gap-2"><span className="rounded-md bg-orange-50 px-2 py-1 text-xs font-bold text-orange-800">{group.kind}</span><span className="text-xs text-slate-400">{group.photos.length} 張</span></div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                          {group.photos.map(photo => (
                            <button key={photo.id} type="button" onClick={() => setPreview(photo)} className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                              <div className="aspect-square overflow-hidden bg-slate-100"><img src={photo.url} alt={photo.label || photo.kind} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" /></div>
                              <div className="space-y-0.5 p-2"><p className="truncate text-xs font-bold text-slate-700">{photo.label || photo.source}</p><p className="text-[10px] text-slate-400">{photo.source}</p></div>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </details>
              )
            })}
          </div>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreview(null)}>
          <div className="relative flex max-h-full max-w-5xl flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setPreview(null)} className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow"><X className="h-5 w-5" /></button>
            <img src={preview.url} alt={preview.label || preview.kind} className="max-h-[78vh] max-w-full rounded-xl object-contain" />
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-white"><span>{preview.storeType} · {preview.storeName}</span><span>·</span><span>{fmtDate(preview.date)}</span><span>·</span><span>{preview.kind}</span><a href={preview.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs hover:bg-white/25"><ExternalLink className="h-3.5 w-3.5" />開啟原圖</a></div>
          </div>
        </div>
      )}
    </div>
  )
}
