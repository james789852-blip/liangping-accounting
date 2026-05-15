'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateCKPrice(id: string, newPrice: number, reason: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('user_id', user.id).single()

  if (!profile || !['經理', '總監'].includes(profile.role)) {
    return { error: '權限不足，僅限經理以上操作' }
  }

  // 取得目前單價
  const { data: current } = await supabase
    .from('central_kitchen_prices').select('item_name, unit_price').eq('id', id).single()

  if (!current) return { error: '找不到該品項' }

  // 更新單價
  const { error } = await supabase
    .from('central_kitchen_prices')
    .update({ unit_price: newPrice, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  // 寫入異動紀錄
  await supabase.from('central_kitchen_price_history').insert({
    item_name: current.item_name,
    old_price: current.unit_price,
    new_price: newPrice,
    changed_by: user.id,
    reason: reason || '管理員更新',
  })

  // 寫入稽核日誌
  await supabase.from('audit_logs').insert({
    event_type: 'ck_price_updated',
    severity: 'info',
    user_id: user.id,
    description: `央廚單價更新：${current.item_name} ${current.unit_price} → ${newPrice}`,
    metadata: { item_name: current.item_name, old_price: current.unit_price, new_price: newPrice },
  })

  revalidatePath('/hq/settings')
  revalidatePath('/manager/closing')
  revalidatePath('/manager', 'layout')
  return { success: true }
}
