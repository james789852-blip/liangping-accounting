const MISSING_VENDOR_DEFAULTS: Record<string, Record<string, string>> = {
  巷日: {
    菜商: '環南',
  },
}

/**
 * 報表用的實際廠商名稱。
 *
 * 已送出／已審核的歷史收據不可回寫；若店家已確認某分類當時只有
 * 單一廠商，報表可用這份小型對照表補上漏填名稱。已填寫的名稱永遠優先。
 */
export function resolveReportingActualVendor(
  storeName: string | null | undefined,
  vendorGroup: string | null | undefined,
  actualVendorName: string | null | undefined,
  fallback = '未指定',
): string {
  const actual = actualVendorName?.trim()
  if (actual) return actual

  const store = storeName?.trim() ?? ''
  const group = vendorGroup?.trim() ?? ''
  return MISSING_VENDOR_DEFAULTS[store]?.[group] ?? fallback
}
