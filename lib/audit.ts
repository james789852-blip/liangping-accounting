import { createAdminClient } from '@/lib/supabase/admin'

export type AuditSeverity = 'info' | 'warn' | 'error'

export type AuditEvent =
  | 'closing_submit'
  | 'closing_verify'
  | 'closing_dispute'
  | 'closing_edit'
  | 'closing_delete'
  | 'receipt_create'
  | 'receipt_update'
  | 'receipt_delete'
  | 'ck_record_update'
  | 'ck_hq_paid'
  | 'sheets_sync_failed'
  | 'variance_alert'
  | 'ck_price_update'
  | 'store_update'

interface LogAuditInput {
  eventType: AuditEvent
  severity?: AuditSeverity
  storeId?: string | null
  userId?: string | null
  closingId?: string | null
  description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
}

/**
 * Inserts an entry into audit_logs. Best-effort: failures are logged to console
 * but never throw, so caller code paths never break because of audit failure.
 */
export async function logAudit({
  eventType, severity = 'info', storeId, userId, closingId, description, metadata,
}: LogAuditInput): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('audit_logs').insert({
      event_type: eventType,
      severity,
      store_id: storeId ?? null,
      user_id: userId ?? null,
      closing_id: closingId ?? null,
      description,
      metadata: metadata ?? {},
    })
  } catch (e) {
    console.error('[logAudit] failed:', eventType, e)
  }
}
