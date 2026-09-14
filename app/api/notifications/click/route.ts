import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const user = await getVerifiedUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null) as { notificationId?: unknown } | null
  const notificationId = typeof body?.notificationId === 'string' ? body.notificationId : ''
  if (!notificationId) return Response.json({ error: 'Invalid notification' }, { status: 400 })
  const now = new Date().toISOString()
  const admin = createAdminClient()
  const { error } = await admin.from('app_notifications').update({
    read_at: now,
    clicked_at: now,
    updated_at: now,
  }).eq('id', notificationId).eq('user_id', user.id)
  return error
    ? Response.json({ error: 'Update failed' }, { status: 500 })
    : Response.json({ success: true })
}
