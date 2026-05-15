import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClosingForm from '@/components/manager/closing-form'
import { Store, CKPrice } from '@/lib/types'
import { format } from 'date-fns'
import { getEffectiveStoreId } from '@/lib/get-effective-store'

export default async function ClosingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('name, role, store_ids')
    .eq('user_id', user.id)
    .single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) {
    return (
      <div className="p-6">
        <p className="text-red-500">您尚未被指派到任何店家，請聯絡系統管理員。</p>
      </div>
    )
  }

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('id', storeId)
    .single()

  const { data: ckPrices } = await supabase
    .from('central_kitchen_prices')
    .select('id, item_name, unit_price, excel_column')
    .eq('active', true)
    .order('item_name')

  const today = format(new Date(), 'yyyy-MM-dd')

  const { data: existingClosing } = await supabase
    .from('daily_closings')
    .select('*, revenue_items(*), cash_counts(*), order_items(*), expense_items(*)')
    .eq('store_id', storeId)
    .eq('business_date', today)
    .maybeSingle()

  return (
    <ClosingForm
      store={store as Store}
      ckPrices={(ckPrices ?? []) as CKPrice[]}
      existingClosing={existingClosing}
      userId={user.id}
      today={today}
    />
  )
}
