'use client'

import { useMemo, useState } from 'react'
import { Check, Download, FileArchive, Loader2, Square, Store as StoreIcon, ChefHat } from 'lucide-react'

interface Store { id: string; name: string; type?: string }
type ExportKind = 'store' | 'ck'
type ExportType = 'month' | 'year'
type Target = { storeId: string; kind: ExportKind }

function targetKey(kind: ExportKind, id: string) {
  return `${kind}:${id}`
}

function parseTargetKey(key: string): Target {
  const [kind, storeId] = key.split(':')
  return { kind: kind as ExportKind, storeId }
}

function triggerDownload(blob: Blob, fallbackName: string, contentDisposition: string | null) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const match = (contentDisposition ?? '').match(/filename\*=UTF-8''(.+)/)
  a.download = match ? decodeURIComponent(match[1]) : fallbackName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(a.href)
}

function SelectableRow({
  store,
  kind,
  selected,
  onToggle,
}: {
  store: Store
  kind: ExportKind
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-3 py-3 text-left"
      style={{
        borderTop: '1px solid #f4f4f5',
        background: selected ? '#fffbeb' : 'white',
      }}
    >
      <span
        className="h-5 w-5 rounded-md flex items-center justify-center shrink-0"
        style={{
          border: selected ? '1.5px solid #f59e0b' : '1.5px solid #d4d4d8',
          background: selected ? '#f59e0b' : 'white',
          color: selected ? 'white' : '#a1a1aa',
        }}
      >
        {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Square className="h-3 w-3" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold truncate" style={{ color: '#18181b' }}>{store.name}</span>
        <span className="block text-xs mt-0.5" style={{ color: '#a1a1aa' }}>
          {kind === 'ck' ? '央廚食耗 Excel' : '店面食耗 Excel'}
        </span>
      </span>
    </button>
  )
}

export default function HQExcelClient({ stores, ckStores }: { stores: Store[]; ckStores: Store[] }) {
  const now = new Date()
  const [exportType, setExportType] = useState<ExportType>('month')
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [year, setYear] = useState(now.getFullYear())
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set([
      ...stores.map(s => targetKey('store', s.id)),
      ...ckStores.map(s => targetKey('ck', s.id)),
    ]),
  )
  const [loading, setLoading] = useState(false)

  const allKeys = useMemo(() => [
    ...stores.map(s => targetKey('store', s.id)),
    ...ckStores.map(s => targetKey('ck', s.id)),
  ], [ckStores, stores])
  const selectedTargets = useMemo(() => [...selectedKeys].map(parseTargetKey), [selectedKeys])
  const [monthYear, monthNum] = month.split('-').map(Number)
  const activeYear = exportType === 'year' ? year : monthYear
  const activeMonth = monthNum

  function toggleKey(key: string) {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function setGroup(keys: string[], checked: boolean) {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      for (const key of keys) {
        if (checked) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

  async function handleDownload() {
    if (selectedTargets.length === 0) return
    setLoading(true)
    try {
      const res = await fetch('/api/export/batch-native', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          type: exportType,
          year: activeYear,
          month: activeMonth,
          targets: selectedTargets,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        alert(text || '批次匯出失敗，請稍後再試')
        return
      }
      const blob = await res.blob()
      const label = exportType === 'year' ? `${activeYear}年度` : `${activeYear}年${activeMonth}月`
      triggerDownload(blob, `批次Excel_${label}.zip`, res.headers.get('content-disposition'))
    } finally {
      setLoading(false)
    }
  }

  const selectedStoreCount = stores.filter(s => selectedKeys.has(targetKey('store', s.id))).length
  const selectedCkCount = ckStores.filter(s => selectedKeys.has(targetKey('ck', s.id))).length
  const storeKeys = stores.map(s => targetKey('store', s.id))
  const ckKeys = ckStores.map(s => targetKey('ck', s.id))
  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-28 space-y-4">
      <div className="bg-white rounded-2xl p-5 space-y-5" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: '#18181b' }}>匯出期間</label>
          <div className="flex flex-wrap gap-2">
            {(['month', 'year'] as ExportType[]).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setExportType(type)}
                className="px-4 h-10 rounded-xl text-sm font-semibold"
                style={{
                  background: exportType === type ? 'linear-gradient(135deg,#F59E0B,#F97316)' : 'white',
                  color: exportType === type ? 'white' : '#52525b',
                  border: exportType === type ? '1.5px solid transparent' : '1.5px solid #e4e4e7',
                }}
              >
                {type === 'month' ? '當月 Excel' : '年度 Excel'}
              </button>
            ))}
            {exportType === 'month' ? (
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="h-10 rounded-xl px-3 text-sm"
                style={{ border: '1.5px solid #e4e4e7', outline: 'none', fontFamily: 'inherit', color: '#18181b' }}
              />
            ) : (
              <select
                value={year}
                onChange={e => setYear(parseInt(e.target.value))}
                className="h-10 rounded-xl px-3 text-sm"
                style={{ border: '1.5px solid #e4e4e7', outline: 'none', fontFamily: 'inherit', color: '#18181b', background: 'white' }}
              >
                {yearOptions.map(y => <option key={y} value={y}>{y} 年</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="rounded-xl px-4 py-3" style={{ background: '#f8fafc', border: '1px solid #f4f4f5' }}>
          <p className="text-xs" style={{ color: '#71717a' }}>批次內容</p>
          <p className="text-sm font-semibold mt-0.5" style={{ color: '#18181b' }}>
            已選 {selectedTargets.length} 份 Excel
            <span className="ml-2 text-xs font-medium" style={{ color: '#71717a' }}>
              店面 {selectedStoreCount} 份 · 央廚 {selectedCkCount} 份
            </span>
          </p>
          <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>
            系統會下載一個 ZIP 壓縮檔，每間店或央廚各自保留原本 Excel 格式。
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={loading || selectedTargets.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm"
          style={{
            background: (loading || selectedTargets.length === 0) ? '#d4d4d8' : 'linear-gradient(135deg,#F59E0B,#F97316)',
            boxShadow: (loading || selectedTargets.length === 0) ? 'none' : '0 4px 12px rgba(245,158,11,0.3)',
            cursor: (loading || selectedTargets.length === 0) ? 'not-allowed' : 'pointer',
          }}
        >
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" />產生 ZIP 中…</>
            : <><FileArchive className="h-4 w-4" />批次下載 ZIP</>}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <StoreIcon className="h-4 w-4" style={{ color: '#f59e0b' }} />
              <p className="text-sm font-bold" style={{ color: '#18181b' }}>店面</p>
              <span className="text-xs" style={{ color: '#a1a1aa' }}>{selectedStoreCount}/{stores.length}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setGroup(storeKeys, true)} className="text-xs font-semibold" style={{ color: '#d97706' }}>全選</button>
              <button type="button" onClick={() => setGroup(storeKeys, false)} className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>清除</button>
            </div>
          </div>
          {stores.length === 0 ? (
            <p className="text-sm px-4 py-6 text-center" style={{ color: '#a1a1aa', borderTop: '1px solid #f4f4f5' }}>沒有可匯出的店面</p>
          ) : stores.map(store => {
            const key = targetKey('store', store.id)
            return <SelectableRow key={key} store={store} kind="store" selected={selectedKeys.has(key)} onToggle={() => toggleKey(key)} />
          })}
        </div>

        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <ChefHat className="h-4 w-4" style={{ color: '#f97316' }} />
              <p className="text-sm font-bold" style={{ color: '#18181b' }}>央廚</p>
              <span className="text-xs" style={{ color: '#a1a1aa' }}>{selectedCkCount}/{ckStores.length}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setGroup(ckKeys, true)} className="text-xs font-semibold" style={{ color: '#d97706' }}>全選</button>
              <button type="button" onClick={() => setGroup(ckKeys, false)} className="text-xs font-semibold" style={{ color: '#a1a1aa' }}>清除</button>
            </div>
          </div>
          {ckStores.length === 0 ? (
            <p className="text-sm px-4 py-6 text-center" style={{ color: '#a1a1aa', borderTop: '1px solid #f4f4f5' }}>沒有可匯出的央廚</p>
          ) : ckStores.map(store => {
            const key = targetKey('ck', store.id)
            return <SelectableRow key={key} store={store} kind="ck" selected={selectedKeys.has(key)} onToggle={() => toggleKey(key)} />
          })}
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setGroup(allKeys, selectedKeys.size !== allKeys.length)}
          className="flex items-center gap-1.5 px-4 h-10 rounded-xl text-sm font-semibold"
          style={{ background: 'white', color: '#52525b', border: '1.5px solid #e4e4e7' }}
        >
          <Download className="h-4 w-4" />
          {selectedKeys.size === allKeys.length ? '清除全部選取' : '選取全部店面與央廚'}
        </button>
      </div>
    </div>
  )
}
