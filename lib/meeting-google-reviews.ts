export interface GoogleReviewEntry {
  id: string
  rating: number | null
  comment: string
  explanation: string
  photos: string[]
}

export function normalizeGoogleReviewEntries(value: unknown): GoogleReviewEntry[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry, index) => {
      const record = entry as Record<string, unknown>
      const numericRating = record.rating === null || record.rating === ''
        ? null
        : Number(record.rating)
      return {
        id: typeof record.id === 'string' && record.id.trim() ? record.id : `review-${index + 1}`,
        rating: numericRating !== null && Number.isFinite(numericRating)
          ? Math.min(5, Math.max(1, numericRating))
          : null,
        comment: typeof record.comment === 'string' ? record.comment : '',
        explanation: typeof record.explanation === 'string' ? record.explanation : '',
        photos: Array.isArray(record.photos)
          ? record.photos.filter((photo): photo is string => typeof photo === 'string' && photo.length > 0)
          : [],
      }
    })
}

export function googleReviewAggregate(reviews: GoogleReviewEntry[]) {
  const ratings = reviews
    .map(review => review.rating)
    .filter((rating): rating is number => rating !== null && Number.isFinite(rating))
  const averageRating = ratings.length > 0
    ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
    : null
  const summary = reviews
    .map(review => [
      review.comment.trim(),
      review.explanation.trim() ? `店家說明：${review.explanation.trim()}` : '',
    ].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n')

  return {
    newReviews: reviews.length,
    averageRating,
    summary,
  }
}
