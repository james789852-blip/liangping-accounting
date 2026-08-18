export type ExcelPlatformColumn = {
  key: string
  label: string
}

/**
 * 建立 Excel 收入平台欄順序。
 *
 * 鑫耀鑫既有帳表以 Uber 帳號「鑫耀鑫」放在 D 欄、TWPAY 放在 E 欄；
 * 其他店家維持原本 TWPAY 在 Uber 帳號前的順序。
 */
export function getExcelPlatformColumns(
  storeName: string,
  twpayEnabled: boolean,
  uberAccounts: string[],
): ExcelPlatformColumn[] {
  const twpay = twpayEnabled ? [{ key: 'twpay', label: 'TWPAY' }] : []
  const uber = uberAccounts.map(account => ({ key: `uber:${account}`, label: account }))
  const normalizedStoreName = storeName.replace(/[\s　]+/g, '')

  return normalizedStoreName === '鑫耀鑫'
    ? [...uber, ...twpay]
    : [...twpay, ...uber]
}
