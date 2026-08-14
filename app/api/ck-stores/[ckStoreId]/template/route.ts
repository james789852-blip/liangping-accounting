import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { canManageCKItems } from '@/lib/user-permissions'
import { isAllowedExcelFile, isUuid } from '@/lib/upload-security'

const BUCKET = 'excel-templates'
const MAX_TEMPLATE_BYTES = 15 * 1024 * 1024

async function authorizeCKTemplate(ckStoreId: string) {
  if (!isUuid(ckStoreId)) return { error: '央廚編號格式錯誤', status: 400 }

  const user = await getVerifiedUser()
  if (!user) return { error: '未登入', status: 401 }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!canManageCKItems(profile)) return { error: '權限不足，未開啟央廚品項管理權限', status: 403 }

  const admin = createAdminClient()
  const { data: store } = await admin.from('stores').select('id, type').eq('id', ckStoreId).maybeSingle()
  if (!store) return { error: '找不到央廚', status: 404 }
  if (store.type !== '央廚') return { error: '此端點只允許央廚 Excel 模板', status: 400 }

  return { admin }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ckStoreId: string }> }) {
  const { ckStoreId } = await params
  const auth = await authorizeCKTemplate(ckStoreId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin } = auth
  const { data } = await admin.storage.from(BUCKET).list('', { search: `ck-${ckStoreId}.xlsx` })
  return NextResponse.json({ hasTemplate: (data?.length ?? 0) > 0 })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ ckStoreId: string }> }) {
  const { ckStoreId } = await params
  const auth = await authorizeCKTemplate(ckStoreId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin } = auth

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '未提供檔案' }, { status: 400 })
  if (file.size > MAX_TEMPLATE_BYTES) return NextResponse.json({ error: 'Excel 檔案過大（上限 15MB）' }, { status: 413 })
  if (!isAllowedExcelFile(file.name, file.type)) {
    return NextResponse.json({ error: '只允許上傳 .xlsx Excel 檔案' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const { error } = await admin.storage.from(BUCKET)
    .upload(`ck-${ckStoreId}.xlsx`, bytes, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
