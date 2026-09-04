export const REQUIRED_ACTUAL_VENDOR_GROUPS = ['菜商', '雜貨', '免洗'] as const

export function normalizeActualVendorName(name?: string | null) {
  return (name ?? '').replace(/[\s　]+/g, '').trim()
}

export function requiresActualVendorName(vendorGroup?: string | null) {
  const group = (vendorGroup ?? '').trim()
  return REQUIRED_ACTUAL_VENDOR_GROUPS.some(requiredGroup => requiredGroup === group)
}

export function requiredActualVendorError(vendorGroup?: string | null, actualVendorName?: string | null) {
  if (!requiresActualVendorName(vendorGroup) || normalizeActualVendorName(actualVendorName)) return null
  return `「${(vendorGroup ?? '').trim()}」必須選擇或新增實際廠商名稱`
}
