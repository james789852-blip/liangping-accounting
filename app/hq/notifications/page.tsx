import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { BellRing, Building2, CheckCircle2, ChefHat, Clock3, Smartphone, Store as StoreIcon, TriangleAlert, XCircle } from 'lucide-react'
import { getAuthedUser } from '@/lib/authed-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageUsers, isBoss } from '@/lib/user-permissions'
import PushDeviceRemoveButton from '@/components/hq/push-device-remove-button'
import PushScheduleSettingsForm from '@/components/hq/push-schedule-settings-form'
import { getPushScheduleSettings } from '@/lib/push-schedule-settings'
import { nextScheduledPushInstant } from '@/lib/push-schedule-runs'
import { isPushDeviceStale } from '@/lib/push-device-health'
import { resolvePrimaryStoreId } from '@/lib/user-primary-store'
import { sortStores } from '@/lib/store-order'

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

function HealthIssue({ title, count, tone, children }: {
  title: string
  count: number
  tone: 'rose' | 'amber'
  children: ReactNode
}) {
  const color = tone === 'rose' ? 'text-rose-700 bg-rose-50' : 'text-amber-700 bg-amber-50'
  return <div className={`rounded-xl p-3 ${color}`}>
    <p className="text-sm font-bold">{title} · {count}</p>
    <div className="mt-2 max-h-32 space-y-1 overflow-auto text-xs leading-5">
      {count ? children : <p>目前正常</p>}
    </div>
  </div>
}

export default async function PushNotificationsPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canManageUsers(profile)) return <div className="p-6 text-rose-700">權限不足，需要帳號管理權限</div>

  const admin = createAdminClient()
  const [{ data: notifications }, { data: profiles }, { data: devices }, { data: stores }, { data: scheduleRuns }, scheduleSettings] = await Promise.all([
    admin.from('app_notifications').select('id, user_id, category, title, body, source_key, created_at, read_at, clicked_at').order('created_at', { ascending: false }).limit(100),
    admin.from('user_profiles').select('*'),
    admin.from('push_subscriptions').select('id, user_id, device_name, user_agent, last_seen_at, last_success_at, failure_count, created_at').order('last_seen_at', { ascending: false }),
    admin.from('stores').select('id, name, type').eq('active', true),
    admin.from('push_schedule_runs').select('*').order('started_at', { ascending: false }).limit(30),
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
  const storeById = new Map((stores ?? []).map(item => [String(item.id), item]))
  const devicesByUser = new Map<string, typeof devices>()
  for (const device of devices ?? []) {
    const list = devicesByUser.get(String(device.user_id)) ?? []
    list.push(device)
    devicesByUser.set(String(device.user_id), list)
  }
  const healthGroups = [
    { key: 'store', label: '店面', profiles: [] as NonNullable<typeof profiles> },
    { key: 'ck', label: '央廚', profiles: [] as NonNullable<typeof profiles> },
    { key: 'hq', label: '總公司', profiles: [] as NonNullable<typeof profiles> },
  ]
  const activeStoreIds = [...storeById.keys()]
  for (const account of profiles ?? []) {
    if (!account.active || account.push_notifications_enabled === false) continue
    // 健檢依帳號的明確歸屬單位分類；殘留的隱藏權限不能改變人員身分。
    if (account.is_hq === true || isBoss(account)) {
      healthGroups[2].profiles.push(account)
      continue
    }
    const primaryStoreId = resolvePrimaryStoreId(account, activeStoreIds)
    const primaryStore = primaryStoreId ? storeById.get(primaryStoreId) : null
    if (primaryStore) {
      healthGroups[primaryStore.type === '央廚' ? 1 : 0].profiles.push(account)
      continue
    }
    const assigned = ((account.store_ids ?? []) as string[]).map(id => storeById.get(String(id))).filter(Boolean)
    if (assigned.some(unit => unit?.type === '央廚')) healthGroups[1].profiles.push(account)
    else if (assigned.some(unit => unit?.type !== '央廚')) healthGroups[0].profiles.push(account)
  }
  const profileByUser = new Map((profiles ?? []).map(item => [String(item.user_id), item]))
  const orderedStores = sortStores(stores ?? [])
  const deviceGroups = [
    { key: 'hq', label: '總公司', section: 'hq' as const, devices: [] as NonNullable<typeof devices> },
    ...orderedStores.map(store => ({
      key: String(store.id),
      label: String(store.name),
      section: store.type === '央廚' ? 'ck' as const : 'store' as const,
      devices: [] as NonNullable<typeof devices>,
    })),
    { key: 'unassigned', label: '未確認歸屬', section: 'unassigned' as const, devices: [] as NonNullable<typeof devices> },
  ]
  const deviceGroupByKey = new Map(deviceGroups.map(group => [group.key, group]))
  for (const device of devices ?? []) {
    const account = profileByUser.get(String(device.user_id))
    let groupKey = 'unassigned'
    if (account?.is_hq === true || isBoss(account)) {
      groupKey = 'hq'
    } else if (account) {
      groupKey = resolvePrimaryStoreId(account, activeStoreIds) ?? 'unassigned'
    }
    deviceGroupByKey.get(groupKey)?.devices.push(device)
  }
  const deviceSections = [
    { key: 'hq', label: '總公司', Icon: Building2, groups: deviceGroups.filter(group => group.section === 'hq' && group.devices.length > 0) },
    { key: 'store', label: '店面', Icon: StoreIcon, groups: deviceGroups.filter(group => group.section === 'store' && group.devices.length > 0) },
    { key: 'ck', label: '央廚', Icon: ChefHat, groups: deviceGroups.filter(group => group.section === 'ck' && group.devices.length > 0) },
    { key: 'unassigned', label: '未確認歸屬', Icon: TriangleAlert, groups: deviceGroups.filter(group => group.section === 'unassigned' && group.devices.length > 0) },
  ].filter(section => section.groups.length > 0)
  const staleDevices = (devices ?? []).filter(device => isPushDeviceStale(device.last_seen_at))
  const failingDevices = (devices ?? []).filter(device => Number(device.failure_count) > 0)
  const latestRunByKey = new Map<string, NonNullable<typeof scheduleRuns>[number]>()
  for (const run of scheduleRuns ?? []) if (!latestRunByKey.has(String(run.schedule_key))) latestRunByKey.set(String(run.schedule_key), run)
  const scheduleRows = [
    { key: 'accounting-first', label: '帳目未送出・第一次', time: scheduleSettings.accountingFirstTime },
    { key: 'accounting-final', label: '帳目未送出・第二次', time: scheduleSettings.accountingFinalTime },
    { key: 'ck-handoff', label: '央廚補款未點交', time: scheduleSettings.ckHandoffTime },
  ]
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

        <section className="rounded-2xl border border-blue-200 bg-white p-4">
          <div className="mb-4">
            <h2 className="font-bold text-zinc-900">裝置綁定健檢</h2>
            <p className="text-xs text-zinc-500">綁定完成率以「推播已開啟的在職管理人員」計算；7 天未連線列為需確認。</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {healthGroups.map(group => {
              const bound = group.profiles.filter(account => (devicesByUser.get(String(account.user_id))?.length ?? 0) > 0).length
              const unbound = group.profiles.filter(account => !(devicesByUser.get(String(account.user_id))?.length))
              const rate = group.profiles.length ? Math.round(bound / group.profiles.length * 100) : 100
              return <div key={group.key} className="rounded-xl bg-blue-50 p-3">
                <p className="text-xs font-bold text-blue-700">{group.label}綁定完成率</p>
                <p className="mt-1 text-2xl font-black text-zinc-900">{rate}%</p>
                <p className="text-xs text-zinc-500">{bound} / {group.profiles.length} 人已綁定</p>
                <div className="mt-3 border-t border-blue-100 pt-2">
                  <p className={`text-xs font-bold ${unbound.length ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {unbound.length ? `尚未綁定 · ${unbound.length} 人` : '全員已綁定'}
                  </p>
                  {unbound.length > 0 && (
                    <div className="mt-1 max-h-28 space-y-1 overflow-auto text-xs leading-5 text-rose-700">
                      {unbound.map(account => <p key={account.user_id}>{account.name}</p>)}
                    </div>
                  )}
                </div>
              </div>
            })}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <HealthIssue title="超過 7 天未連線" count={staleDevices.length} tone="amber">
              {staleDevices.map(device => <p key={device.id}>{nameByUser.get(String(device.user_id)) || '未知帳號'} · {device.device_name || '瀏覽器裝置'}（{fmtDate(device.last_seen_at)}）</p>)}
            </HealthIssue>
            <HealthIssue title="連續推播失敗" count={failingDevices.length} tone="rose">
              {failingDevices.map(device => <p key={device.id}>{nameByUser.get(String(device.user_id)) || '未知帳號'} · {device.device_name || '瀏覽器裝置'}（{device.failure_count} 次）</p>)}
            </HealthIssue>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="font-bold text-zinc-900">排程執行健檢</h2>
            <p className="text-xs text-zinc-500">排程延遲時會自動補送；失敗會通知總公司系統管理員。</p>
          </div>
          <div className="divide-y divide-zinc-100">
            {scheduleRows.map(row => {
              const run = latestRunByKey.get(row.key)
              return <div key={row.key} className="grid gap-2 px-4 py-3 sm:grid-cols-[1.3fr_1fr_1fr] sm:items-center">
                <div><p className="text-sm font-bold text-zinc-900">{row.label}</p><p className="text-xs text-zinc-500">設定時間 {row.time}</p></div>
                <div><p className="text-[10px] font-bold text-zinc-400">上次執行</p><p className="text-xs text-zinc-700">{run ? `${fmtDate(run.started_at)} · ${run.status === 'succeeded' ? '成功' : run.status === 'failed' ? '失敗' : '執行中'}` : '尚無紀錄'}</p></div>
                <div><p className="text-[10px] font-bold text-zinc-400">下次執行／上次成果</p><p className="text-xs text-zinc-700">{fmtDate(nextScheduledPushInstant(row.time).toISOString())} · 成功 {run?.delivered_count ?? 0}/{run?.target_device_count ?? 0} 台</p></div>
                {run?.error_message && <p className="text-xs text-rose-700 sm:col-span-3">失敗原因：{run.error_message}</p>}
              </div>
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="font-bold text-zinc-900">已綁定裝置</h2>
            <p className="text-xs text-zinc-500">共 {devices?.length ?? 0} 台；依總公司、各店面與各央廚分類，點選單位可展開裝置</p>
          </div>
          <div className="divide-y divide-zinc-100">
            {deviceSections.map(section => {
              const sectionDeviceCount = section.groups.reduce((sum, group) => sum + group.devices.length, 0)
              return (
                <div key={section.key} className="px-4 py-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                      <section.Icon className="h-4 w-4 text-blue-700" />{section.label}
                    </h3>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{sectionDeviceCount} 台</span>
                  </div>
                  <div className="space-y-2">
                    {section.groups.map(group => (
                      <details key={group.key} className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-bold text-zinc-800">
                          <span>{group.label}</span>
                          <span className="text-xs font-semibold text-zinc-500">{group.devices.length} 台・點選展開</span>
                        </summary>
                        <div className="divide-y divide-zinc-100 border-t border-zinc-200 bg-white">
                          {group.devices.map(device => (
                            <div key={device.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Smartphone className="h-4 w-4" /></span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-zinc-900">{device.device_name || '瀏覽器裝置'} · {nameByUser.get(String(device.user_id)) || '未知帳號'}</p>
                                <p className="text-xs text-zinc-500">最近連線 {fmtDate(device.last_seen_at)} · 最近成功 {fmtDate(device.last_success_at)}</p>
                                {device.failure_count > 0 && <p className="text-xs font-semibold text-rose-700">連續失敗 {device.failure_count} 次</p>}
                              </div>
                              <PushDeviceRemoveButton subscriptionId={device.id} />
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )
            })}
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
