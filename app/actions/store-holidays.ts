'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function checkHqAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '無權限' as const }
  return { ok: true as const }
}

export interface Holiday {
  id: string
  store_id: string
  holiday_date: string
  note: string | null
}

export async function fetchStoreHolidays(storeId: string, from?: string, to?: string) {
  const admin = createAdminClient()
  let q = admin.from('store_holidays').select('id, store_id, holiday_date, note').eq('store_id', storeId).order('holiday_date')
  if (from) q = q.gte('holiday_date', from)
  if (to) q = q.lte('holiday_date', to)
  const { data, error } = await q
  if (error) return { error: error.message }
  return { success: true as const, holidays: (data ?? []) as Holiday[] }
}

export async function addStoreHoliday(storeId: string, date: string, note?: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!storeId || !date) return { error: '缺少參數' as const }
  const admin = createAdminClient()
  const { error } = await admin.from('store_holidays').insert({
    store_id: storeId, holiday_date: date, note: note?.trim() || null,
  })
  if (error) return { error: error.message }
  revalidatePath('/hq/store-overview')
  return { success: true as const }
}

export async function addStoreHolidaysRange(storeId: string, dates: string[], note?: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const rows = dates.map(d => ({ store_id: storeId, holiday_date: d, note: note?.trim() || null }))
  const { error } = await admin.from('store_holidays').upsert(rows, { onConflict: 'store_id,holiday_date', ignoreDuplicates: true })
  if (error) return { error: error.message }
  revalidatePath('/hq/store-overview')
  return { success: true as const }
}

function datesBetween(from: string, to: string) {
  const start = new Date(`${from}T12:00:00+08:00`)
  const end = new Date(`${to}T12:00:00+08:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  if (start > end) return []
  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor <= end && dates.length < 366) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export async function addBatchStoreHolidays(storeIds: string[], from: string, to: string, note?: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  const ids = [...new Set(storeIds.filter(Boolean))]
  const dates = datesBetween(from, to)
  if (ids.length === 0) return { error: '請至少選擇一間店或央廚' as const }
  if (dates.length === 0) return { error: '請選擇正確的公休日期' as const }

  const admin = createAdminClient()
  const rows = ids.flatMap(storeId =>
    dates.map(date => ({ store_id: storeId, holiday_date: date, note: note?.trim() || null })),
  )
  const { error } = await admin
    .from('store_holidays')
    .upsert(rows, { onConflict: 'store_id,holiday_date', ignoreDuplicates: false })
  if (error) return { error: error.message }
  revalidatePath('/hq/accounting')
  revalidatePath('/hq/dashboard')
  revalidatePath('/hq/store-overview')
  return { success: true as const, count: rows.length, storeCount: ids.length, dateCount: dates.length }
}

export async function deleteStoreHoliday(id: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { error } = await admin.from('store_holidays').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/hq/store-overview')
  return { success: true as const }
}

/** 從一個日期範圍抓多店的公休日（給 dashboard alerts 用） */
export async function fetchHolidaysForDate(date: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.from('store_holidays').select('store_id').eq('holiday_date', date)
  if (error) return { error: error.message }
  return { success: true as const, storeIds: new Set((data ?? []).map((h: any) => h.store_id as string)) }
}
