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
