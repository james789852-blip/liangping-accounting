import assert from 'node:assert/strict'
import test from 'node:test'

import { getExcelPlatformColumns } from '../lib/excel-platform-order.ts'

test('鑫耀鑫 Excel 將 Uber 帳號放在 D 欄、TWPAY 放在 E 欄', () => {
  assert.deepEqual(
    getExcelPlatformColumns('鑫耀鑫', true, ['鑫耀鑫']),
    [
      { key: 'uber:鑫耀鑫', label: '鑫耀鑫' },
      { key: 'twpay', label: 'TWPAY' },
    ],
  )
})

test('其他店家維持 TWPAY 在 Uber 帳號前', () => {
  assert.deepEqual(
    getExcelPlatformColumns('景新', true, ['景新']),
    [
      { key: 'twpay', label: 'TWPAY' },
      { key: 'uber:景新', label: '景新' },
    ],
  )
})
