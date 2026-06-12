'use client'

import Link from 'next/link'
import { CheckCircle2, ClipboardList, BarChart3 } from 'lucide-react'

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
  const absVar = Math.abs(variance)
  const varColor = absVar === 0 ? '#047857' : absVar <= 200 ? '#b45309' : '#be123c'
  const varBg    = absVar === 0 ? '#d1fae5' : absVar <= 200 ? '#fef3c7' : '#ffe4e6'

  return (
    <div className="min-h-full flex items-center justify-center" style={{ background: '#fafafa' }}>
      <div className="w-full max-w-sm px-5 py-10 flex flex-col items-center text-center">

        {/* 成功圖示 */}
        <div className="h-24 w-24 rounded-3xl flex items-center justify-center mb-6"
          style={{
            background: isVerified
              ? 'linear-gradient(135deg,#10b981,#059669)'
              : 'linear-gradient(135deg,#F59E0B,#F97316)',
            boxShadow: isVerified
              ? '0 12px 32px rgba(16,185,129,0.35)'
              : '0 12px 32px rgba(245,158,11,0.3)',
          }}>
          <CheckCircle2 className="h-12 w-12 text-white" />
        </div>

        <h1 className="text-2xl font-bold mb-1" style={{ color: '#18181b', letterSpacing: '-0.02em' }}>
          {isVerified ? '審核完成 ✓' : '已送出'}
        </h1>
        <p className="text-sm mb-6" style={{ color: '#a1a1aa' }}>
          {businessDate} · {storeName}
        </p>

        {/* 數據卡片 */}
        <div className="w-full rounded-2xl p-5 mb-6 space-y-3"
          style={{ background: 'white', border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: '#52525b' }}>總營業額</span>
            <span className="text-lg font-bold tabular-nums" style={{ color: '#18181b' }}>${fmt(totalRevenue)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: '#52525b' }}>現金誤差</span>
            <span className="text-lg font-bold tabular-nums px-2 py-0.5 rounded-lg"
              style={{ color: varColor, background: varBg }}>
              {variance >= 0 ? '+' : ''}{fmt(variance)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: '#52525b' }}>帳目狀態</span>
            <span className="text-sm font-semibold" style={{ color: isVerified ? '#047857' : '#92400E' }}>
              {isVerified ? '已審核完成' : '等待總公司審核'}
            </span>
          </div>
        </div>

        <p className="text-xs mb-6" style={{ color: '#a1a1aa' }}>
          每日 05:00 起開放下一個業務日的結帳輸入
        </p>

        {/* 按鈕 */}
        <div className="flex flex-col gap-3 w-full">
          <Link href="/manager/summary"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', boxShadow: '0 4px 14px rgba(245,158,11,0.2)' }}>
            <BarChart3 className="h-4 w-4" />
            查看詳細結算結果
          </Link>
          <Link href="/manager/dashboard"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'white', border: '1px solid #e4e4e7', color: '#52525b' }}>
            <ClipboardList className="h-4 w-4" />
            回到今日狀態
          </Link>
        </div>

      </div>
    </div>
  )
}
