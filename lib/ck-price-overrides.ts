import type { CKPrice } from '@/lib/types'

export interface CKPriceOverrideRow {
  id: string
  central_kitchen_price_id: string
  store_id: string
  business_date: string
  unit_price: number
  reason?: string | null
}

/**
 * Applies only the overrides belonging to the requested store and business date.
 * Keeping this check here as well as in the database query prevents a caller from
 * accidentally leaking another store/date's exception into a closing.
 */
export function applyCKPriceOverrides(
  prices: CKPrice[],
  overrides: CKPriceOverrideRow[],
  storeId: string,
  businessDate: string,
): CKPrice[] {
  const applicable = new Map(
    overrides
      .filter(row => row.store_id === storeId && row.business_date === businessDate)
      .map(row => [row.central_kitchen_price_id, row] as const),
  )

  return prices.map(price => {
    const override = applicable.get(price.id)
    if (!override) return price
    const overridePrice = Number(override.unit_price)
    if (!Number.isFinite(overridePrice) || overridePrice < 0) return price

    return {
      ...price,
      default_unit_price: Number(price.unit_price),
      unit_price: overridePrice,
      daily_override: {
        id: override.id,
        business_date: override.business_date,
        unit_price: overridePrice,
        reason: override.reason ?? null,
      },
    }
  })
}
