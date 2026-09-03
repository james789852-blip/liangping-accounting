export interface AuditChange {
  field: string
  label?: string
  before: unknown
  after: unknown
}

const SENSITIVE_KEY = /(password|passwd|secret|token|authorization|cookie|credential|private[_-]?key|service[_-]?role|api[_-]?key)/i
const PRIVATE_KEY_VALUE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi

function sanitizeAuditString(value: string): string {
  if (PRIVATE_KEY_VALUE.test(value)) return '[敏感資料已遮蔽]'
  return value.replace(BEARER_VALUE, 'Bearer [敏感資料已遮蔽]')
}

/** Audit metadata may contain business snapshots, but never credentials. */
export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[資料層級過深]'
  if (typeof value === 'string') return sanitizeAuditString(value)
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => sanitizeAuditMetadata(item, depth + 1))

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY.test(key)
      ? '[敏感資料已遮蔽]'
      : sanitizeAuditMetadata(child, depth + 1)
  }
  return output
}

export function buildAuditChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string> = {},
): AuditChange[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...fields].flatMap(field => {
    if (JSON.stringify(before[field]) === JSON.stringify(after[field])) return []
    return [{ field, label: labels[field], before: before[field] ?? null, after: after[field] ?? null }]
  })
}
