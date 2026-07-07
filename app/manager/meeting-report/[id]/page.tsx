import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function DisabledManagerMeetingReportDetailPage() {
  redirect('/manager/dashboard')
}
