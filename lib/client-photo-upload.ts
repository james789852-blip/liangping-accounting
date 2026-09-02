'use client'

import { createSignedUploadUrl } from '@/app/actions/upload'
import { compressImage } from '@/lib/compress-image'
import { createClient } from '@/lib/supabase/client'

type PhotoBucket = 'receipts' | 'meeting-reports'

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
}

function photoContentType(file: File) {
  const normalized = file.type.toLowerCase().split(';', 1)[0].trim()
  if (Object.values(IMAGE_CONTENT_TYPES).includes(normalized)) return normalized
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_CONTENT_TYPES[extension] ?? null
}

function extensionForContentType(contentType: string) {
  if (contentType === 'image/jpeg') return 'jpg'
  return Object.entries(IMAGE_CONTENT_TYPES).find(([, type]) => type === contentType)?.[0] ?? 'jpg'
}

function replacePathExtension(path: string, extension: string) {
  const slashIndex = path.lastIndexOf('/')
  const dotIndex = path.lastIndexOf('.')
  return dotIndex > slashIndex ? `${path.slice(0, dotIndex)}.${extension}` : `${path}.${extension}`
}

/**
 * 跨瀏覽器照片上傳：先在裝置端壓縮，再用伺服器核發的單次網址直接傳到 Storage。
 * 大型照片不會穿過 Server Action；瀏覽器無法解碼 HEIC/HEIF 時則保留原檔直傳。
 */
export async function uploadClientPhoto({
  rawFile,
  bucket,
  path,
  maxBytes = 30 * 1024 * 1024,
}: {
  rawFile: File
  bucket: PhotoBucket
  path: string
  maxBytes?: number
}) {
  if (rawFile.size > maxBytes) {
    throw new Error(`照片檔案過大，請選擇 ${Math.floor(maxBytes / 1024 / 1024)}MB 以下的照片`)
  }

  const originalContentType = photoContentType(rawFile)
  if (!originalContentType) {
    throw new Error('只支援 JPG、PNG、WebP、HEIC 或 HEIF 圖片')
  }

  const compressed = await compressImage(rawFile)
  const contentType = photoContentType(compressed) ?? originalContentType
  const file = compressed.type === contentType
    ? compressed
    : new File([compressed], compressed.name, {
        type: contentType,
        lastModified: compressed.lastModified,
      })
  const uploadPath = replacePathExtension(path, extensionForContentType(contentType))

  let signed: Awaited<ReturnType<typeof createSignedUploadUrl>>
  try {
    signed = await createSignedUploadUrl(bucket, uploadPath)
  } catch {
    throw new Error('無法取得照片上傳授權，請重新整理後再試')
  }
  if ('error' in signed) throw new Error(signed.error)

  const supabase = createClient()
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(uploadPath, signed.token, file, { contentType })
  if (error) throw new Error(error.message || '照片傳送失敗，請檢查網路後再試')

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(uploadPath)
  return { publicUrl, file, path: uploadPath }
}
