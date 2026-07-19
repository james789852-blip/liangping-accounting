import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/authed-user'
import { getCachedAllStores } from '@/lib/cached-queries'
import { canManageCKReceipts, canManageStoreReceipts, canReviewClosings } from '@/lib/user-permissions'
import PhotosClient, { type PhotoLibraryItem } from '@/components/hq/photos-client'

export const dynamic = 'force-dynamic'

function rangeForMonth(yearParam: string | undefined, monthParam: string | undefined) {
  const now = new Date(Date.now() + 8 * 3600000)
  const currentYear = now.getUTCFullYear()
  const currentMonth = now.getUTCMonth() + 1
  const parsedYear = Number(yearParam)
  const parsedMonth = Number(monthParam)
  const year = Number.isInteger(parsedYear) && parsedYear >= 2020 && parsedYear <= currentYear ? parsedYear : currentYear
  const month = Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
    ? parsedMonth
    : currentMonth
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { year, month, first, last, currentYear }
}

function asPhotoArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (typeof item === 'string') return item ? [{ url: item, label: '' }] : []
    if (item && typeof item === 'object' && typeof (item as any).url === 'string') {
      return [{ url: (item as any).url as string, label: String((item as any).label ?? '') }]
    }
    return []
  })
}

export default async function HQPhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const user = await getAuthedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', user.id).single()
  const canView = canReviewClosings(profile) || canManageStoreReceipts(profile) || canManageCKReceipts(profile)
  if (!canView) redirect('/manager/dashboard')

  const params = await searchParams
  const { year, month, first, last, currentYear } = rangeForMonth(params.year, params.month)
  const admin = createAdminClient()
  const stores = await getCachedAllStores()
  const storeMap = Object.fromEntries(stores.map(store => [store.id, {
    name: store.name,
    type: store.type === '央廚' ? '央廚' : '店面',
  }]))

  const [{ data: receipts }, { data: closings }, { data: ckRecords }, { data: meetings }] = await Promise.all([
    admin.from('receipts')
      .select('id, store_id, business_date, vendor_name, actual_vendor_name, photo_url, created_at')
      .gte('business_date', first).lte('business_date', last)
      .not('photo_url', 'is', null)
      .order('business_date', { ascending: false }),
    admin.from('daily_closings')
      .select('id, store_id, business_date, ck_delivery_photo_url, channel_photo_urls, envelope_photo_url, void_invoice_photo_urls, note_photo_url, extra_photo_urls')
      .gte('business_date', first).lte('business_date', last),
    admin.from('ck_daily_records')
      .select('id, ck_store_id, business_date, receipt_photo_urls, hq_reimbursement_photo_urls')
      .gte('business_date', first).lte('business_date', last),
    admin.from('meeting_reports')
      .select('id, store_id, period_end, meeting_date, customer_feedback_photos, staff_status_photos, product_quality_photos, notes_photos')
      .gte('period_end', first).lte('period_end', last),
  ])

  const photos: PhotoLibraryItem[] = []
  const seen = new Set<string>()
  function add(item: Omit<PhotoLibraryItem, 'id'>) {
    if (!item.url || seen.has(`${item.url}|${item.kind}|${item.date}`)) return
    seen.add(`${item.url}|${item.kind}|${item.date}`)
    photos.push({ ...item, id: `${photos.length}-${item.url}` })
  }
  function addForStore(url: string, storeId: string, date: string, kind: string, label: string, source: string) {
    const store = storeMap[storeId]
    add({ url, storeId, storeName: store?.name ?? '未知店家', storeType: store?.type ?? '店面', date, kind, label, source })
  }

  for (const row of receipts ?? []) {
    addForStore(row.photo_url as string, row.store_id as string, row.business_date as string, '收據',
      (row.actual_vendor_name || row.vendor_name || '收據') as string, '店面帳目')
  }
  for (const row of closings ?? []) {
    const storeId = row.store_id as string
    const date = row.business_date as string
    if (row.ck_delivery_photo_url) addForStore(row.ck_delivery_photo_url as string, storeId, date, '央廚配送', '配送單', '店面結帳')
    if (row.envelope_photo_url) addForStore(row.envelope_photo_url as string, storeId, date, '信封袋', '信封袋', '店面結帳')
    if (row.note_photo_url) addForStore(row.note_photo_url as string, storeId, date, '備註', '備註', '店面結帳')
    for (const [channel, url] of Object.entries((row.channel_photo_urls as Record<string, string> | null) ?? {})) {
      if (url) addForStore(url, storeId, date, '平台對帳', channel, '店面結帳')
    }
    for (const [index, url] of ((row.void_invoice_photo_urls as string[] | null) ?? []).entries()) {
      if (url) addForStore(url, storeId, date, '作廢發票', `作廢發票 ${index + 1}`, '店面結帳')
    }
    for (const [index, photo] of asPhotoArray(row.extra_photo_urls).entries()) {
      addForStore(photo.url, storeId, date, '其他照片', photo.label || `其他照片 ${index + 1}`, '店面結帳')
    }
  }
  const ckRecordIds = (ckRecords ?? []).map(row => row.id as string)
  const { data: ckExpenses } = ckRecordIds.length > 0
    ? await admin.from('ck_expense_items').select('ck_daily_record_id, item_name, receipt_photo_url').in('ck_daily_record_id', ckRecordIds)
    : { data: [] }
  const ckRecordMap = Object.fromEntries((ckRecords ?? []).map(row => [row.id as string, row]))
  for (const row of ckRecords ?? []) {
    const storeId = row.ck_store_id as string
    const date = row.business_date as string
    for (const [index, url] of ((row.receipt_photo_urls as string[] | null) ?? []).entries()) {
      if (url) addForStore(url, storeId, date, '央廚單據', `央廚單據 ${index + 1}`, '央廚帳目')
    }
    for (const [index, url] of ((row.hq_reimbursement_photo_urls as string[] | null) ?? []).entries()) {
      if (url) addForStore(url, storeId, date, '補款照片', `補款照片 ${index + 1}`, '央廚帳目')
    }
  }
  for (const row of ckExpenses ?? []) {
    const record = ckRecordMap[row.ck_daily_record_id as string]
    if (record?.business_date && row.receipt_photo_url) {
      addForStore(row.receipt_photo_url as string, record.ck_store_id as string, record.business_date as string,
        '央廚支出', (row.item_name || '央廚支出') as string, '央廚帳目')
    }
  }
  const meetingSections = [
    ['customer_feedback_photos', '顧客回饋'],
    ['staff_status_photos', '人員狀況'],
    ['product_quality_photos', '產品品質'],
    ['notes_photos', '備註'],
  ] as const
  for (const row of meetings ?? []) {
    const date = (row.meeting_date || row.period_end) as string
    for (const [field, label] of meetingSections) {
      for (const [index, photo] of asPhotoArray(row[field]).entries()) {
        addForStore(photo.url, row.store_id as string, date, '會議報告', photo.label || `${label} ${index + 1}`, '會議報告')
      }
    }
  }

  return <PhotosClient photos={photos} year={year} month={month} currentYear={currentYear} />
}
