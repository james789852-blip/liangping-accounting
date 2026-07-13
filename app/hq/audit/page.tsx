import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { History as HistoryIcon } from 'lucide-react'
import AuditClient from '@/components/hq/audit-client'
import { sortStores } from '@/lib/store-order'

export const dynamic = 'force-dynamic'

const EVENT_TYPES = [
  'closing_submit', 'closing_verify', 'closing_dispute', 'closing_edit', 'closing_delete',
  'receipt_create', 'receipt_update', 'receipt_delete',
  'ck_record_update', 'ck_hq_paid',
  'sheets_sync_failed', 'variance_alert', 'ck_price_update', 'store_update',
] as const

export default async function HQAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; event?: string; severity?: string; from?: string; to?: string; limit?: string }>
}) {
  const supabase = await createClient()
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') redirect('/manager/dashboard')

  const admin = createAdminClient()
  const params = await searchParams
  const storeFilter = params.store ?? ''
  const eventFilter = params.event ?? ''
  const severityFilter = params.severity ?? ''
  const fromDate = params.from ?? ''
  const toDate = params.to ?? ''
  const limit = Math.min(parseInt(params.limit ?? '200') || 200, 500)

  let query = admin.from('audit_logs')
    .select('id, event_type, severity, store_id, user_id, closing_id, description, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (storeFilter) query = query.eq('store_id', storeFilter)
  if (eventFilter) query = query.eq('event_type', eventFilter)
  if (severityFilter) query = query.eq('severity', severityFilter)
  if (fromDate) query = query.gte('created_at', `${fromDate}T00:00:00+08:00`)
  if (toDate) query = query.lte('created_at', `${toDate}T23:59:59+08:00`)

  const [{ data: logs }, { data: stores }, { data: users }] = await Promise.all([
    query,
    admin.from('stores').select('id, name, type').eq('active', true),
    admin.from('user_profiles').select('user_id, name'),
  ])

  const storeMap: Record<string, { name: string; type?: string }> = {}
  for (const s of stores ?? []) storeMap[s.id as string] = { name: s.name as string, type: (s as { type?: string }).type }
  const userMap: Record<string, string> = {}
  for (const u of users ?? []) userMap[u.user_id as string] = u.name as string

  const enrichedLogs = (logs ?? []).map(log => ({
    id: log.id as string,
    eventType: log.event_type as string,
    severity: (log.severity as 'info' | 'warn' | 'error') ?? 'info',
    storeId: log.store_id as string | null,
    storeName: log.store_id ? (storeMap[log.store_id as string]?.name ?? '—') : '—',
    userId: log.user_id as string | null,
    userName: log.user_id ? (userMap[log.user_id as string] ?? '—') : '—',
    closingId: log.closing_id as string | null,
    description: log.description as string,
    metadata: (log.metadata as Record<string, unknown>) ?? {},
    createdAt: log.created_at as string,
  }))

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <HistoryIcon className="h-3.5 w-3.5" />操作軌跡
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>操作軌跡</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
            所有店面與總公司操作紀錄；誰、何時、做了什麼，都有跡可循
          </p>
        </div>
      </div>

      <AuditClient
        logs={enrichedLogs}
        stores={sortStores(stores ?? []).map(s => ({ id: s.id as string, name: s.name as string, type: (s as { type?: string }).type ?? '店面' }))}
        eventTypes={[...EVENT_TYPES]}
        currentStore={storeFilter}
        currentEvent={eventFilter}
        currentSeverity={severityFilter}
        currentFrom={fromDate}
        currentTo={toDate}
      />
    </div>
  )
}
