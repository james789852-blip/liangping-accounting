'use client'

import { useState, useTransition } from 'react'
import { Clock3, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { updatePushScheduleSettings } from '@/app/actions/push-management'
import type { PushScheduleSettings } from '@/lib/push-schedule'

const RETURNED_DELAY_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 360, 720, 1440]

function TimeSetting({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-zinc-900">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{description}</span>
      </span>
      <input
        type="time"
        step="300"
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base font-bold text-zinc-900 outline-none focus:border-amber-400 sm:w-36"
      />
    </label>
  )
}

export default function PushScheduleSettingsForm({ initialSettings }: { initialSettings: PushScheduleSettings }) {
  const [settings, setSettings] = useState(initialSettings)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await updatePushScheduleSettings(settings)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setSettings(result.settings)
      toast.success('推播時間已更新')
    })
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
      <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-amber-600" />
          <h2 className="font-bold text-zinc-900">定時推播設定</h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-zinc-500">全部使用台灣時間；定時提醒以 5 分鐘為單位。修改後從下一個排程時間開始生效。</p>
      </div>

      <div className="divide-y divide-zinc-100">
        <TimeSetting
          label="帳目未送出・第一次提醒"
          description="通知尚未送出帳目的店面與央廚管理人員。"
          value={settings.accountingFirstTime}
          onChange={accountingFirstTime => setSettings(current => ({ ...current, accountingFirstTime }))}
        />
        <TimeSetting
          label="帳目未送出・第二次提醒"
          description="再次通知店面與央廚，並同步提醒總公司追蹤。"
          value={settings.accountingFinalTime}
          onChange={accountingFinalTime => setSettings(current => ({ ...current, accountingFinalTime }))}
        />
        <TimeSetting
          label="央廚補款尚未點交"
          description="央廚仍未點交總公司補款時，通知央廚並同步提醒總公司。"
          value={settings.ckHandoffTime}
          onChange={ckHandoffTime => setSettings(current => ({ ...current, ckHandoffTime }))}
        />
        <label className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-zinc-900">帳目退回仍未修改</span>
            <span className="mt-0.5 block text-xs leading-5 text-zinc-500">退回後超過設定時間仍未重新送出，通知店面或央廚並提醒總公司。</span>
          </span>
          <select
            value={settings.returnedReminderMinutes}
            onChange={event => setSettings(current => ({ ...current, returnedReminderMinutes: Number(event.target.value) }))}
            className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base font-bold text-zinc-900 outline-none focus:border-amber-400 sm:w-44"
          >
            {RETURNED_DELAY_OPTIONS.map(minutes => (
              <option key={minutes} value={minutes}>
                {minutes < 60 ? `${minutes} 分鐘後` : minutes % 60 === 0 ? `${minutes / 60} 小時後` : `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分後`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex justify-end border-t border-zinc-100 bg-zinc-50 px-4 py-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50 sm:w-auto"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {pending ? '儲存中…' : '儲存推播時間'}
        </button>
      </div>
    </section>
  )
}
