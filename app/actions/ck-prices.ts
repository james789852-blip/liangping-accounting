'use server'

import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, revalidateTag } from 'next/cache'
import { canManageCKPrices } from '@/lib/user-permissions'
import { logAudit } from '@/lib/audit'

const ISO_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function isValidISODate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

async function requireCKPriceManager() {
  const supabase = await createClient()
  const user = await getVerifiedUser()
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
  const user = await getVerifiedUser()
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

export async function upsertCKPriceOverride(input: {
  storeId: string
  businessDate: string
  priceId: string
  unitPrice: number
  reason: string
}) {
  const auth = await requireCKPriceManager()
  if ('error' in auth) return { error: auth.error }

  const storeId = input.storeId.trim()
  const priceId = input.priceId.trim()
  const businessDate = input.businessDate.trim()
  const unitPrice = Number(input.unitPrice)
  const reason = input.reason.trim()

  if (!storeId) return { error: '請選擇店家' }
  if (!priceId) return { error: '請選擇央廚品項' }
  if (!isValidISODate(businessDate)) return { error: '請輸入有效的營業日期' }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return { error: '請輸入有效的特例單價' }
  if (!reason) return { error: '請填寫設定特例的原因' }

  const admin = createAdminClient()
  const [storeResult, priceResult] = await Promise.all([
    admin.from('stores').select('id, name, type, active').eq('id', storeId).maybeSingle(),
    admin.from('central_kitchen_prices').select('id, item_name, unit_price, active').eq('id', priceId).maybeSingle(),
  ])
  if (storeResult.error) return { error: storeResult.error.message }
  if (priceResult.error) return { error: priceResult.error.message }
  const store = storeResult.data
  const price = priceResult.data
  if (!store || store.type === '央廚' || !store.active) return { error: '找不到可使用的店家' }
  if (!price || !price.active) return { error: '找不到可使用的央廚品項' }

  const { data, error } = await admin
    .from('central_kitchen_price_overrides')
    .upsert({
      central_kitchen_price_id: priceId,
      store_id: storeId,
      business_date: businessDate,
      unit_price: unitPrice,
      reason,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'store_id,business_date,central_kitchen_price_id' })
    .select('*')
    .single()
  if (error) return { error: error.message }

  await logAudit({
    eventType: 'ck_price_override_update',
    storeId,
    userId: auth.user.id,
    description: `設定央廚單日特例：${store.name} ${businessDate} ${price.item_name} $${unitPrice}`,
    metadata: {
      business_date: businessDate,
      item_name: price.item_name,
      default_price: Number(price.unit_price),
      override_price: unitPrice,
      reason,
    },
  })

  revalidatePath('/hq/ck-prices')
  revalidatePath('/manager/closing')
  revalidatePath('/manager/edit/[id]', 'page')
  return { success: true as const, override: data }
}

export async function deleteCKPriceOverride(id: string) {
  const auth = await requireCKPriceManager()
  if ('error' in auth) return { error: auth.error }
  if (!id.trim()) return { error: '找不到要取消的單日特例' }

  const admin = createAdminClient()
  const { data: current, error: findError } = await admin
    .from('central_kitchen_price_overrides')
    .select('id, store_id, business_date, central_kitchen_price_id, unit_price, reason')
    .eq('id', id)
    .maybeSingle()
  if (findError) return { error: findError.message }
  if (!current) return { error: '找不到要取消的單日特例' }

  const [storeResult, priceResult] = await Promise.all([
    admin.from('stores').select('name').eq('id', current.store_id).maybeSingle(),
    admin.from('central_kitchen_prices').select('item_name, unit_price').eq('id', current.central_kitchen_price_id).maybeSingle(),
  ])
  const { error } = await admin.from('central_kitchen_price_overrides').delete().eq('id', id)
  if (error) return { error: error.message }

  const storeName = storeResult.data?.name ?? '未知店家'
  const itemName = priceResult.data?.item_name ?? '未知品項'
  await logAudit({
    eventType: 'ck_price_override_delete',
    storeId: current.store_id,
    userId: auth.user.id,
    description: `取消央廚單日特例：${storeName} ${current.business_date} ${itemName}`,
    metadata: {
      business_date: current.business_date,
      item_name: itemName,
      default_price: Number(priceResult.data?.unit_price ?? 0),
      deleted_override_price: Number(current.unit_price),
      reason: current.reason,
    },
  })

  revalidatePath('/hq/ck-prices')
  revalidatePath('/manager/closing')
  revalidatePath('/manager/edit/[id]', 'page')
  return { success: true as const }
}
