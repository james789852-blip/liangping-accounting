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

export const normalizeCKTransferPhotoUrls = normalizeCKDeliveryPhotoUrls

export function ckOrderNeedsTransferPhoto(
  amount: number | null | undefined,
  transferPhotoRequired: boolean | null | undefined,
  photoUrls: unknown,
): boolean {
  return Boolean(transferPhotoRequired)
    && Number(amount ?? 0) > 0
    && normalizeCKTransferPhotoUrls(photoUrls).length === 0
}

export function memberDeliveryPhotosFromStoreClosings(
  closings: Array<{ store_id?: string | null; ck_delivery_photo_url?: string | null }>,
): Record<string, string[]> {
  const photosByStore: Record<string, string[]> = {}
  for (const closing of closings) {
    const storeId = closing.store_id?.trim()
    const photoUrl = closing.ck_delivery_photo_url?.trim()
    if (!storeId || !photoUrl) continue
    const current = photosByStore[storeId] ?? []
    if (!current.includes(photoUrl)) current.push(photoUrl)
    photosByStore[storeId] = current
  }
  return photosByStore
}
