type CKMemberOrderRow = {
  store_id: string | null
  ck_confirmed_amount: number | null
  amount?: number | null
}

/** 央廚帳目只採用央廚輸入欄位，明確忽略舊的店家自報 amount。 */
export function confirmedMemberAmountMap(rows: CKMemberOrderRow[]) {
  const result: Record<string, number | null> = {}
  for (const row of rows) {
    if (!row.store_id) continue
    result[row.store_id] = row.ck_confirmed_amount == null
      ? null
      : Number(row.ck_confirmed_amount)
  }
  return result
}
