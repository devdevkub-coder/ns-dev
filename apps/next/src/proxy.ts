import { createServerClient } from '@supabase/ssr'
import type { Session } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { permissionCodesForPath } from '@/lib/navigation'
import { applyAuthResponseHeaders } from '@/lib/proxy-auth-headers'

const publicPaths = new Set(['/login', '/forgot-password', '/reset-password', '/api/auth/forgot-password', '/api/health', '/api/line/webhook'])

function isPublicPath(pathname: string) {
  return publicPaths.has(pathname) || pathname.startsWith('/_next') || pathname.startsWith('/favicon')
}

function loginRedirect(request: NextRequest) {
  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = '/login'
  redirectUrl.searchParams.set('redirect', `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(redirectUrl)
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function authErrorResponse(source: NextResponse, target: NextResponse) {
  applyAuthResponseHeaders(source.headers, target.headers)
  return target
}

function hasUsableSession(session: Session | null) {
  if (!session?.user) return false
  return session.expires_at == null || session.expires_at > Math.floor(Date.now() / 1000)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  let response = NextResponse.next()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return authErrorResponse(response, pathname.startsWith('/api/') ? jsonError('Supabase Auth is not configured.', 500) : loginRedirect(request))
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response.cookies.set(name, value, options)
        })
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  const {
    data: { user: verifiedUser },
    error: authError,
  } = await supabase.auth.getUser()

  // Supabase Auth can temporarily fail while the browser still has a valid,
  // non-expired session cookie. Keep the request usable in that case; the
  // session expiry is still enforced and a missing/expired session is denied.
  let user = verifiedUser
  if (authError && !user) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (hasUsableSession(session)) user = session?.user ?? null
  }

  if (authError && !user) {
    return authErrorResponse(response, pathname.startsWith('/api/')
      ? jsonError('ตรวจสอบ session ไม่สำเร็จ', 401)
      : loginRedirect(request))
  }

  if (!user) {
    return authErrorResponse(response, pathname.startsWith('/api/') ? jsonError('กรุณาเข้าสู่ระบบ', 401) : loginRedirect(request))
  }

  const { data: appUserAccessRows, error: appUserError } = await supabase.rpc('current_app_user_access_context')

  if (appUserError) {
    return authErrorResponse(response, pathname.startsWith('/api/')
      ? jsonError('ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ', 500)
      : new NextResponse('ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ', { status: 500 }))
  }

  if (!Array.isArray(appUserAccessRows)) {
    return authErrorResponse(response, pathname.startsWith('/api/')
      ? jsonError('รูปแบบข้อมูลบัญชีผู้ใช้งานไม่ถูกต้อง', 500)
      : new NextResponse('รูปแบบข้อมูลบัญชีผู้ใช้งานไม่ถูกต้อง', { status: 500 }))
  }

  const currentAppUser = appUserAccessRows[0] as {
    app_user_id: number
  } | undefined

  const requiredPermissions = permissionCodesForPath(pathname)

  if (requiredPermissions.length > 0) {
    const permissionResults = await Promise.all(requiredPermissions.map((permissionCode) => supabase.rpc('has_app_permission', {
      _permission_code: permissionCode,
    })))
    const permissionError = permissionResults.find((result) => result.error)?.error
    const hasPermission = permissionResults.some((result) => result.data === true)

    if (permissionError) {
      return authErrorResponse(response, pathname.startsWith('/api/')
        ? jsonError('ตรวจสอบสิทธิ์ไม่สำเร็จ', 500)
        : new NextResponse('ตรวจสอบสิทธิ์ไม่สำเร็จ', { status: 500 }))
    }

    if (hasPermission === true) {
      return response
    }
  } else {
    if (currentAppUser?.app_user_id != null) {
      return response
    }
  }

  const message = requiredPermissions.length > 0 ? 'ไม่มีสิทธิ์ใช้งานส่วนนี้' : 'ต้องใช้บัญชีที่เปิดใช้งาน'
  return authErrorResponse(response, pathname.startsWith('/api/') ? jsonError(message, 403) : NextResponse.redirect(new URL('/login', request.url)))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)'],
}
