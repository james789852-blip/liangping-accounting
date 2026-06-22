'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthContext } from '@/lib/permissions'

// 允許上傳的 bucket 與最大檔案大小（位元組）
const ALLOWED_BUCKETS = new Set(['receipts', 'menu-videos', 'excel-templates', 'meeting-reports'])
const MAX_FILE_BYTES = 50 * 1024 * 1024  // 50 MB

function pathTraversalSafe(path: string): boolean {
  if (!path) return false
  if (path.includes('..') || path.startsWith('/')) return false
  if (path.length > 512) return false
  return true
}

export async function uploadToStorage(
  formData: FormData,
  bucket: string,
  path: string
): Promise<{ publicUrl: string } | { error: string }> {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!ALLOWED_BUCKETS.has(bucket)) return { error: '不允許的 bucket' }
  if (!pathTraversalSafe(path)) return { error: '路徑不合法' }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'No file provided' }
  if (file.size > MAX_FILE_BYTES) return { error: '檔案過大（上限 50MB）' }

  // excel-templates 只允許 HQ 上傳
  if (bucket === 'excel-templates' && !ctx.isHQ) return { error: '權限不足（僅總公司可上傳模板）' }

  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) return { error: error.message }

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
  return { publicUrl }
}

// 產生 signed upload URL，讓 client 直接上傳大檔案到 Storage（不經過 Next.js）
export async function createSignedUploadUrl(
  bucket: string,
  path: string
): Promise<{ signedUrl: string; token: string } | { error: string }> {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' }
  if (!ALLOWED_BUCKETS.has(bucket)) return { error: '不允許的 bucket' }
  if (!pathTraversalSafe(path)) return { error: '路徑不合法' }
  if (bucket === 'excel-templates' && !ctx.isHQ) return { error: '權限不足（僅總公司可上傳模板）' }

  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path)
  if (error) return { error: error.message }
  return { signedUrl: data.signedUrl, token: data.token }
}
