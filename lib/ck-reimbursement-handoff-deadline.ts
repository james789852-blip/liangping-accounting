export const CK_REIMBURSEMENT_AUTO_CONFIRM_HOURS = 24
export const CK_REIMBURSEMENT_AUTO_CONFIRM_MS = CK_REIMBURSEMENT_AUTO_CONFIRM_HOURS * 60 * 60 * 1000

export function getCKReimbursementAutoConfirmAt(sentAt: string | null | undefined) {
  if (!sentAt) return null
  const sentTime = new Date(sentAt).getTime()
  if (!Number.isFinite(sentTime)) return null
  return new Date(sentTime + CK_REIMBURSEMENT_AUTO_CONFIRM_MS).toISOString()
}

export function isCKReimbursementExpired(sentAt: string | null | undefined, now: Date = new Date()) {
  const deadline = getCKReimbursementAutoConfirmAt(sentAt)
  return deadline !== null && new Date(deadline).getTime() <= now.getTime()
}
