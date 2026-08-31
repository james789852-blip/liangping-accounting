function isSupabasePublicObjectUrl(src: string) {
  try {
    const url = new URL(src)
    return url.pathname.includes('/storage/v1/object/public/') || url.pathname.includes('/storage/v1/render/image/public/')
  } catch {
    return false
  }
}

export function supabaseResizedImageUrl(
  src: string,
  width: number,
  height: number,
  resize: 'cover' | 'contain',
  quality: number,
) {
  try {
    const url = new URL(src)
    if (url.pathname.includes('/storage/v1/object/public/')) {
      url.pathname = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
    } else if (!url.pathname.includes('/storage/v1/render/image/public/')) {
      return src
    }
    url.searchParams.set('width', String(width))
    url.searchParams.set('height', String(height))
    url.searchParams.set('resize', resize)
    url.searchParams.set('quality', String(quality))
    return url.toString()
  } catch {
    return src
  }
}

export function supabaseThumbUrl(src: string, width: number, height: number) {
  return supabaseResizedImageUrl(src, width, height, 'cover', 55)
}

export function supabasePreviewUrl(src: string, width = 1400, height = 1800) {
  return supabaseResizedImageUrl(src, width, height, 'contain', 72)
}

export function fallbackPhotoUrl(src: string) {
  return isSupabasePublicObjectUrl(src)
    ? supabaseResizedImageUrl(src, 1600, 1600, 'contain', 78)
    : src
}
