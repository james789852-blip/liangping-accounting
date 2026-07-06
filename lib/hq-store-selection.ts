import { cookies } from 'next/headers'

interface StoreLike { id: string }

export async function resolveHQStoreId<T extends StoreLike>(
  stores: T[],
  requestedStoreId?: string | null,
) {
  if (requestedStoreId && stores.some(s => s.id === requestedStoreId)) {
    return requestedStoreId
  }

  const cookieStore = await cookies()
  const cookieStoreId = cookieStore.get('hq_viewing_store')?.value
  if (cookieStoreId && stores.some(s => s.id === cookieStoreId)) {
    return cookieStoreId
  }

  return stores[0]?.id ?? ''
}
