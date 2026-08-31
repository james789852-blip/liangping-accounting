import assert from 'node:assert/strict'
import test from 'node:test'

import {
  googleReviewAggregate,
  normalizeGoogleReviewEntries,
} from '../lib/meeting-google-reviews.ts'

test('Google reviews are normalized as individual entries', () => {
  assert.deepEqual(normalizeGoogleReviewEntries([
    { id: 'r1', rating: 5, comment: '服務很好', explanation: '持續維持', photos: ['https://example.com/1.jpg'] },
    { rating: '7', comment: '餐點偏慢' },
  ]), [
    { id: 'r1', rating: 5, comment: '服務很好', explanation: '持續維持', photos: ['https://example.com/1.jpg'] },
    { id: 'review-2', rating: 5, comment: '餐點偏慢', explanation: '', photos: [] },
  ])
})

test('review count, average rating and legacy summary are derived from entries', () => {
  assert.deepEqual(googleReviewAggregate([
    { id: 'r1', rating: 5, comment: '服務很好', explanation: '持續維持', photos: [] },
    { id: 'r2', rating: 3, comment: '餐點偏慢', explanation: '尖峰時段增加備餐人力', photos: [] },
  ]), {
    newReviews: 2,
    averageRating: 4,
    summary: '服務很好\n店家說明：持續維持\n\n餐點偏慢\n店家說明：尖峰時段增加備餐人力',
  })
})
