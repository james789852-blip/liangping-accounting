import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_PUSH_SCHEDULE_SETTINGS,
  formatReminderDelay,
  isPushScheduleDue,
  normalizePushScheduleSettings,
  validatePushScheduleSettings,
} from '../lib/push-schedule.ts'

test('推播時間預設值維持目前營運設定', () => {
  assert.deepEqual(DEFAULT_PUSH_SCHEDULE_SETTINGS, {
    accountingFirstTime: '23:00',
    accountingFinalTime: '23:30',
    ckHandoffTime: '17:00',
    returnedReminderMinutes: 60,
  })
})

test('資料庫時間含秒數時會整理成管理頁可使用的格式', () => {
  assert.deepEqual(normalizePushScheduleSettings({
    accounting_first_time: '22:45:00',
    accounting_final_time: '00:30:00',
    ck_handoff_time: '16:15:00',
    returned_reminder_minutes: 120,
  }), {
    accountingFirstTime: '22:45',
    accountingFinalTime: '00:30',
    ckHandoffTime: '16:15',
    returnedReminderMinutes: 120,
  })
})

test('第二次帳目提醒可跨午夜但必須在同一營業日順序較晚', () => {
  assert.deepEqual(validatePushScheduleSettings({
    accountingFirstTime: '23:00',
    accountingFinalTime: '00:30',
    ckHandoffTime: '17:00',
    returnedReminderMinutes: 60,
  }).error, undefined)

  assert.equal(validatePushScheduleSettings({
    accountingFirstTime: '23:30',
    accountingFinalTime: '23:00',
    ckHandoffTime: '17:00',
    returnedReminderMinutes: 60,
  }).error, '第二次未送出提醒必須晚於第一次提醒')
})

test('推播時間只能設定為五分鐘單位，退回提醒只能設定為十五分鐘單位', () => {
  assert.equal(validatePushScheduleSettings({
    accountingFirstTime: '23:02',
    accountingFinalTime: '23:30',
    ckHandoffTime: '17:00',
    returnedReminderMinutes: 60,
  }).error, '時間必須以 5 分鐘為單位')
  assert.equal(validatePushScheduleSettings({
    accountingFirstTime: '23:00',
    accountingFinalTime: '23:30',
    ckHandoffTime: '17:00',
    returnedReminderMinutes: 50,
  }).error, '退回提醒必須設定為 15～1440 分鐘，並以 15 分鐘為單位')
})

test('排程只會在台灣時間對應的五分鐘時段執行', () => {
  assert.equal(isPushScheduleDue('23:00', new Date('2026-09-15T15:02:00.000Z')), true)
  assert.equal(isPushScheduleDue('23:00', new Date('2026-09-15T15:05:00.000Z')), false)
  assert.equal(isPushScheduleDue('00:30', new Date('2026-09-15T16:34:00.000Z')), true)
  assert.equal(formatReminderDelay(90), '1 小時 30 分鐘')
})
