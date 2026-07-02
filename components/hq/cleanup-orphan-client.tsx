'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Trash2, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react'
import { fetchOrphanStoreItems, disableStoreItemsBatch, type OrphanItem } from '@/app/actions/cleanup-orphan-items'
import HelpBox from './help-box'

export default function CleanupOrphanClient() {
  const [orphans, setOrphans] = useState<OrphanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)

  async function load() {
    setLoading(true)
    const r = await fetchOrphanStoreItems()
    if ('error' in r) { toast.error(r.error); setLoading(false); return }
    setOrphans(r.orphans)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const removable = orphans.filter(o => !o.isSystemReserved)
  const reserved = orphans.filter(o => o.isSystemReserved)

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function selectAllRemovable() {
    setSelected(new Set(removable.map(o => o.store_item_id)))
  }

  function clearAll() { setSelected(new Set()) }

  async function handleBatchDisable() {
    if (selected.size === 0) { toast.error('請先勾選要移除的品項'); return }
    if (!confirm(`確定移除 ${selected.size} 個品項？（可再加回來，只是先 disable）`)) return
    setProcessing(true)
    const r = await disableStoreItemsBatch(Array.from(selected))
    setProcessing(false)
    if ('error' in r) { toast.error(r.error); return }
    toast.success(`已移除 ${r.count} 個品項`)
    setSelected(new Set())
    load()
  }

  // 依店家 group
  const byStore = new Map<string, OrphanItem[]>()
  for (const o of removable) {
    if (!byStore.has(o.store_name)) byStore.set(o.store_name, [])
    byStore.get(o.store_name)!.push(o)
  }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5' }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <Sparkles className="h-3.5 w-3.5" />
            HQ · 品項清理
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>清理 xlsx 多餘欄位</h1>
          <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>找出「xlsx 會出現但品項對應管理沒有」的品項，一次移除</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4 pb-28">

        <HelpBox title="📖 這頁怎麼用？" defaultOpen>
          <div className="rounded-lg p-3" style={{ background: 'white' }}>
            <p className="font-bold mb-1">🧹 為何會有「多餘欄位」？</p>
            <p>歷史舊資料 or 過去批次設定時把某品項啟用了，但沒對應到品項對應管理表。這些品項會**在 xlsx 匯出時多出一欄**（可能是空的或有 stale 資料）。</p>
          </div>
          <div className="rounded-lg p-3 mt-2" style={{ background: 'white' }}>
            <p className="font-bold mb-1">🎯 操作</p>
            <ol className="space-y-0.5 list-decimal list-inside">
              <li>下面列出「該店 xlsx 會出現但品項對應沒有」的品項</li>
              <li>勾選要移除的（或點「全選可移除」）</li>
              <li>按「批次移除」→ 系統把該 store_item 停用</li>
              <li>下次匯出 xlsx 該店就不會有那欄了</li>
            </ol>
          </div>
          <div className="rounded-lg p-3 mt-2" style={{ background: '#e0f2fe' }}>
            <p className="font-bold">💡 綠色標記「系統必要」品項</p>
            <p className="mt-1">例如「其他（發票）」「其他（收據）」— 這些是給店長輸入零星購買用的，**建議保留**。</p>
          </div>
          <div className="rounded-lg p-3 mt-2" style={{ background: '#fef3c7', color: '#92400e' }}>
            <p className="font-bold">⚠️ 誤刪怎麼辦？</p>
            <p className="mt-1">「disable」不是刪除，只是關閉。若不小心關掉需要的品項，到「品項對應管理」重新新增品項對應，就會自動 re-enable。</p>
          </div>
        </HelpBox>

        {loading && (
          <div className="bg-white rounded-2xl p-8 text-center" style={{ border: '1px solid #f4f4f5' }}>
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            <p className="text-sm" style={{ color: '#a1a1aa' }}>載入中…</p>
          </div>
        )}

        {!loading && orphans.length === 0 && (
          <div className="rounded-2xl p-6 flex items-center gap-3" style={{ background: '#d1fae5', border: '1px solid #bbf7d0' }}>
            <CheckCircle2 className="h-6 w-6" style={{ color: '#047857' }} />
            <div>
              <p className="text-sm font-bold" style={{ color: '#047857' }}>沒有多餘品項！</p>
              <p className="text-xs" style={{ color: '#047857' }}>所有 xlsx 會出現的品項都有對應到品項對應管理。</p>
            </div>
          </div>
        )}

        {!loading && orphans.length > 0 && (
          <>
            {/* 統計 + 動作按鈕 */}
            <div className="bg-white rounded-2xl p-4 space-y-3" style={{ border: '1px solid #f4f4f5' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm">
                  <AlertTriangle className="h-4 w-4" style={{ color: '#c2410c' }} />
                  <span style={{ color: '#7c2d12' }}>
                    找到 <b>{removable.length}</b> 個可清理品項
                    {reserved.length > 0 && <span style={{ color: '#a1a1aa' }}> · {reserved.length} 個系統必要品項不列出</span>}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={selectAllRemovable}
                  className="text-xs font-semibold px-3 py-2 rounded-xl"
                  style={{ background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b', cursor: 'pointer' }}>
                  全選可移除
                </button>
                <button onClick={clearAll}
                  className="text-xs font-semibold px-3 py-2 rounded-xl"
                  style={{ background: 'white', border: '1.5px solid #e4e4e7', color: '#52525b', cursor: 'pointer' }}>
                  取消勾選
                </button>
                <button onClick={handleBatchDisable} disabled={processing || selected.size === 0}
                  className="text-xs font-bold px-3 py-2 rounded-xl text-white flex items-center gap-1.5 ml-auto"
                  style={{ background: selected.size > 0 ? 'linear-gradient(135deg,#dc2626,#f97316)' : '#e4e4e7', border: 'none', cursor: selected.size > 0 ? 'pointer' : 'not-allowed', opacity: processing ? 0.6 : 1 }}>
                  {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  批次移除（{selected.size}）
                </button>
              </div>
            </div>

            {/* 依店家 group 顯示 */}
            {Array.from(byStore.entries()).map(([storeName, items]) => (
              <div key={storeName} className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: '#fafafa', borderBottom: '1px solid #f4f4f5' }}>
                  <span className="text-sm font-bold" style={{ color: '#18181b' }}>{storeName}</span>
                  <span className="text-xs" style={{ color: '#a1a1aa' }}>{items.length} 個</span>
                </div>
                <ul>
                  {items.map(o => (
                    <li key={o.store_item_id}
                      className="flex items-center gap-3 px-4 py-2.5"
                      style={{ borderTop: '1px solid #f9f9f9', cursor: 'pointer' }}
                      onClick={() => toggle(o.store_item_id)}>
                      <input type="checkbox"
                        checked={selected.has(o.store_item_id)}
                        onChange={() => toggle(o.store_item_id)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: 16, height: 16, cursor: 'pointer' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: '#18181b' }}>{o.item_name}</p>
                        <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
                          {o.vendor_group ?? '未分類'} · {o.category}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* 系統必要品項 (不列在勾選區，但列出讓 user 看到) */}
            {reserved.length > 0 && (
              <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5' }}>
                <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: '#d1fae5', borderBottom: '1px solid #bbf7d0' }}>
                  <span className="text-sm font-bold" style={{ color: '#047857' }}>✨ 系統必要品項（建議保留）</span>
                  <span className="text-xs" style={{ color: '#047857' }}>{reserved.length} 個</span>
                </div>
                <ul>
                  {reserved.slice(0, 20).map(o => (
                    <li key={o.store_item_id} className="flex items-center gap-3 px-4 py-2" style={{ borderTop: '1px solid #f9f9f9' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs" style={{ color: '#52525b' }}>
                          <span className="font-medium">{o.store_name}</span> · {o.item_name}
                        </p>
                      </div>
                      <span className="text-[10px]" style={{ color: '#a1a1aa' }}>{o.vendor_group ?? '—'}</span>
                    </li>
                  ))}
                  {reserved.length > 20 && (
                    <li className="px-4 py-2 text-[11px] text-center" style={{ color: '#a1a1aa', borderTop: '1px solid #f9f9f9' }}>
                      …還有 {reserved.length - 20} 個
                    </li>
                  )}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
