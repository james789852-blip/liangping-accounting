import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'excel-templates'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ckStoreId: string }> }) {
  const { ckStoreId } = await params
  const admin = createAdminClient()
  const { data } = await admin.storage.from(BUCKET).list('', { search: `ck-${ckStoreId}.xlsx` })
  return NextResponse.json({ hasTemplate: (data?.length ?? 0) > 0 })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ ckStoreId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { ckStoreId } = await params
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '未提供檔案' }, { status: 400 })

  const admin = createAdminClient()
  const bytes = await file.arrayBuffer()
  const { error } = await admin.storage.from(BUCKET)
    .upload(`ck-${ckStoreId}.xlsx`, bytes, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
