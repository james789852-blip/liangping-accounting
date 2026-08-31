import assert from 'node:assert/strict'
import test from 'node:test'

import {
  progressForTrackingStatus,
  isProgressConfirmedForReport,
  trackingStatusForProgress,
} from '../lib/meeting-action-progress.ts'

test('100 percent completes an action and any lower value keeps it open', () => {
  assert.equal(trackingStatusForProgress(100), 'resolved')
  assert.equal(trackingStatusForProgress(95), 'open')
  assert.equal(trackingStatusForProgress(0), 'open')
})

test('progress must be explicitly confirmed for the current report', () => {
  assert.equal(isProgressConfirmedForReport({ progress_confirmed_report_id: 'report-2' }, 'report-2'), true)
  assert.equal(isProgressConfirmedForReport({ progress_confirmed_report_id: 'report-1' }, 'report-2'), false)
  assert.equal(isProgressConfirmedForReport(null, 'report-2'), false)
})

test('status selection keeps progress and completion synchronized', () => {
  assert.equal(progressForTrackingStatus('resolved', 35), 100)
  assert.equal(progressForTrackingStatus('open', 100), 95)
  assert.equal(progressForTrackingStatus('open', 60), 60)
})
