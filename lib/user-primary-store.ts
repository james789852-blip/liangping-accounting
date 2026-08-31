type StoreAssignment = {
  primary_store_id?: string | null
  store_ids?: string[] | null
}

export function resolvePrimaryStoreId(
  assignment: StoreAssignment,
  allowedStoreIds?: readonly string[],
): string | null {
  const allowed = allowedStoreIds ? new Set(allowedStoreIds) : null
  const explicitPrimary = assignment.primary_store_id?.trim()
  if (explicitPrimary && (!allowed || allowed.has(explicitPrimary))) return explicitPrimary

  const assignedStores = [...new Set((assignment.store_ids ?? []).filter(id => id && (!allowed || allowed.has(id))))]
  return assignedStores.length === 1 ? assignedStores[0] : null
}
