import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import EditClient from './edit-client'

export const dynamic = 'force-dynamic'

export default async function MeetingReportEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: report } = await admin.from('meeting_reports').select('*').eq('id', id).single()
  if (!report) notFound()

  const { data: store } = await admin.from('stores').select('id, name').eq('id', report.store_id).single()

  // 取得本次提出 + 從前面會議結轉過來的 open action items
  const { data: thisReportItems } = await admin.from('meeting_action_items')
    .select('*').eq('raised_in_report_id', id).order('order_index')

  // 上次會議的 open items（要在本次追蹤）
  const { data: prevReport } = await admin.from('meeting_reports')
    .select('id, period_end')
    .eq('store_id', report.store_id)
    .lt('period_end', report.period_end)
    .order('period_end', { ascending: false })
    .limit(1).maybeSingle()

  let carryOverItems: any[] = []
  if (prevReport) {
    const { data } = await admin.from('meeting_action_items')
      .select('*')
      .eq('store_id', report.store_id)
      .eq('status', 'open')
      .neq('raised_in_report_id', id)
      .order('order_index')
    carryOverItems = data ?? []
  }

  return <EditClient
    report={report as any}
    storeName={(store?.name as string) ?? ''}
    thisReportItems={(thisReportItems ?? []) as any[]}
    carryOverItems={carryOverItems as any[]} />
}
