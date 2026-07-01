/**
 * @deprecated 舊版模板 fill 匯出，已由 /api/export/food-cost-native 取代（無模板依賴）。
 * 保留這個 route 讓可能存在的舊 client 收到明確的 410 Gone。
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  return new NextResponse(
    '此 endpoint 已停用，改用 /api/export/food-cost-native',
    { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )
}
