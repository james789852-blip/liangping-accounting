import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** 舊版「月度總覽 Excel 匯出」— 已整合到 /hq/store-overview */
export default async function DeprecatedNativeExportPage() {
  redirect('/hq/store-overview')
}
