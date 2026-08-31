import ExcelJS from 'exceljs'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const norm = (s: string) => s.replace(/[\s　（）()]/g, '').toLowerCase()

function getTemplateStoreLayout(ws: ExcelJS.Worksheet): {
  headerRowNum: number
  weekdayCol: number
  revenueCol: number
} | null {
  let headerRowNum = -1
  for (let row = 1; row <= 10; row++) {
    if (ws.getRow(row).getCell(1).text?.replace(/[\s　]/g, '') === '日期') {
      headerRowNum = row
      break
    }
  }
  if (headerRowNum < 0) return null

  let weekdayCol = -1
  let revenueCol = -1
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    const text = norm(cell.text?.trim() ?? '')
    if (text === norm('星期')) weekdayCol = colNum
    if (['營業額', '营业额'].includes(cell.text?.trim())) revenueCol = colNum
  })
  if (weekdayCol < 0) weekdayCol = 2
  if (revenueCol <= weekdayCol + 1) return null
  return { headerRowNum, weekdayCol, revenueCol }
}

export function ckTemplateHasStoreColumns(
  ws: ExcelJS.Worksheet,
  requiredStoreNames: string[],
): boolean {
  const layout = getTemplateStoreLayout(ws)
  if (!layout) return false

  const available = new Set<string>()
  for (let col = layout.weekdayCol + 1; col < layout.revenueCol; col++) {
    const name = ws.getRow(layout.headerRowNum).getCell(col).text?.trim()
    if (name) available.add(norm(name))
  }
  return requiredStoreNames.every(name => available.has(norm(name)))
}

/**
 * Reuses the store slots already present in an uploaded CK template, replacing
 * stale/duplicate store names while keeping every original style and column.
 */
export function prepareCKTemplateStoreColumns(
  ws: ExcelJS.Worksheet,
  requiredStoreNames: string[],
): boolean {
  const layout = getTemplateStoreLayout(ws)
  if (!layout) return false

  const storeNames = [...new Map(
    requiredStoreNames.filter(Boolean).map(name => [norm(name), name.trim()]),
  ).values()]
  const availableSlots = layout.revenueCol - layout.weekdayCol - 1
  if (availableSlots < storeNames.length) return false

  const headerRow = ws.getRow(layout.headerRowNum)
  for (let offset = 0; offset < availableSlots; offset++) {
    const columnNumber = layout.weekdayCol + 1 + offset
    headerRow.getCell(columnNumber).value = storeNames[offset] ?? null
    // Old templates used hidden placeholder columns for discontinued stores.
    // A current store assigned to one of those slots must always be visible in
    // both the downloaded Excel file and the synced Google Sheet.
    if (storeNames[offset]) {
      const column = ws.getColumn(columnNumber)
      column.hidden = false
      column.width = Math.max(column.width ?? 0, 12)
    }
  }
  return true
}

export interface CKDayData {
  storeRevenues: Record<string, number>
  expenses: Record<string, number>
  foodTotal: number
  packTotal: number
  miscTotal: number
  totalRevenue: number
  totalExpense: number
}

export interface CKRecordRow {
  id: string
  business_date: string
}

export interface CKStoreOrderRow {
  ck_daily_record_id: string
  store_id: string | null
  external_store_name: string | null
  amount: number | string | null
  ck_confirmed_amount: number | string | null
}

export interface CKExpenseRow {
  ck_daily_record_id: string
  category: string
  item_name: string
  amount: number | string | null
}

/** Shared source-of-truth transformation for both CK Excel and Google Sheets. */
export function buildCKDataMap(
  records: CKRecordRow[],
  storeOrders: CKStoreOrderRow[],
  expenseItems: CKExpenseRow[],
  storeNameMap: Record<string, string>,
): Record<string, CKDayData> {
  const ordersByRecordId: Record<string, CKStoreOrderRow[]> = {}
  for (const order of storeOrders) {
    if (!ordersByRecordId[order.ck_daily_record_id]) ordersByRecordId[order.ck_daily_record_id] = []
    ordersByRecordId[order.ck_daily_record_id].push(order)
  }
  const expensesByRecordId: Record<string, CKExpenseRow[]> = {}
  for (const expense of expenseItems) {
    if (!expensesByRecordId[expense.ck_daily_record_id]) expensesByRecordId[expense.ck_daily_record_id] = []
    expensesByRecordId[expense.ck_daily_record_id].push(expense)
  }

  const dataMap: Record<string, CKDayData> = {}
  for (const record of records) {
    const storeRevenues: Record<string, number> = {}
    for (const order of ordersByRecordId[record.id] ?? []) {
      const name = order.store_id
        ? storeNameMap[order.store_id] ?? order.store_id
        : order.external_store_name
      const amount = order.store_id
        ? Number(order.ck_confirmed_amount ?? 0)
        : Number(order.amount ?? 0)
      if (name) storeRevenues[name] = (storeRevenues[name] ?? 0) + amount
    }

    const expenses: Record<string, number> = {}
    let foodTotal = 0
    let packTotal = 0
    let miscTotal = 0
    for (const expense of expensesByRecordId[record.id] ?? []) {
      const amount = Number(expense.amount ?? 0)
      expenses[expense.item_name] = (expenses[expense.item_name] ?? 0) + amount
      if (expense.category === '食材') foodTotal += amount
      else if (expense.category === '耗材') packTotal += amount
      else miscTotal += amount
    }
    const totalRevenue = Object.values(storeRevenues).reduce((sum, amount) => sum + amount, 0)
    const totalExpense = foodTotal + packTotal + miscTotal
    dataMap[record.business_date] = { storeRevenues, expenses, foodTotal, packTotal, miscTotal, totalRevenue, totalExpense }
  }
  return dataMap
}

/** Make cross-sheet formulas deterministic in both the generated Excel and the
 * single-tab Google sync by replacing them with Excel's stored result. */
export function materializeCKCrossSheetFormulas(ws: ExcelJS.Worksheet): void {
  ws.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const value = cell.value
      if (!value || typeof value !== 'object') return
      const formula = 'formula' in value ? value.formula : null
      if (typeof formula !== 'string' || !formula.includes('!')) return
      const result = 'result' in value ? value.result : null
      cell.value = (
        (typeof result === 'number' && Number.isFinite(result))
        || (typeof result === 'string' && !result.startsWith('#'))
      ) ? result : null
    })
  })
}

type FormulaScalar = number | string | boolean | null
type FormulaRange = { kind: 'range'; values: FormulaScalar[] }
type FormulaResult = FormulaScalar | FormulaRange
type FormulaToken = {
  type: 'number' | 'string' | 'word' | 'operator' | 'leftParen' | 'rightParen' | 'comma' | 'colon'
  value: string
}

function tokenizeFormula(formula: string): FormulaToken[] {
  const tokens: FormulaToken[] = []
  let index = 0
  while (index < formula.length) {
    const char = formula[index]
    if (/\s/.test(char)) { index++; continue }
    if (char === '"') {
      let value = ''
      index++
      while (index < formula.length) {
        if (formula[index] === '"' && formula[index + 1] === '"') {
          value += '"'
          index += 2
        } else if (formula[index] === '"') {
          index++
          break
        } else {
          value += formula[index++]
        }
      }
      tokens.push({ type: 'string', value })
      continue
    }
    const number = formula.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)
    if (number) {
      tokens.push({ type: 'number', value: number[0] })
      index += number[0].length
      continue
    }
    const word = formula.slice(index).match(/^\$?[A-Za-z]{1,4}\$?\d+|^[A-Za-z_][A-Za-z0-9_.]*/)
    if (word) {
      tokens.push({ type: 'word', value: word[0] })
      index += word[0].length
      continue
    }
    const punctuation: Record<string, FormulaToken['type']> = {
      '+': 'operator', '-': 'operator', '*': 'operator', '/': 'operator',
      '(': 'leftParen', ')': 'rightParen', ',': 'comma', ':': 'colon',
    }
    const type = punctuation[char]
    if (!type) throw new Error(`Unsupported formula token: ${char}`)
    tokens.push({ type, value: char })
    index++
  }
  return tokens
}

function formulaNumber(value: FormulaResult): number {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value == null || typeof value === 'object') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formulaScalars(values: FormulaResult[]): FormulaScalar[] {
  const result: FormulaScalar[] = []
  for (const value of values) {
    if (typeof value === 'object' && value?.kind === 'range') result.push(...value.values)
    else result.push(value as FormulaScalar)
  }
  return result
}

function formulaCriterionMatches(value: FormulaScalar, criterion: FormulaScalar): boolean {
  if (typeof criterion !== 'string') return value === criterion
  const match = criterion.match(/^(>=|<=|<>|>|<|=)(.*)$/)
  if (!match) return String(value ?? '') === criterion
  const expectedText = match[2]
  const expectedNumber = Number(expectedText)
  const numeric = Number.isFinite(expectedNumber) && typeof value === 'number'
  const left = numeric ? value : String(value ?? '')
  const right = numeric ? expectedNumber : expectedText
  if (match[1] === '=') return left === right
  if (match[1] === '<>') return left !== right
  if (match[1] === '>') return left > right
  if (match[1] === '<') return left < right
  if (match[1] === '>=') return left >= right
  return left <= right
}

function formulaColumnNumber(letters: string): number {
  let result = 0
  for (const char of letters.toUpperCase()) result = result * 26 + char.charCodeAt(0) - 64
  return result
}

function formulaColumnLetters(columnNumber: number): string {
  let result = ''
  let value = columnNumber
  while (value > 0) {
    value--
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
}

function formulaAddressParts(address: string): { row: number; column: number } {
  const match = address.replace(/\$/g, '').match(/^([A-Za-z]+)(\d+)$/)
  if (!match) throw new Error(`Invalid formula address: ${address}`)
  return { row: Number(match[2]), column: formulaColumnNumber(match[1]) }
}

function adjustCKFormula(formula: string, rowOffset: number, columnOffset: number): string {
  return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/gi, (_, absoluteColumn, column, absoluteRow, row) => {
    const nextColumn = absoluteColumn ? formulaColumnNumber(column) : formulaColumnNumber(column) + columnOffset
    const nextRow = absoluteRow ? Number(row) : Number(row) + rowOffset
    return `${absoluteColumn ? '$' : ''}${formulaColumnLetters(nextColumn)}${absoluteRow ? '$' : ''}${nextRow}`
  })
}

/**
 * Recalculate the same-sheet formulas used by CK templates and refresh their
 * cached Excel results. Google evaluates these formulas immediately, whereas
 * ExcelJS otherwise preserves stale results from the uploaded template.
 */
export function refreshCKFormulaResults(ws: ExcelJS.Worksheet): void {
  // ExcelJS exposes copied formulas as sharedFormula slaves. Turn them into
  // explicit formulas first so every cached result can be recalculated.
  ws.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const value = cell.value
      if (!value || typeof value !== 'object' || !('sharedFormula' in value) || typeof value.sharedFormula !== 'string') return
      const masterValue = ws.getCell(value.sharedFormula).value
      if (!masterValue || typeof masterValue !== 'object' || !('formula' in masterValue) || typeof masterValue.formula !== 'string') return
      const master = formulaAddressParts(value.sharedFormula)
      const current = formulaAddressParts(cell.address)
      cell.value = {
        formula: adjustCKFormula(masterValue.formula, current.row - master.row, current.column - master.column),
        result: 'result' in value ? value.result : null,
      } as ExcelJS.CellFormulaValue
    })
  })

  const memo = new Map<string, FormulaScalar>()
  const evaluating = new Set<string>()

  function cellScalar(address: string): FormulaScalar {
    const normalizedAddress = address.replace(/\$/g, '').toUpperCase()
    if (memo.has(normalizedAddress)) return memo.get(normalizedAddress) ?? null
    const cell = ws.getCell(normalizedAddress)
    const value = cell.value
    if (value == null) return null
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value
    if (value instanceof Date) return value.getTime()
    if (typeof value === 'object' && 'formula' in value && typeof value.formula === 'string') {
      if (evaluating.has(normalizedAddress)) return typeof value.result === 'number' ? value.result : null
      if (value.formula.includes('!')) return typeof value.result === 'number' || typeof value.result === 'string' ? value.result : null
      evaluating.add(normalizedAddress)
      try {
        const result = evaluateFormula(value.formula)
        memo.set(normalizedAddress, result)
        return result
      } finally {
        evaluating.delete(normalizedAddress)
      }
    }
    if (typeof value === 'object' && 'result' in value) {
      return typeof value.result === 'number' || typeof value.result === 'string' || typeof value.result === 'boolean'
        ? value.result
        : null
    }
    return null
  }

  function rangeValues(start: string, end: string): FormulaScalar[] {
    const startMatch = start.replace(/\$/g, '').match(/^([A-Za-z]+)(\d+)$/)
    const endMatch = end.replace(/\$/g, '').match(/^([A-Za-z]+)(\d+)$/)
    if (!startMatch || !endMatch) throw new Error(`Invalid formula range: ${start}:${end}`)
    const startColumn = formulaColumnNumber(startMatch[1])
    const endColumn = formulaColumnNumber(endMatch[1])
    const startRow = Number(startMatch[2])
    const endRow = Number(endMatch[2])
    const values: FormulaScalar[] = []
    for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row++) {
      for (let column = Math.min(startColumn, endColumn); column <= Math.max(startColumn, endColumn); column++) {
        values.push(cellScalar(ws.getRow(row).getCell(column).address))
      }
    }
    return values
  }

  function evaluateFormula(formula: string): FormulaScalar {
    const tokens = tokenizeFormula(formula.startsWith('=') ? formula.slice(1) : formula)
    let position = 0
    const peek = () => tokens[position]
    const take = () => tokens[position++]
    const requireToken = (type: FormulaToken['type']) => {
      const token = take()
      if (!token || token.type !== type) throw new Error(`Expected ${type} in formula: ${formula}`)
      return token
    }

    function parseExpression(): FormulaResult {
      let value = parseTerm()
      while (peek()?.type === 'operator' && ['+', '-'].includes(peek().value)) {
        const operator = take().value
        const right = parseTerm()
        value = operator === '+' ? formulaNumber(value) + formulaNumber(right) : formulaNumber(value) - formulaNumber(right)
      }
      return value
    }

    function parseTerm(): FormulaResult {
      let value = parseUnary()
      while (peek()?.type === 'operator' && ['*', '/'].includes(peek().value)) {
        const operator = take().value
        const right = parseUnary()
        value = operator === '*' ? formulaNumber(value) * formulaNumber(right) : formulaNumber(value) / formulaNumber(right)
      }
      return value
    }

    function parseUnary(): FormulaResult {
      if (peek()?.type === 'operator' && ['+', '-'].includes(peek().value)) {
        const operator = take().value
        const value = formulaNumber(parseUnary())
        return operator === '-' ? -value : value
      }
      return parsePrimary()
    }

    function parseFunction(name: string): FormulaScalar {
      requireToken('leftParen')
      const args: FormulaResult[] = []
      if (peek()?.type !== 'rightParen') {
        do {
          args.push(parseExpression())
          if (peek()?.type !== 'comma') break
          take()
        } while (true)
      }
      requireToken('rightParen')
      const upperName = name.toUpperCase()
      if (upperName === 'SUMIFS') {
        const sumValues = formulaScalars([args[0]])
        const criteriaPairs = args.slice(1)
        let sum = 0
        for (let index = 0; index < sumValues.length; index++) {
          let matches = true
          for (let pair = 0; pair < criteriaPairs.length; pair += 2) {
            const criteriaValues = formulaScalars([criteriaPairs[pair]])
            if (!formulaCriterionMatches(criteriaValues[index] ?? null, criteriaPairs[pair + 1] as FormulaScalar)) {
              matches = false
              break
            }
          }
          if (matches) sum += formulaNumber(sumValues[index])
        }
        return sum
      }
      const scalars = formulaScalars(args)
      const numbers = scalars.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      if (upperName === 'SUM') return numbers.reduce((sum, value) => sum + value, 0)
      if (upperName === 'AVERAGE') return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0
      if (upperName === 'MAX') return numbers.length ? Math.max(...numbers) : 0
      if (upperName === 'MIN') return numbers.length ? Math.min(...numbers) : 0
      throw new Error(`Unsupported formula function: ${name}`)
    }

    function parsePrimary(): FormulaResult {
      const token = take()
      if (!token) throw new Error(`Unexpected end of formula: ${formula}`)
      if (token.type === 'number') return Number(token.value)
      if (token.type === 'string') return token.value
      if (token.type === 'leftParen') {
        const result = parseExpression()
        requireToken('rightParen')
        return result
      }
      if (token.type !== 'word') throw new Error(`Unexpected token ${token.value} in formula: ${formula}`)
      if (peek()?.type === 'leftParen') return parseFunction(token.value)
      if (!/^\$?[A-Za-z]+\$?\d+$/.test(token.value)) throw new Error(`Unsupported formula name: ${token.value}`)
      if (peek()?.type === 'colon') {
        take()
        const end = requireToken('word').value
        return { kind: 'range', values: rangeValues(token.value, end) }
      }
      return cellScalar(token.value)
    }

    const result = parseExpression()
    if (position !== tokens.length) throw new Error(`Unparsed formula content: ${formula}`)
    if (typeof result === 'object') throw new Error(`Formula returned a range: ${formula}`)
    return result
  }

  ws.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const value = cell.value
      if (!value || typeof value !== 'object' || !('formula' in value) || typeof value.formula !== 'string') return
      if (value.formula.includes('!')) return
      try {
        const result = cellScalar(cell.address)
        // ExcelJS drops a numeric zero from a formula's cached result. Store
        // zero-result formulas as the authoritative number so Excel and Google
        // both persist the same numeric value instead of Excel reopening stale.
        cell.value = result === 0 ? 0 : { ...value, result } as ExcelJS.CellFormulaValue
      } catch (error) {
        console.warn(`[refreshCKFormulaResults] ${ws.name}!${cell.address}:`, error)
      }
    })
  })
}

export function getDaysInMonth(year: number, month: number): string[] {
  const count = new Date(year, month, 0).getDate()
  return Array.from({ length: count }, (_, i) =>
    `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
  )
}

/**
 * Fills a CK template worksheet with monthly data.
 * Mutates the worksheet in place. Returns { headerRowNum, dataStartRow } or null on failure.
 */
export function fillCKWorksheet(
  ws: ExcelJS.Worksheet,
  days: string[],
  dataMap: Record<string, CKDayData>,
): { headerRowNum: number; dataStartRow: number } | null {
  let headerRowNum = -1
  for (let r = 1; r <= 10; r++) {
    if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRowNum = r; break }
  }
  if (headerRowNum < 0) return null

  const colMap: Record<string, number> = {}
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    const t = cell.text?.trim()
    if (!t) return
    colMap[t] = colNum
    colMap[norm(t)] = colNum
  })

  const dataStartRow = headerRowNum + 2
  const firstDate = days[0]
  const monthNum = firstDate ? Number(firstDate.slice(5, 7)) : null
  const dateCol = colMap['日期'] ?? colMap[norm('日期')] ?? 1
  const weekdayCol = colMap['星期'] ?? colMap[norm('星期')] ?? dateCol + 1
  const revenueCol = colMap['營業額'] ?? colMap['营业额']
  const totalExpenseCol = colMap['總'] ?? colMap['总'] ?? colMap['總支出'] ?? colMap['总支出']
  const storeColumns: Array<{ col: number; name: string }> = []

  // CK templates place member/external-store revenue columns between 日期/星期
  // and 營業額. These cells may contain formulas that refer to helper sheets in
  // the original Excel file; Google Sheets only receives the monthly tab, so
  // write the authoritative database amounts into these cells directly.
  if (revenueCol && revenueCol > weekdayCol) {
    for (let col = weekdayCol + 1; col < revenueCol; col++) {
      storeColumns.push({ col, name: ws.getRow(headerRowNum).getCell(col).text?.trim() ?? '' })
    }
  }

  if (monthNum) {
    ws.name = `${monthNum}月食耗成本`
    ws.getRow(headerRowNum + 1).getCell(dateCol).value = `${monthNum}月`
  }

  const uniqueCols = new Set(Object.values(colMap))
  const referenceStoreColumn = storeColumns[0]?.col
  days.forEach((_, idx) => {
    const excelRow = ws.getRow(dataStartRow + idx)
    if (referenceStoreColumn) {
      const referenceStyle = excelRow.getCell(referenceStoreColumn).style
      for (const storeColumn of storeColumns) {
        // A hidden placeholder may carry stale black/blocked formatting from
        // the old month. Current store cells should use the same daily style
        // as the template's first normal store column.
        storeColumnCellStyle(excelRow.getCell(storeColumn.col), referenceStyle)
      }
    }
    for (const colIdx of uniqueCols) {
      excelRow.getCell(colIdx as number).value = null
    }
  })

  function setValue(row: ExcelJS.Row, colIdx: number | undefined, value: number) {
    if (!colIdx) return
    row.getCell(colIdx).value = value || null
  }

  days.forEach((date, idx) => {
    const rowNum = dataStartRow + idx
    const d = dataMap[date]
    const excelRow = ws.getRow(rowNum)

    // Excel serial dates are timezone-free. Use UTC midnight so ExcelJS writes
    // an integer serial instead of Taiwan midnight as the previous day + 16h.
    excelRow.getCell(dateCol).value = new Date(`${date}T00:00:00.000Z`)
    const weekday = new Date(`${date}T12:00:00+08:00`).getDay()
    excelRow.getCell(weekdayCol).value = `星期${WEEKDAYS[weekday]}`

    for (const storeColumn of storeColumns) {
      const matched = Object.entries(d?.storeRevenues ?? {}).find(([name]) => (
        name === storeColumn.name || norm(name) === norm(storeColumn.name)
      ))
      excelRow.getCell(storeColumn.col).value = matched?.[1] || null
    }

    if (!d) return

    setValue(excelRow, revenueCol, d.totalRevenue)
    setValue(excelRow, totalExpenseCol, d.totalExpense)
    setValue(excelRow, colMap['食材'], d.foodTotal)
    setValue(excelRow, colMap['耗材'], d.packTotal)
    setValue(excelRow, colMap['雜項'], d.miscTotal)

    for (const [itemName, amount] of Object.entries(d.expenses)) {
      if (!amount) continue
      const colIdx = colMap[itemName] ?? colMap[norm(itemName)]
      setValue(excelRow, colIdx, amount)
    }
  })

  // Replace the template's old monthly formulas (which may reference helper
  // sheets that are not copied to Google Sheets) with authoritative totals.
  const totalRow = ws.getRow(headerRowNum + 1)
  for (const colIdx of uniqueCols) {
    if (colIdx !== dateCol && colIdx !== weekdayCol) totalRow.getCell(colIdx as number).value = null
  }
  const monthData = days.map(date => dataMap[date]).filter((day): day is CKDayData => Boolean(day))
  for (const storeColumn of storeColumns) {
    const total = monthData.reduce((sum, day) => {
      const amount = Object.entries(day.storeRevenues).find(([name]) => (
        name === storeColumn.name || norm(name) === norm(storeColumn.name)
      ))?.[1] ?? 0
      return sum + amount
    }, 0)
    setValue(totalRow, storeColumn.col, total)
  }
  setValue(totalRow, revenueCol, monthData.reduce((sum, day) => sum + day.totalRevenue, 0))
  setValue(totalRow, totalExpenseCol, monthData.reduce((sum, day) => sum + day.totalExpense, 0))
  setValue(totalRow, colMap['食材'], monthData.reduce((sum, day) => sum + day.foodTotal, 0))
  setValue(totalRow, colMap['耗材'], monthData.reduce((sum, day) => sum + day.packTotal, 0))
  setValue(totalRow, colMap['雜項'], monthData.reduce((sum, day) => sum + day.miscTotal, 0))

  const monthlyExpenses: Record<string, number> = {}
  for (const day of monthData) {
    for (const [itemName, amount] of Object.entries(day.expenses)) {
      monthlyExpenses[itemName] = (monthlyExpenses[itemName] ?? 0) + amount
    }
  }
  for (const [itemName, amount] of Object.entries(monthlyExpenses)) {
    setValue(totalRow, colMap[itemName] ?? colMap[norm(itemName)], amount)
  }

  // Resolve shared-formula slave cells
  ws.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const v = cell.value
      if (!v || typeof v !== 'object') return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sv = v as any
      if (!('sharedFormula' in sv)) return
      const masterCell = ws.getCell(sv.sharedFormula as string)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const masterV = masterCell?.value as any
      if (!masterV || typeof masterV !== 'object' || !('formula' in masterV)) {
        cell.value = sv.result ?? null
      }
    })
  })

  // Keep the template's wider columns, but grow any narrow data column enough
  // to show its header and largest monthly/daily number without truncation.
  for (const colIdx of uniqueCols) {
    const columnNumber = colIdx as number
    const headerText = ws.getRow(headerRowNum).getCell(columnNumber).text?.trim() ?? ''
    if (!headerText) continue
    let maxCharacters = headerText.length
    for (let rowNumber = headerRowNum + 1; rowNumber < dataStartRow + days.length; rowNumber++) {
      const value = ws.getRow(rowNumber).getCell(columnNumber).value
      let display = ''
      if (typeof value === 'number') display = value.toLocaleString('en-US', { maximumFractionDigits: 2 })
      else if (value instanceof Date) display = `${value.getMonth() + 1}月${value.getDate()}日`
      else if (typeof value === 'string') display = value
      maxCharacters = Math.max(maxCharacters, display.length)
    }
    const column = ws.getColumn(columnNumber)
    const requiredWidth = Math.min(Math.max(maxCharacters + 2, 8), 24)
    column.width = Math.max(column.width ?? 0, requiredWidth)
  }

  return { headerRowNum, dataStartRow }
}

function storeColumnCellStyle(cell: ExcelJS.Cell, style: Partial<ExcelJS.Style>): void {
  cell.style = JSON.parse(JSON.stringify(style)) as Partial<ExcelJS.Style>
}

/**
 * Builds a generated CK workbook (used when no template is uploaded).
 */
export function buildCKGeneratedWorkbook(
  monthNum: number,
  days: string[],
  dataMap: Record<string, CKDayData>,
  assignedStoreNames: string[],
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CK Accounting'
  const ws = wb.addWorksheet(`${monthNum}月食耗成本`, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  })

  const externalNames = [...new Set(
    Object.values(dataMap).flatMap(d => Object.keys(d.storeRevenues))
      .filter(name => !assignedStoreNames.includes(name))
  )]
  const allStoreNames = [...assignedStoreNames, ...externalNames]

  const headers = ['日期', '星期', ...allStoreNames, '營業額', '食材', '耗材', '雜項', '總支出']
  const headerRow = ws.addRow(headers)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD966' } }

  for (const date of days) {
    const d = dataMap[date]
    const dt = new Date(date + 'T00:00:00+08:00')
    const storeRevCols = allStoreNames.map(name => d?.storeRevenues[name] ?? null)
    ws.addRow([
      date,
      `星期${WEEKDAYS[dt.getDay()]}`,
      ...storeRevCols,
      d?.totalRevenue || null,
      d?.foodTotal || null,
      d?.packTotal || null,
      d?.miscTotal || null,
      d?.totalExpense || null,
    ])
  }

  ws.getColumn(1).width = 12
  ws.getColumn(2).width = 7
  for (let c = 3; c <= headers.length; c++) {
    ws.getColumn(c).width = Math.max(headers[c - 1].length * 1.8 + 2, 8)
  }

  return wb
}
