export type EnvelopePackingInput = {
  remitToHQ: number
  actualRemit: number
  adjustmentTotal: number
  totalReserved: number
  preReservedExpenseTotal: number
}

export function getEnvelopePackingState(input: EnvelopePackingInput) {
  const rawAmount = Number(input.remitToHQ) || 0
  const amount = Math.max(0, rawAmount)
  const shortfall = Math.max(0, -rawAmount)

  return {
    amount,
    shortfall,
    requiresPhoto: amount > 0,
    // 不只看最後金額；調整或預留的組成改變，即使結果碰巧相同，也要重新確認照片。
    signature: JSON.stringify([
      rawAmount,
      Number(input.actualRemit) || 0,
      Number(input.adjustmentTotal) || 0,
      Number(input.totalReserved) || 0,
      Number(input.preReservedExpenseTotal) || 0,
    ]),
  }
}
