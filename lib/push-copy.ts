export type AccountingKind = 'store' | 'ck'

export type PendingReviewNotificationItem = {
  accountingKind: AccountingKind
  storeId: string
  storeName: string
  recordId: string
  businessDate: string
  senderName: string
}

export type PushCopy = {
  title: string
  body: string
  url: string
  tag: string
}

export function accountingKindLabel(kind: AccountingKind) {
  return kind === 'ck' ? '央廚' : '店面'
}

export function hqAccountingUrl(kind: AccountingKind, storeId: string, businessDate: string) {
  const tab = kind === 'ck' ? 'ck' : 'store'
  const storeKey = kind === 'ck' ? 'ckStoreId' : 'storeId'
  return `/hq/accounting?tab=${tab}&${storeKey}=${encodeURIComponent(storeId)}&date=${encodeURIComponent(businessDate)}`
}

export function managerAccountingUrl(kind: AccountingKind, recordId: string, businessDate: string) {
  return kind === 'ck'
    ? `/manager/ck?date=${encodeURIComponent(businessDate)}`
    : `/manager/history/${encodeURIComponent(recordId)}`
}

export function buildPendingReviewNotification(items: PendingReviewNotificationItem[]): PushCopy {
  if (items.length === 0) throw new Error('待審通知至少需要一筆帳目')

  if (items.length === 1) {
    const item = items[0]
    return {
      title: `${item.storeName}帳目待審核`,
      body: `${item.businessDate}｜${item.senderName}已送出${accountingKindLabel(item.accountingKind)}帳目，點此直接進入審核。`,
      url: hqAccountingUrl(item.accountingKind, item.storeId, item.businessDate),
      tag: `${item.accountingKind}-pending-review-${item.recordId}`,
    }
  }

  const uniqueStoreCount = new Set(items.map(item => item.storeId)).size
  const details = items.slice(0, 3)
    .map(item => `${item.storeName}／${item.senderName}／${item.businessDate}`)
    .join('；')
  const remaining = items.length > 3 ? `；另有 ${items.length - 3} 筆` : ''
  const dates = [...new Set(items.map(item => item.businessDate))]
  const url = dates.length === 1
    ? `/hq/accounting?date=${encodeURIComponent(dates[0])}`
    : '/hq/accounting'

  return {
    title: `${uniqueStoreCount} 間單位、${items.length} 筆帳目待審核`,
    body: `${details}${remaining}。點此查看待審清單。`,
    url,
    tag: 'pending-review-summary',
  }
}
