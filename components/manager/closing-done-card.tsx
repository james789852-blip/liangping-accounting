'use client'

import Link from 'next/link'
import { CheckCircle2, ClipboardList, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  storeName: string
  businessDate: string
  status: string
  totalRevenue: number
  variance: number
}

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

export default function ClosingDoneCard({ storeName, businessDate, status, totalRevenue, variance }: Props) {
  const isVerified = status === 'verified'
  const varColor = Math.abs(variance) === 0 ? 'text-green-600' : Math.abs(variance) <= 200 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="max-w-xl mx-auto px-4 py-16 flex flex-col items-center text-center space-y-6">
      <div className={cn('rounded-full p-4', isVerified ? 'bg-green-100' : 'bg-blue-100')}>
        <CheckCircle2 className={cn('h-12 w-12', isVerified ? 'text-green-500' : 'text-blue-500')} />
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900">
          {businessDate} 帳目已{isVerified ? '審核完成' : '送出'}
        </h1>
        <p className="text-sm text-slate-500">{storeName}</p>
      </div>

      <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-6 py-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">總營業額</span>
          <span className="font-bold tabular-nums">${fmt(totalRevenue)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">誤差</span>
          <span className={cn('font-bold tabular-nums', varColor)}>
            {variance >= 0 ? '+' : ''}{fmt(variance)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">狀態</span>
          <span className={cn('font-medium', isVerified ? 'text-green-600' : 'text-blue-600')}>
            {isVerified ? '已審核' : '等待審核中'}
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        每日 05:00 起開放下一個業務日的結帳輸入
      </p>

      <div className="flex flex-col gap-3 w-full">
        <Link
          href="/manager/summary"
          className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <BarChart3 className="h-4 w-4" /> 查看詳細結算結果
        </Link>
        <Link
          href="/manager/dashboard"
          className="flex items-center justify-center gap-2 w-full py-3 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors"
        >
          <ClipboardList className="h-4 w-4" /> 回到今日狀態
        </Link>
      </div>
    </div>
  )
}
