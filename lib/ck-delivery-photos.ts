export function normalizeCKDeliveryPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((url): url is string => typeof url === 'string')
    .map(url => url.trim())
    .filter(Boolean))]
}

export function ckOrderNeedsDeliveryPhoto(
  amount: number | null | undefined,
  photoUrls: unknown,
): boolean {
  return Number(amount ?? 0) > 0 && normalizeCKDeliveryPhotoUrls(photoUrls).length === 0
}
