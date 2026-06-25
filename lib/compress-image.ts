/**
 * 客戶端圖片壓縮（純 Canvas，不依賴第三方 package）
 *
 * 預設策略：
 *   - 最大邊長 1920px
 *   - JPEG 80% quality
 *   - 原圖 < 200 KB 不處理（已經夠小）
 *   - 壓後反而比原檔大則回傳原檔（保護機制）
 *   - 非圖片 / SVG / GIF 直接回傳原檔
 *
 * 收據照片用：3 MB → 約 200~400 KB（壓 90%），文字仍可讀
 */
export interface CompressOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  /** 原檔小於此大小就不壓（位元組） */
  skipBelowBytes?: number
}

export async function compressImage(
  file: File,
  opts: CompressOptions = {}
): Promise<File> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.8,
    skipBelowBytes = 200_000,
  } = opts

  if (!file.type.startsWith('image/')) return file
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file
  if (file.size < skipBelowBytes) return file
  if (typeof document === 'undefined') return file // SSR safety

  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const { width, height } = scaleToFit(img.naturalWidth, img.naturalHeight, maxWidth, maxHeight)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (!blob || blob.size >= file.size) return file
    const newName = file.name.replace(/\.\w+$/, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

function scaleToFit(w: number, h: number, maxW: number, maxH: number) {
  if (w <= maxW && h <= maxH) return { width: w, height: h }
  const ratio = Math.min(maxW / w, maxH / h)
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) }
}
