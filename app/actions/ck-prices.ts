'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, revalidateTag } from 'next/cache'
import { canManageCKPrices } from '@/lib/user-permissions'

async function requireCKPriceManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!profile || !canManageCKPrices(profile)) return { error: '權限不足，請先開啟「可管理央廚單價」權限' as const }
  return { user, profile }
}

export async function createCKPrice(itemName: string, unit: string, unitPrice: number) {
  const auth = await requireCKPriceManager()
  if ('error' in auth) return { error: auth.error }
  const name = itemName.trim()
  const cleanUnit = unit.trim() || '份'
  if (!name) return { error: '請輸入品項名稱' }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return { error: '請輸入有效的單價' }

  const admin = createAdminClient()
  const { data: existing } = await admin.from('central_kitchen_prices')
    .select('id, active').eq('item_name', name).maybeSingle()
  if (existing?.active) return { error: `品項「${name}」已存在` }

  const { data: maxRow } = await admin.from('central_kitchen_prices')
    .select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const payload = {
    item_name: name,
    unit: cleanUnit,
    unit_price: unitPrice,
    excel_column: name,
    active: true,
    sort_order: Number(maxRow?.sort_order ?? 0) + 10,
    updated_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = existing
    ? await admin.from('central_kitchen_prices').update(payload).eq('id', existing.id).select('*').single()
    : await admin.from('central_kitchen_prices').insert(payload).select('*').single()
  if (error) return { error: error.message }

  await admin.from('central_kitchen_price_history').insert({
    item_name: name, old_price: null, new_price: unitPrice,
    changed_by: auth.user.id, reason: '新增央廚配送品項',
  })
  await admin.from('audit_logs').insert({
    event_type: 'ck_price_created', severity: 'info', user_id: auth.user.id,
    description: `新增央廚配送品項：${name} $${unitPrice}/${cleanUnit}`,
    metadata: { item_name: name, unit: cleanUnit, unit_price: unitPrice },
  })
  revalidatePath('/hq/ck-prices')
  revalidatePath('/manager/closing')
  revalidatePath('/manager', 'layout')
  revalidateTag('ck-prices', 'default')
  return { success: true as const, item: data }
}

export async function updateCKPrice(id: string, newPrice: number, reason: string, unit?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()

  if (!profile || !canManageCKPrices(profile)) {
    return { error: '權限不足，請先開啟「可管理央廚單價」權限' }
  }

  // 取得目前單價
  const { data: current } = await supabase
    .from('central_kitchen_prices').select('item_name, unit_price').eq('id', id).single()

  if (!current) return { error: '找不到該品項' }

  // 更新單價（含單位）
  const updatePayload: Record<string, any> = { unit_price: newPrice, updated_by: user.id, updated_at: new Date().toISOString() }
  if (unit !== undefined) updatePayload.unit = unit
  const { error } = await supabase
    .from('central_kitchen_prices')
    .update(updatePayload)
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
  revalidateTag('ck-prices', 'default')  // 失效 getCachedActiveCKPrices
  return { success: true }
}
