export type TrackingStatus = 'open' | 'resolved'

export function trackingStatusForProgress(progressPercent: number): TrackingStatus {
  return progressPercent === 100 ? 'resolved' : 'open'
}

export function progressForTrackingStatus(status: TrackingStatus, currentProgress: number) {
  if (status === 'resolved') return 100
  return currentProgress >= 100 ? 95 : currentProgress
}

export function isProgressConfirmedForReport(details: unknown, reportId: string) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return false
  return (details as Record<string, unknown>).progress_confirmed_report_id === reportId
}
