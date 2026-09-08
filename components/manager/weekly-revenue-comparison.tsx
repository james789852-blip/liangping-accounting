'use client'

import type { MeetingRevenueComparison } from '@/app/actions/meeting-reports'

interface Props {
  comparison: MeetingRevenueComparison
  currentStart: string
  currentEnd: string
  previousStart: string
  previousEnd: string
}

function money(value: number) {
  return `NT$ ${Math.round(value).toLocaleString('zh-TW')}`
}

function signedMoney(value: number) {
  if (value === 0) return 'NT$ 0'
  return `${value > 0 ? '+' : '-'}NT$ ${Math.abs(Math.round(value)).toLocaleString('zh-TW')}`
}

function percentage(current: number, previous: number) {
  if (previous === 0) return current > 0 ? '本期新增' : '—'
  const value = ((current - previous) / previous) * 100
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function dateRange(start: string, end: string) {
  return `${start.replaceAll('-', '/')}－${end.replaceAll('-', '/')}`
}

export default function WeeklyRevenueComparison({
  comparison,
  currentStart,
  currentEnd,
  previousStart,
  previousEnd,
}: Props) {
  const rows = [
    { label: '總營業額', current: comparison.current.total, previous: comparison.previous.total, emphasized: true },
    { label: '現場', current: comparison.current.onsite, previous: comparison.previous.onsite },
    ...(comparison.channels.uber ? [{ label: '優步外送', current: comparison.current.uber, previous: comparison.previous.uber }] : []),
    ...(comparison.channels.panda ? [{ label: '熊貓外送', current: comparison.current.panda, previous: comparison.previous.panda }] : []),
    { label: '店內外送', current: comparison.current.storeDelivery, previous: comparison.previous.storeDelivery },
    { label: '外送合計', current: comparison.current.deliveryTotal, previous: comparison.previous.deliveryTotal, emphasized: true },
    ...(comparison.channels.online ? [{ label: '線上點餐', current: comparison.current.online, previous: comparison.previous.online }] : []),
  ]

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <div>
          <h3 className="text-sm font-extrabold text-zinc-900">兩週之間的營業數據對比</h3>
          <p className="mt-1 text-xs text-zinc-500">以兩個所選週區間的合計比較，不按第幾日配對。</p>
        </div>
        <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-extrabold text-orange-700">週對週</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-zinc-900 text-white">
            <tr>
              <th className="px-4 py-3 text-left">比較項目</th>
              <th className="px-4 py-3 text-right">
                <span className="block text-orange-300">本期週</span>
                <span className="mt-0.5 block whitespace-nowrap text-[11px] font-medium text-white/60">{dateRange(currentStart, currentEnd)}</span>
              </th>
              <th className="px-4 py-3 text-right">
                <span className="block text-sky-300">前期週</span>
                <span className="mt-0.5 block whitespace-nowrap text-[11px] font-medium text-white/60">{dateRange(previousStart, previousEnd)}</span>
              </th>
              <th className="px-4 py-3 text-right">差額</th>
              <th className="px-4 py-3 text-right">較前期</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const difference = row.current - row.previous
              const trendClass = difference > 0 ? 'text-emerald-700' : difference < 0 ? 'text-rose-600' : 'text-zinc-500'
              return (
                <tr key={row.label} className={`border-t border-zinc-100 ${row.emphasized ? 'bg-orange-50/60 font-extrabold' : 'odd:bg-white even:bg-zinc-50/50'}`}>
                  <td className="px-4 py-3 font-extrabold text-zinc-800">{row.label}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-orange-700">{money(row.current)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-sky-700">{money(row.previous)}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-extrabold tabular-nums ${trendClass}`}>{signedMoney(difference)}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-extrabold tabular-nums ${trendClass}`}>{percentage(row.current, row.previous)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
