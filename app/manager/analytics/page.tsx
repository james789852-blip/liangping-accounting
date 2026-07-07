import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function DisabledManagerAnalyticsPage() {
  redirect('/manager/dashboard')
}
