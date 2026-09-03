import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'
import { sanitizeAuditMetadata } from '@/lib/audit-metadata'

export { buildAuditChanges, sanitizeAuditMetadata } from '@/lib/audit-metadata'

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
  | 'user_create'
  | 'user_update'
  | 'user_password_reset'
  | 'user_status_update'
  | 'user_delete'

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

function summarizeUserAgent(userAgent: string) {
  const device = /iPad/i.test(userAgent) ? 'iPad'
    : /iPhone/i.test(userAgent) ? 'iPhone'
      : /Android/i.test(userAgent) ? 'Android 裝置'
        : /Mobile/i.test(userAgent) ? '手機'
          : '電腦'
  const browser = /Edg\//i.test(userAgent) ? 'Edge'
    : /CriOS\//i.test(userAgent) ? 'Chrome iOS'
      : /Chrome\//i.test(userAgent) ? 'Chrome'
        : /FxiOS\//i.test(userAgent) ? 'Firefox iOS'
          : /Firefox\//i.test(userAgent) ? 'Firefox'
            : /Safari\//i.test(userAgent) ? 'Safari'
              : '其他瀏覽器'
  const os = /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS / iPadOS'
    : /Android/i.test(userAgent) ? 'Android'
      : /Macintosh|Mac OS X/i.test(userAgent) ? 'macOS'
        : /Windows/i.test(userAgent) ? 'Windows'
          : /Linux/i.test(userAgent) ? 'Linux'
            : '其他系統'
  return { device, browser, os }
}

async function requestSource(): Promise<Record<string, string> | null> {
  try {
    const requestHeaders = await headers()
    const userAgent = requestHeaders.get('user-agent') ?? ''
    if (!userAgent) return null
    return summarizeUserAgent(userAgent)
  } catch {
    // Scheduled/background jobs do not always have request headers.
    return null
  }
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
    const safeMetadata = sanitizeAuditMetadata(metadata ?? {}) as Record<string, unknown>
    const source = await requestSource()
    await admin.from('audit_logs').insert({
      event_type: eventType,
      severity,
      store_id: storeId ?? null,
      user_id: userId ?? null,
      closing_id: closingId ?? null,
      description,
      metadata: {
        ...safeMetadata,
        ...(safeMetadata.source || !source ? {} : { source }),
        audit_version: 2,
      },
    })
  } catch (e) {
    console.error('[logAudit] failed:', eventType, e)
  }
}
