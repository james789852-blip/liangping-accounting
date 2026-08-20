import Link from 'next/link'
import { ArrowLeft, CalendarRange, Filter, Images, Search } from 'lucide-react'
import { redirect } from 'next/navigation'
import AccountingDocumentsGallery from '@/components/hq/accounting-documents-gallery'
import { getAuthedUser } from '@/lib/authed-user'
import {
  ACCOUNTING_DOCUMENT_CATEGORIES,
  ACCOUNTING_DOCUMENT_CATEGORY_LABELS,
  accountingCategoryFromDocType,
  accountingCategoryFromReceiptType,
  accountingChannelLabel,
  matchesAccountingDocument,
  normalizeAccountingDateRange,
  normalizeAccountingPhotoUrls,
  type AccountingDocument,
  type AccountingDocumentCategory,
} from '@/lib/accounting-documents'
import { getBusinessDate } from '@/lib/business-date'
import { sortStores } from '@/lib/store-order'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { canExportReports, canReviewClosings } from '@/lib/user-permissions'

export const dynamic = 'force-dynamic'

type SearchParams = {
  location?: string
  from?: string
  to?: string
  category?: string
  q?: string
}

type StoreOption = { id: string; name: string; type?: string | null }
type StoreReceiptPhotoRow = {
  id: string
  store_id: string
  business_date: string
  vendor_name: string | null
  actual_vendor_name: string | null
  receipt_type: string | null
  total_amount: number | string | null
  photo_url: string | null
  notes: string | null
  receipt_items: { item_name: string | null }[] | null
}
type ClosingPhotoRow = {
  id: string
  store_id: string
  business_date: string
  ck_delivery_photo_url: string | null
  channel_photo_urls: unknown
  envelope_photo_url: string | null
  void_invoice_photo_urls: unknown
  note_photo_url: string | null
  extra_photo_urls: unknown
}
type CKRecordPhotoRow = {
  id: string
  ck_store_id: string
  business_date: string
  receipt_photo_urls: unknown
  hq_reimbursement_photo_urls: unknown
}
type CKExpensePhotoRow = {
  id: string
  ck_daily_record_id: string
  item_name: string | null
  amount: number | string | null
  payer_name: string | null
  vendor_group: string | null
  doc_type: string | null
  note: string | null
  receipt_photo_url: string | null
}
type CKOrderPhotoRow = {
  id: string
  ck_daily_record_id: string
  store_id: string | null
  external_store_name: string | null
  amount: number | string | null
  ck_confirmed_amount: number | string | null
  delivery_photo_urls: unknown
}

function extraPhotos(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((photo, index) => {
    if (typeof photo === 'string') {
      const url = photo.trim()
      return url ? [{ url, label: `附加照片 ${index + 1}` }] : []
    }
    if (!photo || typeof photo !== 'object') return []
    const candidate = photo as { url?: unknown; label?: unknown }
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : ''
    if (!url) return []
    const label = typeof candidate.label === 'string' && candidate.label.trim()
      ? candidate.label.trim()
      : `附加照片 ${index + 1}`
    return [{ url, label }]
  })
}

export default async function AccountingDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()
  if (!canReviewClosings(profile) && !canExportReports(profile)) redirect('/manager/dashboard')

  const admin = createAdminClient()
  const params = await searchParams
  const today = getBusinessDate()
  const { from, to, wasClamped } = normalizeAccountingDateRange(params.from, params.to, today)
  const requestedCategory = params.category ?? 'all'
  const category = requestedCategory === 'all' || ACCOUNTING_DOCUMENT_CATEGORIES.includes(requestedCategory as AccountingDocumentCategory)
    ? requestedCategory
    : 'all'
  const keyword = (params.q ?? '').trim().slice(0, 100)

  const { data: storeRows, error: storesError } = await admin
    .from('stores')
    .select('id, name, type')
    .eq('active', true)
  if (storesError) throw new Error(`無法載入店家：${storesError.message}`)

  const allStores = (storeRows ?? []) as StoreOption[]
  const stores = sortStores(allStores.filter(store => store.type !== '央廚'))
  const ckStores = allStores
    .filter(store => store.type === '央廚')
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
  const validLocationTokens = new Set([
    'all',
    ...stores.map(store => `store:${store.id}`),
    ...ckStores.map(store => `ck:${store.id}`),
  ])
  const location = validLocationTokens.has(params.location ?? '') ? params.location! : 'all'
  const [locationKind, locationId] = location === 'all' ? ['all', ''] : location.split(':')
  const includeStores = locationKind === 'all' || locationKind === 'store'
  const includeCK = locationKind === 'all' || locationKind === 'ck'

  async function loadStoreDocuments() {
    if (!includeStores) return { receipts: [] as StoreReceiptPhotoRow[], closings: [] as ClosingPhotoRow[] }
    let receiptsQuery = admin
      .from('receipts')
      .select('id, store_id, business_date, vendor_name, actual_vendor_name, receipt_type, total_amount, photo_url, notes, receipt_items(item_name)')
      .gte('business_date', from)
      .lte('business_date', to)
      .not('photo_url', 'is', null)
      .order('business_date', { ascending: false })
    let closingsQuery = admin
      .from('daily_closings')
      .select('id, store_id, business_date, ck_delivery_photo_url, channel_photo_urls, envelope_photo_url, void_invoice_photo_urls, note_photo_url, extra_photo_urls')
      .gte('business_date', from)
      .lte('business_date', to)
      .order('business_date', { ascending: false })
    if (locationKind === 'store' && locationId) {
      receiptsQuery = receiptsQuery.eq('store_id', locationId)
      closingsQuery = closingsQuery.eq('store_id', locationId)
    }
    const [receiptsResult, closingsResult] = await Promise.all([receiptsQuery, closingsQuery])
    if (receiptsResult.error) throw new Error(`無法載入店面單據：${receiptsResult.error.message}`)
    if (closingsResult.error) throw new Error(`無法載入店面照片：${closingsResult.error.message}`)
    return {
      receipts: (receiptsResult.data ?? []) as StoreReceiptPhotoRow[],
      closings: (closingsResult.data ?? []) as ClosingPhotoRow[],
    }
  }

  async function loadCKDocuments() {
    if (!includeCK) return {
      records: [] as CKRecordPhotoRow[],
      expenses: [] as CKExpensePhotoRow[],
      orders: [] as CKOrderPhotoRow[],
    }
    let recordsQuery = admin
      .from('ck_daily_records')
      .select('id, ck_store_id, business_date, receipt_photo_urls, hq_reimbursement_photo_urls')
      .gte('business_date', from)
      .lte('business_date', to)
      .order('business_date', { ascending: false })
    if (locationKind === 'ck' && locationId) recordsQuery = recordsQuery.eq('ck_store_id', locationId)
    const recordsResult = await recordsQuery
    if (recordsResult.error) throw new Error(`無法載入央廚照片：${recordsResult.error.message}`)
    const records = (recordsResult.data ?? []) as CKRecordPhotoRow[]
    const recordIds = records.map(record => record.id)
    if (recordIds.length === 0) return {
      records,
      expenses: [] as CKExpensePhotoRow[],
      orders: [] as CKOrderPhotoRow[],
    }
    const [expensesResult, ordersResult] = await Promise.all([
      admin.from('ck_expense_items')
        .select('id, ck_daily_record_id, category, item_name, amount, payer_name, vendor_group, doc_type, note, receipt_photo_url')
        .in('ck_daily_record_id', recordIds)
        .not('receipt_photo_url', 'is', null),
      admin.from('ck_store_orders')
        .select('id, ck_daily_record_id, store_id, external_store_name, amount, ck_confirmed_amount, delivery_photo_urls')
        .in('ck_daily_record_id', recordIds),
    ])
    if (expensesResult.error) throw new Error(`無法載入央廚支出單據：${expensesResult.error.message}`)
    if (ordersResult.error) throw new Error(`無法載入央廚配送單：${ordersResult.error.message}`)
    return {
      records,
      expenses: (expensesResult.data ?? []) as CKExpensePhotoRow[],
      orders: (ordersResult.data ?? []) as CKOrderPhotoRow[],
    }
  }

  const [storeData, ckData] = await Promise.all([loadStoreDocuments(), loadCKDocuments()])
  const storeNameById = Object.fromEntries(allStores.map(store => [store.id, store.name]))
  const ckRecordById = Object.fromEntries(ckData.records.map(record => [record.id, record]))
  const documents: AccountingDocument[] = []
  const usedPhotos = new Set<string>()

  function addDocument(document: AccountingDocument) {
    const url = document.url.trim()
    if (!url) return
    const duplicateKey = `${document.locationId}|${document.businessDate}|${url}`
    if (usedPhotos.has(duplicateKey)) return
    usedPhotos.add(duplicateKey)
    documents.push({ ...document, url })
  }

  for (const receipt of storeData.receipts) {
    const itemNames = (receipt.receipt_items ?? [])
      .map(item => item.item_name?.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join('、')
    addDocument({
      id: `receipt:${receipt.id}`,
      url: receipt.photo_url ?? '',
      locationId: receipt.store_id,
      locationName: storeNameById[receipt.store_id] ?? '未知店家',
      locationKind: 'store',
      businessDate: receipt.business_date,
      category: accountingCategoryFromReceiptType(receipt.receipt_type),
      title: receipt.actual_vendor_name?.trim() || receipt.vendor_name?.trim() || '未填廠商',
      subtitle: itemNames || receipt.notes?.trim() || undefined,
      amount: Number(receipt.total_amount ?? 0),
    })
  }

  for (const closing of storeData.closings) {
    const base = {
      locationId: closing.store_id as string,
      locationName: storeNameById[closing.store_id] ?? '未知店家',
      locationKind: 'store' as const,
      businessDate: closing.business_date as string,
    }
    if (closing.ck_delivery_photo_url) addDocument({
      ...base, id: `closing:${closing.id}:delivery`, url: closing.ck_delivery_photo_url,
      category: 'delivery', title: '央廚配送單',
    })
    for (const [channel, url] of Object.entries((closing.channel_photo_urls ?? {}) as Record<string, unknown>)) {
      if (typeof url !== 'string') continue
      addDocument({
        ...base, id: `closing:${closing.id}:channel:${channel}`, url,
        category: 'sales', title: accountingChannelLabel(channel), subtitle: '營業額存證',
      })
    }
    if (closing.envelope_photo_url) addDocument({
      ...base, id: `closing:${closing.id}:envelope`, url: closing.envelope_photo_url,
      category: 'remittance', title: '匯款信封袋',
    })
    normalizeAccountingPhotoUrls(closing.void_invoice_photo_urls).forEach((url, index) => addDocument({
      ...base, id: `closing:${closing.id}:void:${index}`, url,
      category: 'void_invoice', title: '作廢發票',
    }))
    if (closing.note_photo_url) addDocument({
      ...base, id: `closing:${closing.id}:note`, url: closing.note_photo_url,
      category: 'note', title: '結帳備註照片',
    })
    extraPhotos(closing.extra_photo_urls).forEach((photo, index) => addDocument({
      ...base, id: `closing:${closing.id}:extra:${index}`, url: photo.url,
      category: 'other', title: photo.label,
    }))
  }

  for (const expense of ckData.expenses) {
    const record = ckRecordById[expense.ck_daily_record_id]
    if (!record) continue
    const title = expense.vendor_group?.trim() || expense.item_name?.trim() || '央廚支出單據'
    const subtitle = [expense.doc_type, expense.item_name !== title ? expense.item_name : '', expense.payer_name ? `代墊：${expense.payer_name}` : '']
      .filter(Boolean)
      .join(' · ')
    addDocument({
      id: `ck-expense:${expense.id}`,
      url: expense.receipt_photo_url ?? '',
      locationId: record.ck_store_id,
      locationName: storeNameById[record.ck_store_id] ?? '央廚',
      locationKind: 'ck',
      businessDate: record.business_date,
      category: accountingCategoryFromDocType(expense.doc_type),
      title,
      subtitle: subtitle || expense.note?.trim() || undefined,
      amount: Number(expense.amount ?? 0),
    })
  }

  for (const order of ckData.orders) {
    const record = ckRecordById[order.ck_daily_record_id]
    if (!record) continue
    const targetName = order.store_id
      ? (storeNameById[order.store_id] ?? '體系內店家')
      : (order.external_store_name?.trim() || '體系外叫貨')
    normalizeAccountingPhotoUrls(order.delivery_photo_urls).forEach((url, index) => addDocument({
      id: `ck-order:${order.id}:${index}`,
      url,
      locationId: record.ck_store_id,
      locationName: storeNameById[record.ck_store_id] ?? '央廚',
      locationKind: 'ck',
      businessDate: record.business_date,
      category: 'delivery',
      title: `${targetName} 配送單`,
      subtitle: order.store_id ? '體系內叫貨' : '體系外叫貨',
      amount: Number(order.ck_confirmed_amount ?? order.amount ?? 0),
    }))
  }

  for (const record of ckData.records) {
    const base = {
      locationId: record.ck_store_id as string,
      locationName: storeNameById[record.ck_store_id] ?? '央廚',
      locationKind: 'ck' as const,
      businessDate: record.business_date as string,
    }
    normalizeAccountingPhotoUrls(record.hq_reimbursement_photo_urls).forEach((url, index) => addDocument({
      ...base, id: `ck-record:${record.id}:reimbursement:${index}`, url,
      category: 'remittance', title: '總公司補款憑證',
    }))
    normalizeAccountingPhotoUrls(record.receipt_photo_urls).forEach((url, index) => addDocument({
      ...base, id: `ck-record:${record.id}:receipt:${index}`, url,
      category: 'other', title: '央廚待分類單據',
    }))
  }

  const filteredDocuments = documents
    .filter(document => matchesAccountingDocument(document, category, keyword))
    .sort((a, b) => (
      b.businessDate.localeCompare(a.businessDate)
      || a.locationName.localeCompare(b.locationName, 'zh-Hant')
      || a.title.localeCompare(b.title, 'zh-Hant')
    ))

  const fieldStyle = {
    height: 42,
    border: '1px solid #d4d4d8',
    borderRadius: 10,
    background: 'white',
    color: '#18181b',
    fontSize: 14,
    outline: 'none',
  }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-4 py-4 sm:px-6" style={{ borderBottom: '1px solid #e4e4e7' }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={`/hq/accounting?date=${encodeURIComponent(to)}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ border: '1px solid #e4e4e7', color: '#52525b' }} aria-label="返回帳目中心">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase" style={{ color: '#a1a1aa' }}>總公司 · 帳目中心</p>
              <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl" style={{ color: '#18181b' }}>
                <Images className="h-5 w-5" style={{ color: '#D97706' }} /> 單據照片
              </h1>
              <p className="mt-0.5 text-xs" style={{ color: '#71717a' }}>集中查找各店與央廚上傳的做帳照片</p>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-5 pb-28">
        <form action="/hq/accounting/documents" method="get"
          className="mb-5 rounded-2xl bg-white p-4" style={{ border: '1px solid #e4e4e7', boxShadow: '0 3px 12px rgba(15,23,42,0.04)' }}>
          <div className="mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4" style={{ color: '#D97706' }} />
            <p className="text-sm font-bold" style={{ color: '#18181b' }}>篩選照片</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="space-y-1">
              <span className="text-xs font-semibold" style={{ color: '#71717a' }}>店家／央廚</span>
              <select name="location" defaultValue={location} className="w-full px-3" style={fieldStyle}>
                <option value="all">全部據點</option>
                <optgroup label="店面">
                  {stores.map(store => <option key={store.id} value={`store:${store.id}`}>{store.name}</option>)}
                </optgroup>
                <optgroup label="央廚">
                  {ckStores.map(store => <option key={store.id} value={`ck:${store.id}`}>{store.name}</option>)}
                </optgroup>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold" style={{ color: '#71717a' }}>開始日期</span>
              <input type="date" name="from" defaultValue={from} max={today} className="w-full px-3" style={fieldStyle} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold" style={{ color: '#71717a' }}>結束日期</span>
              <input type="date" name="to" defaultValue={to} max={today} className="w-full px-3" style={fieldStyle} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold" style={{ color: '#71717a' }}>照片分類</span>
              <select name="category" defaultValue={category} className="w-full px-3" style={fieldStyle}>
                <option value="all">全部分類</option>
                {ACCOUNTING_DOCUMENT_CATEGORIES.map(value => (
                  <option key={value} value={value}>{ACCOUNTING_DOCUMENT_CATEGORY_LABELS[value]}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold" style={{ color: '#71717a' }}>關鍵字</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4" style={{ color: '#a1a1aa' }} />
                <input name="q" defaultValue={keyword} placeholder="廠商、品項…" className="w-full pl-9 pr-3" style={fieldStyle} />
              </div>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: wasClamped ? '#b45309' : '#a1a1aa' }}>
              <CalendarRange className="h-3.5 w-3.5" />
              {wasClamped ? '查詢範圍已調整為最近 31 天' : '一次最多查詢 31 天，避免大量照片拖慢頁面'}
            </div>
            <div className="flex gap-2">
              <Link href="/hq/accounting/documents" className="flex h-10 items-center rounded-xl px-4 text-sm font-bold"
                style={{ background: '#f4f4f5', color: '#52525b' }}>清除</Link>
              <button type="submit" className="flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)' }}>
                <Search className="h-4 w-4" /> 查詢照片
              </button>
            </div>
          </div>
        </form>

        <AccountingDocumentsGallery documents={filteredDocuments} />
      </main>
    </div>
  )
}
