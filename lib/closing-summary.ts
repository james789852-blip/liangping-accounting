export interface ClosingRevenueInput {
  pos_cash: number
  uber_amounts: Record<string, number>
  panda_amount: number
  twpay_amount: number
  online_amount: number
  online_cash_amount: number
  bills_1000: number
  bills_500: number
  bills_100: number
  coins_50: number
  coins_10: number
  coins_5: number
  coins_1: number
  lump_1000: number
  lump_500: number
  lump_100: number
  lump_50: number
  lump_10: number
  lump_5: number
  lump_1: number
}

export interface ClosingStoreInput {
  ichef_uber_linked: boolean
  petty_cash: number
}

export interface ClosingAdjustmentInput {
  type: 'advance' | 'reimburse' | 'customer_transfer' | 'carryover' | 'other'
  amount: number
}

export interface ClosingReserveInput {
  amount: number
}

export interface ClosingLargeExpenseInput {
  amount: number
  preReserved?: boolean
}

export interface ClosingSummaryInput {
  revenue: ClosingRevenueInput
  store: ClosingStoreInput
  totalExpenses: number
  handwriteTotal: number
  deliveryFee: number
  adjustments: ClosingAdjustmentInput[]
  reserves: ClosingReserveInput[]
  largeCashExpenses: ClosingLargeExpenseInput[]
}

/**
 * 每日結帳唯一的金額計算入口。
 *
 * UI 只負責收集資料；所有會寫入 daily_closings 的總額都必須從這裡產生，
 * 讓歷史帳本回歸測試可以在沒有瀏覽器與資料庫的情況下驗證同一套正式邏輯。
 */
export function calculateClosingSummary(input: ClosingSummaryInput) {
  const { revenue: data, store } = input
  const uberTotal = Object.values(data.uber_amounts).reduce((sum, amount) => sum + amount, 0)
  const platformTotal = uberTotal + data.panda_amount + data.twpay_amount + data.online_amount
  const platformPaid = platformTotal + data.online_cash_amount

  const totalRevenue = store.ichef_uber_linked
    ? data.pos_cash
    : data.pos_cash + input.handwriteTotal + platformTotal

  const shouldEnvelope = totalRevenue - platformPaid - input.totalExpenses
  const netToHQ = shouldEnvelope - input.deliveryFee
  const cashSubtotal =
    (data.bills_1000 * 1000 + data.lump_1000) +
    (data.bills_500 * 500 + data.lump_500) +
    (data.bills_100 * 100 + data.lump_100) +
    (data.coins_50 * 50 + data.lump_50) +
    (data.coins_10 * 10 + data.lump_10) +
    (data.coins_5 * 5 + data.lump_5) +
    (data.coins_1 + data.lump_1)

  const largeExpenseTotal = input.largeCashExpenses.reduce(
    (sum, item) => sum + Math.abs(item.amount || 0),
    0,
  )
  const preReservedExpenseTotal = input.largeCashExpenses.reduce(
    (sum, item) => sum + (item.preReserved === true ? Math.abs(item.amount || 0) : 0),
    0,
  )
  const customerTransferTotal = input.adjustments
    .filter(item => item.type === 'customer_transfer')
    .reduce((sum, item) => sum + Math.abs(Number(item.amount) || 0), 0)
  const cashTotal = cashSubtotal - largeExpenseTotal + customerTransferTotal
  const actualRemit = cashTotal - store.petty_cash
  const variance = actualRemit - shouldEnvelope
  const storeRevenue = totalRevenue - platformPaid
  const adjustmentTotal = input.adjustments.reduce((sum, item) => sum + item.amount, 0)
  const finalRemit = actualRemit + adjustmentTotal
  const netVariance = finalRemit - shouldEnvelope
  const totalReserved = input.reserves.reduce((sum, item) => sum + item.amount, 0)
  const remitToHQ = finalRemit - totalReserved + preReservedExpenseTotal

  return {
    totalRevenue,
    platformTotal,
    platformPaid,
    storeRevenue,
    deliveryFee: input.deliveryFee,
    totalExpenses: input.totalExpenses,
    shouldEnvelope,
    netToHQ,
    cashSubtotal,
    largeExpenseTotal,
    preReservedExpenseTotal,
    cashExpenseTotal: largeExpenseTotal,
    cashTotal,
    actualRemit,
    variance,
    adjustmentTotal,
    finalRemit,
    netVariance,
    totalReserved,
    remitToHQ,
  }
}
