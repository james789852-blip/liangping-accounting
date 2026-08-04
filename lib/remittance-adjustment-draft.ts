type ClosingSnapshot = {
  id?: string | null
  status?: string | null
  updatedAt?: string | null
  disputeToken?: string | null
}

type AdjustmentDraftSnapshot = {
  savedAt: number
  closingId?: string | null
  baseUpdatedAt?: string | null
  disputeToken?: string | null
}

const LOCKED_STATUSES = new Set(['submitted', 'verified'])

function timestamp(value: string | null | undefined) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Decide whether a device-local remittance draft is newer than the database
 * snapshot currently rendered by the page.
 *
 * Submitted/verified records always use the database. For editable records,
 * drafts carrying the same base revision are unsaved changes and may be
 * restored. Legacy drafts without revision metadata must be strictly newer
 * than the database row.
 */
export function shouldRestoreRemittanceAdjustmentDraft(
  closing: ClosingSnapshot | null,
  draft: AdjustmentDraftSnapshot,
) {
  if (LOCKED_STATUSES.has(closing?.status ?? '')) return false
  if (!closing?.id) return true
  if (draft.closingId && draft.closingId !== closing.id) return false

  // 每一次退回都是獨立的編輯版本。退回前或上一次退回留下的草稿
  // 沒有本次 token，絕不能自動套入剛退回的權威 DB 內容。
  if (closing.status === 'disputed') {
    if (!closing.disputeToken || draft.disputeToken !== closing.disputeToken) return false
  }

  const databaseUpdatedAt = timestamp(closing.updatedAt)
  const draftBaseUpdatedAt = timestamp(draft.baseUpdatedAt)

  if (databaseUpdatedAt > 0 && draftBaseUpdatedAt === databaseUpdatedAt) {
    return true
  }

  return draft.savedAt > 0 && draft.savedAt > databaseUpdatedAt
}
