/**
 * 品項名稱的歷史資料相容鍵。
 *
 * 收據曾因不同畫面或舊版本，存下括號、連字號或用字略有差異的名稱。
 * Excel 欄位與品項設定仍以目前的 mapping 名稱為準；這裡只負責判斷
 * 「是否為同一個品項」，不會改動畫面顯示名稱。
 */
export function itemNameCompatibilityKey(value: string | null | undefined): string {
  const compact = (value ?? '')
    .replace(/[\s　()（）\-－—–_]/g, '')
    .trim()

  // 各店歷史上曾混用「與／跟」及「購買／買」，語意皆為向分店買食材。
  if (
    compact === '與分店購買食材'
    || compact === '跟分店購買食材'
    || compact === '跟分店買食材'
  ) {
    return '與分店買食材'
  }

  // 央廚單價表歷史名稱是「油蔥酥」，各店央廚配送 mapping 則統一使用
  // 「油蔥」。兩者是同一個央廚品項；vendor_group 仍會在匯出時分流，
  // 因此不會跟「雜貨」分類下購買的油蔥酥混在一起。
  if (compact === '油蔥酥' || compact === '油蔥') {
    return '油蔥'
  }

  return compact
}
