// PostgreSQL uuid accepts every hexadecimal UUID layout. Some seeded store ids
// intentionally use a non-RFC version nibble, so validate shape rather than version.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  '',
])

export type StorageTarget = {
  kind: 'store' | 'central-kitchen'
  storeId: string
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export function parseStorageTarget(bucket: string, path: string): StorageTarget | null {
  const segments = path.split('/').filter(Boolean)

  if (bucket === 'receipts') {
    if (segments[0] === 'stores' && isUuid(segments[1] ?? '')) {
      return { kind: 'store', storeId: segments[1] }
    }
    if (segments[0] === 'central-kitchens' && isUuid(segments[1] ?? '')) {
      return { kind: 'central-kitchen', storeId: segments[1] }
    }
    return null
  }

  if (bucket === 'meeting-reports') {
    const storeId = segments[0] === 'meeting-reports' ? segments[1] : segments[0]
    return isUuid(storeId ?? '') ? { kind: 'store', storeId } : null
  }

  return null
}

export function isAllowedImageMimeType(mimeType: string | null | undefined): boolean {
  return !!mimeType && IMAGE_MIME_TYPES.has(mimeType.toLowerCase().split(';', 1)[0].trim())
}

export function isAllowedExcelFile(name: string, mimeType: string): boolean {
  return name.toLowerCase().endsWith('.xlsx') && EXCEL_MIME_TYPES.has(mimeType.toLowerCase())
}
