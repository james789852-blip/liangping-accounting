export function isPushDeviceStale(lastSeenAt: string, staleDays = 7, now = new Date()) {
  return new Date(lastSeenAt).getTime() < now.getTime() - staleDays * 86400000
}
