import assert from 'node:assert/strict'
import test from 'node:test'

import {
  complaintAggregate,
  normalizeComplaintEntries,
} from '../lib/meeting-complaints.ts'

test('complaints are normalized as individual entries with their own photos', () => {
  assert.deepEqual(normalizeComplaintEntries([
    { id: 'c1', category: '餐點', description: '餐點冷掉', resolution: '重新製作', photos: ['https://example.com/1.jpg', 123] },
    { description: '等待過久' },
  ]), [
    { id: 'c1', category: '餐點', description: '餐點冷掉', resolution: '重新製作', photos: ['https://example.com/1.jpg'] },
    { id: 'complaint-2', category: '', description: '等待過久', resolution: '', photos: [] },
  ])
})

test('complaint count and legacy summary fields are derived from entries', () => {
  assert.deepEqual(complaintAggregate([
    { id: 'c1', category: '餐點', description: '餐點冷掉', resolution: '重新製作', photos: [] },
    { id: 'c2', category: '服務', description: '等待過久', resolution: '加強教育', photos: [] },
    { id: 'c3', category: '餐點', description: '', resolution: '', photos: [] },
  ]), {
    count: 3,
    category: '餐點、服務',
    description: '餐點冷掉\n\n等待過久',
    resolution: '重新製作\n\n加強教育',
  })
})
