import type { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaged } from '@/lib/supabase-paged'
import {
  isNegativeFromStatusEvents,
  ITEM_MAPPING_NEGATIVE_DISABLED_EVENT,
  ITEM_MAPPING_NEGATIVE_ENABLED_EVENT,
  mappingIdFromStatusEvent,
  type ItemMappingStatusEvent,
} from '@/lib/item-mapping-availability'

/** 取得店家目前設為自動負數的 mapping id；只讀設定，不碰歷史單據。 */
export async function getNegativeItemMappingIds(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
): Promise<Set<string>> {
  const events = await fetchAllPaged<ItemMappingStatusEvent>(() => admin
    .from('audit_logs')
    .select('event_type,created_at,metadata')
    .eq('store_id', storeId)
    .in('event_type', [ITEM_MAPPING_NEGATIVE_ENABLED_EVENT, ITEM_MAPPING_NEGATIVE_DISABLED_EVENT])
    .order('created_at'))

  const eventsByMapping = new Map<string, ItemMappingStatusEvent[]>()
  for (const event of events ?? []) {
    const mappingId = mappingIdFromStatusEvent(event)
    if (!mappingId) continue
    const mappingEvents = eventsByMapping.get(mappingId) ?? []
    mappingEvents.push(event)
    eventsByMapping.set(mappingId, mappingEvents)
  }

  return new Set([...eventsByMapping.entries()]
    .filter(([, mappingEvents]) => isNegativeFromStatusEvents(mappingEvents))
    .map(([mappingId]) => mappingId))
}
