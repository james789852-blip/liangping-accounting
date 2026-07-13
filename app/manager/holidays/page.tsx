import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/authed-user'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import { getCachedStoreById, getCachedUserProfile } from '@/lib/cached-queries'
import { fetchStoreHolidays, type Holiday } from '@/app/actions/store-holidays'
import ManagerHolidaysEditor from '@/components/manager/holidays-editor'

export const dynamic = 'force-dynamic'

function addDays(date: string, amount: number) {
  const d = new Date(`${date}T12:00:00+08:00`)
  d.setDate(d.getDate() + amount)
  return d.toISOString().slice(0, 10)
}

export default async function ManagerHolidaysPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const profile = await getCachedUserProfile(user.id)
  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) redirect('/manager/dashboard')

  const store = await getCachedStoreById(storeId)
  const from = getBusinessDate()
  const to = addDays(from, 90)
  const holidaysResult = await fetchStoreHolidays(storeId, from, to)
  const holidays: Holiday[] = 'error' in holidaysResult ? [] : holidaysResult.holidays

  return (
    <ManagerHolidaysEditor
      storeId={storeId}
      storeName={(store as any)?.name ?? '店家'}
      storeType={(store as any)?.type ?? '店面'}
      initialFrom={from}
      initialTo={to}
      initialHolidays={holidays}
    />
  )
}
