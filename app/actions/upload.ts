'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function uploadToStorage(
  formData: FormData,
  bucket: string,
  path: string
): Promise<{ publicUrl: string } | { error: string }> {
  const file = formData.get('file') as File | null
  if (!file) return { error: 'No file provided' }

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
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path)
  if (error) return { error: error.message }
  return { signedUrl: data.signedUrl, token: data.token }
}
