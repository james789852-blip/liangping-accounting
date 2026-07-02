import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** 舊「央廚多店」— 已整合到 /hq/multi-store（tab 切換） */
export default async function DeprecatedCKMultiPage() {
  redirect('/hq/multi-store')
}
