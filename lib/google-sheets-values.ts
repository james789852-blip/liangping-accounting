export type GoogleSheetsInputValue = string | number | null

type UserEnteredValue =
  | { formulaValue: string }
  | { numberValue: number }
  | { stringValue: string }

export type GoogleSheetsCellData = {
  userEnteredValue?: UserEnteredValue
}

export type GoogleSheetsRowData = {
  values: GoogleSheetsCellData[]
}

function toUserEnteredValue(value: GoogleSheetsInputValue): UserEnteredValue | undefined {
  if (value === null) return undefined
  if (typeof value === 'number') return { numberValue: value }
  if (value.startsWith('=')) return { formulaValue: value }
  return { stringValue: value }
}

/**
 * Convert the native workbook values into Sheets API RowData.
 *
 * Empty cells intentionally omit `userEnteredValue`. When UpdateCells uses the
 * `userEnteredValue` field mask, omitted cells and uncovered rows in the target
 * range are cleared in the same atomic request that writes the new values.
 */
export function googleSheetsRowData(
  values: GoogleSheetsInputValue[][],
  columnCount: number,
): GoogleSheetsRowData[] {
  return values.map(row => ({
    values: Array.from({ length: columnCount }, (_, columnIndex) => {
      const userEnteredValue = toUserEnteredValue(row[columnIndex] ?? null)
      return userEnteredValue ? { userEnteredValue } : {}
    }),
  }))
}
