/**
 * Human-readable prefixes for new photo uploads.
 *
 * Existing URLs are intentionally left untouched because they are stored in
 * account records. These helpers only affect future uploads.
 */
export function storePhotoPath(
  storeId: string,
  businessDate: string,
  category: string,
  filename: string,
) {
  return `stores/${storeId}/${businessDate}/${category}/${filename}`
}

export function centralKitchenPhotoPath(
  ckStoreId: string,
  businessDate: string,
  category: string,
  filename: string,
) {
  return `central-kitchens/${ckStoreId}/${businessDate}/${category}/${filename}`
}

export function meetingReportPhotoPath(
  storeId: string,
  reportId: string,
  reportDate: string,
  section: string,
  filename: string,
) {
  return `meeting-reports/${storeId}/${reportDate}/${reportId}/${section}/${filename}`
}
