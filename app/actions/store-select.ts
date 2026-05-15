'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function setManagerStore(storeId: string) {
  const cookieStore = await cookies()
  cookieStore.set('hq_viewing_store', storeId, {
    maxAge: 60 * 60 * 24,
    path: '/',
  })
  revalidatePath('/manager', 'layout')
}
