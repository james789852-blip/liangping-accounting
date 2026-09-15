import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function isSupabaseAuthCookie(name: string) {
  return name.startsWith('sb-') && name.includes('-auth-token')
}

function expireBrokenAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (!isSupabaseAuthCookie(cookie.name)) continue

    request.cookies.set(cookie.name, '')
    response.cookies.set(cookie.name, '', {
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
    })
  }
}

/**
 * 在頁面開始 render 前更新 Supabase session，並把新 cookie 同時寫回
 * request 與 response。這可避免多個 Server Component 同時使用同一個
 * 單次 refresh token，造成整頁 render 失敗。
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  let hasValidClaims = false

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  try {
    const { data, error } = await supabase.auth.getClaims()
    hasValidClaims = !error && Boolean(data?.claims?.sub)
  } catch (error) {
    // 已失效或找不到的 refresh token 不應讓整個 App Router 崩潰。
    // refresh_token_already_used 可能是平行請求競爭，因此不在這裡清除：
    // 另一個成功的 response 仍可能正在把新 token 寫回瀏覽器。
    const code = typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : ''
    if (code !== 'refresh_token_already_used') {
      expireBrokenAuthCookies(request, response)
    }
  }

  const isProtectedPage = request.nextUrl.pathname.startsWith('/manager')
    || request.nextUrl.pathname.startsWith('/hq')
  const isPageNavigation = request.method === 'GET' || request.method === 'HEAD'

  if (isProtectedPage && isPageNavigation && !hasValidClaims) {
    // 在 RSC / Suspense 開始 render 前完成導向，避免 client-side navigation
    // 收到串流中的 NEXT_REDIRECT 後產生 React hooks 錯序與黑色錯誤頁。
    const redirectResponse = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie))
    return redirectResponse
  }

  return response
}
