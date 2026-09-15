import { redirect } from 'next/navigation'
import { BellRing, CheckCircle2, Clock3, Smartphone, TriangleAlert, XCircle } from 'lucide-react'
import { getAuthedUser } from '@/lib/authed-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageUsers } from '@/lib/user-permissions'
import PushDeviceRemoveButton from '@/components/hq/push-device-remove-button'
import PushScheduleSettingsForm from '@/components/hq/push-schedule-settings-form'
import { getPushScheduleSettings } from '@/lib/push-schedule-settings'

export const dynamic = 'force-dynamic'

function fmtDate(value?: string | null) {
  if (!value) return '尚無紀錄'
  return new Date(value).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const CATEGORY_LABEL: Record<string, string> = {
  review_submission: '待審核', review_result: '審核結果', accounting_reminder: '帳目提醒',
  reimbursement_handoff: '補款點交', hq_escalation: '總公司追蹤', system: '系統測試',
}

export default async function PushNotificationsPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canManageUsers(profile)) return <div className="p-6 text-rose-700">權限不足，需要帳號管理權限</div>

  const admin = createAdminClient()
  const [{ data: notifications }, { data: profiles }, { data: devices }, scheduleSettings] = await Promise.all([
    admin.from('app_notifications').select('id, user_id, category, title, body, source_key, created_at, read_at, clicked_at').order('created_at', { ascending: false }).limit(100),
    admin.from('user_profiles').select('user_id, name, active'),
    admin.from('push_subscriptions').select('id, user_id, device_name, user_agent, last_seen_at, last_success_at, failure_count, created_at').order('last_seen_at', { ascending: false }),
    getPushScheduleSettings(),
  ])
  const notificationIds = (notifications ?? []).map(item => item.id)
  const { data: jobs } = notificationIds.length
    ? await admin.from('push_delivery_jobs').select('notification_id, status, attempt_count, last_error, delivered_at, device_name').in('notification_id', notificationIds)
    : { data: [] }
  const followUpSourceKeys = [...new Set((notifications ?? [])
    .filter(item => item.category === 'hq_escalation')
    .map(item => String(item.source_key)))]
  const { data: followUps } = followUpSourceKeys.length
    ? await admin.from('hq_notification_followups')
      .select('source_key, status, claimed_by, claimed_at, resolved_at')
      .in('source_key', followUpSourceKeys)
    : { data: [] }
  const nameByUser = new Map((profiles ?? []).map(item => [String(item.user_id), String(item.name)]))
  const followUpBySource = new Map((followUps ?? []).map(item => [String(item.source_key), item]))
  const jobsByNotification = new Map<string, typeof jobs>()
  for (const job of jobs ?? []) {
    const list = jobsByNotification.get(String(job.notification_id)) ?? []
    list.push(job)
    jobsByNotification.set(String(job.notification_id), list)
  }

  return (
    <div className="min-h-full bg-zinc-50 pb-28">
      <div className="border-b border-zinc-100 bg-white px-6 py-5">
        <div className="mx-auto max-w-5xl">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-zinc-400"><BellRing className="h-3.5 w-3.5" />系統管理</div>
          <h1 className="text-xl font-bold text-zinc-900">推播管理</h1>
          <p className="mt-1 text-sm text-zinc-500">查看裝置綁定、最近投遞結果與失敗原因</p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-5">
        <PushScheduleSettingsForm initialSettings={scheduleSettings} />

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="font-bold text-zinc-900">已綁定裝置</h2>
            <p className="text-xs text-zinc-500">共 {devices?.length ?? 0} 台；可個別解除錯誤或已換人的裝置</p>
          </div>
          <div className="divide-y divide-zinc-100">
            {(devices ?? []).map(device => (
              <div key={device.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Smartphone className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-zinc-900">{device.device_name || '瀏覽器裝置'} · {nameByUser.get(String(device.user_id)) || '未知帳號'}</p>
                  <p className="text-xs text-zinc-500">最近連線 {fmtDate(device.last_seen_at)} · 最近成功 {fmtDate(device.last_success_at)}</p>
                  {device.failure_count > 0 && <p className="text-xs font-semibold text-rose-700">連續失敗 {device.failure_count} 次</p>}
                </div>
                <PushDeviceRemoveButton subscriptionId={device.id} />
              </div>
            ))}
            {(devices ?? []).length === 0 && <p className="px-4 py-8 text-center text-sm text-zinc-400">目前沒有已綁定裝置</p>}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="font-bold text-zinc-900">最近推播紀錄</h2>
            <p className="text-xs text-zinc-500">顯示最近 100 筆系統通知與每台裝置投遞狀態</p>
          </div>
          <div className="divide-y divide-zinc-100">
            {(notifications ?? []).map(notification => {
              const notificationJobs = jobsByNotification.get(String(notification.id)) ?? []
              const delivered = notificationJobs.filter(job => job.status === 'delivered').length
              const pending = notificationJobs.filter(job => job.status === 'pending').length
              const failed = notificationJobs.filter(job => job.status === 'failed').length
              const error = notificationJobs.find(job => job.last_error)?.last_error
              const followUp = followUpBySource.get(String(notification.source_key))
              return (
                <div key={notification.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">{CATEGORY_LABEL[notification.category] ?? notification.category}</span>
                        <span className="text-xs text-zinc-400">{nameByUser.get(String(notification.user_id)) || '未知帳號'} · {fmtDate(notification.created_at)}</span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-zinc-900">{notification.title}</p>
                      <p className="text-xs leading-5 text-zinc-600">{notification.body}</p>
                      <p className="mt-1 text-[10px] font-semibold text-zinc-400">
                        {notification.clicked_at ? `已開啟 ${fmtDate(notification.clicked_at)}` : notification.read_at ? `已讀 ${fmtDate(notification.read_at)}` : '尚未讀取'}
                      </p>
                      {followUp?.status === 'pending' && <p className="mt-1 text-xs font-bold text-amber-700">追蹤狀態：待處理</p>}
                      {followUp?.status === 'in_progress' && (
                        <p className="mt-1 text-xs font-bold text-blue-700">
                          追蹤狀態：{nameByUser.get(String(followUp.claimed_by)) || '總公司人員'}處理中 · {fmtDate(followUp.claimed_at)}
                        </p>
                      )}
                      {followUp?.status === 'resolved' && <p className="mt-1 text-xs font-bold text-emerald-700">追蹤狀態：已完成 · {fmtDate(followUp.resolved_at)}</p>}
                      {error && <p className="mt-1 text-xs text-rose-700">失敗原因：{String(error)}</p>}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      {delivered > 0 && <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />成功 {delivered}</span>}
                      {pending > 0 && <span className="flex items-center gap-1 text-amber-700"><Clock3 className="h-3.5 w-3.5" />重試 {pending}</span>}
                      {failed > 0 && <span className="flex items-center gap-1 text-rose-700"><XCircle className="h-3.5 w-3.5" />失敗 {failed}</span>}
                      {notificationJobs.length === 0 && <span className="flex items-center gap-1 text-zinc-500"><TriangleAlert className="h-3.5 w-3.5" />無綁定裝置</span>}
                    </div>
                  </div>
                </div>
              )
            })}
            {(notifications ?? []).length === 0 && <p className="px-4 py-8 text-center text-sm text-zinc-400">尚無推播紀錄</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
