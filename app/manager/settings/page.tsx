import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * 店長端「收據設定」已整合到總公司端 /hq/receipt-settings。
 * 保留這個 route 是為了：若店長曾 bookmark 此網址，會被導回結帳頁而非 404。
 */
export default async function DeprecatedManagerSettingsPage() {
  redirect('/manager/closing')
}
