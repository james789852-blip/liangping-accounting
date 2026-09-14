import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { reserveSubmissionError } from '../lib/reserve-validation.ts'

const closingForm = fs.readFileSync(new URL('../components/manager/closing-form.tsx', import.meta.url), 'utf8')
const closingsAction = fs.readFileSync(new URL('../app/actions/closings.ts', import.meta.url), 'utf8')

test('第一天建立預留款必須填寫帳單總金額', () => {
  assert.equal(
    reserveSubmissionError([{ reason: '營業稅', amount: 38_920 }]),
    '預留款「營業稅」尚未填寫帳單總金額',
  )
  assert.equal(
    reserveSubmissionError([{ reason: '營業稅', amount: 38_920, total_bill: 90_486 }]),
    null,
  )
})

test('預留金額不可超過帳單總金額', () => {
  assert.equal(
    reserveSubmissionError([{ reason: '房租', amount: 50_000, total_bill: 40_000 }]),
    '預留款「房租」的今日金額不能超過帳單總金額',
  )
})

test('前端確認與伺服器送出都會攔截缺少帳單總金額', () => {
  assert.match(closingForm, /帳單總金額 <span[\s\S]*第一天必填，後續預留會自動沿用/)
  assert.match(closingForm, /if \(totalBill <= 0\)[\s\S]*請輸入帳單總金額/)
  assert.match(closingsAction, /reserveSubmissionError\(reserves\)/)
})
