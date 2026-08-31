export interface ComplaintEntry {
  id: string
  category: string
  description: string
  resolution: string
  photos: string[]
}

export function normalizeComplaintEntries(value: unknown): ComplaintEntry[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry, index) => {
      const record = entry as Record<string, unknown>
      return {
        id: typeof record.id === 'string' && record.id.trim() ? record.id : `complaint-${index + 1}`,
        category: typeof record.category === 'string' ? record.category : '',
        description: typeof record.description === 'string' ? record.description : '',
        resolution: typeof record.resolution === 'string' ? record.resolution : '',
        photos: Array.isArray(record.photos)
          ? record.photos.filter((photo): photo is string => typeof photo === 'string' && photo.length > 0)
          : [],
      }
    })
}

export function complaintAggregate(complaints: ComplaintEntry[]) {
  const categories = [...new Set(complaints.map(item => item.category.trim()).filter(Boolean))]
  return {
    count: complaints.length,
    category: categories.join('、'),
    description: complaints.map(item => item.description.trim()).filter(Boolean).join('\n\n'),
    resolution: complaints.map(item => item.resolution.trim()).filter(Boolean).join('\n\n'),
  }
}
