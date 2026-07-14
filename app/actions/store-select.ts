'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function setManagerStore(storeId: string) {
  const cookieStore = await cookies()
  cookieStore.set('hq_viewing_store', storeId, {
    maxAge: 60 * 60 * 24,
    path: '/',
  })
  // 店長端可切換到被授權的其他店家；與總公司切店 cookie 分開，
  // 避免舊的總公司檢視狀態把店長端主店帶偏。
  cookieStore.set('manager_viewing_store', storeId, {
    maxAge: 60 * 60 * 24,
    path: '/',
  })
  revalidatePath('/manager', 'layout')
  revalidatePath('/hq', 'layout')
}
