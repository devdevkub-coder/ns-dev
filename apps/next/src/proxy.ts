import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { permissionForPath } from '@/lib/navigation'

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

function isPasswordChangeAllowedPath(pathname: string) {
  return pathname === '/admin/change-password' || pathname === '/api/auth/me' || pathname === '/api/auth/password-changed'
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
    return pathname.startsWith('/api/') ? jsonError('Supabase Auth is not configured.', 500) : loginRedirect(request)
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
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    return pathname.startsWith('/api/') ? jsonError('ตรวจสอบ session ไม่สำเร็จ', 401) : loginRedirect(request)
  }

  if (!user) {
    return pathname.startsWith('/api/') ? jsonError('กรุณาเข้าสู่ระบบ', 401) : loginRedirect(request)
  }

  const { data: appUserAccessRows, error: appUserError } = await supabase.rpc('current_app_user_access_context')

  if (appUserError) {
    return pathname.startsWith('/api/')
      ? jsonError('ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ', 500)
      : new NextResponse('ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ', { status: 500 })
  }

  if (!Array.isArray(appUserAccessRows)) {
    return pathname.startsWith('/api/')
      ? jsonError('รูปแบบข้อมูลบัญชีผู้ใช้งานไม่ถูกต้อง', 500)
      : new NextResponse('รูปแบบข้อมูลบัญชีผู้ใช้งานไม่ถูกต้อง', { status: 500 })
  }

  const currentAppUser = appUserAccessRows[0] as {
    app_user_id: number
    must_change_password: boolean
  } | undefined

  if (currentAppUser?.must_change_password === true && !isPasswordChangeAllowedPath(pathname)) {
    if (pathname.startsWith('/api/')) {
      return jsonError('ต้องเปลี่ยน password ก่อนใช้งาน', 403)
    }
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/admin/change-password'
    redirectUrl.searchParams.set('redirect', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(redirectUrl)
  }

  const requiredPermission = permissionForPath(pathname)

  if (requiredPermission) {
    const { data: hasPermission, error: permissionError } = await supabase.rpc('has_app_permission', {
      _permission_code: requiredPermission,
    })

    if (permissionError) {
      return pathname.startsWith('/api/')
        ? jsonError('ตรวจสอบสิทธิ์ไม่สำเร็จ', 500)
        : new NextResponse('ตรวจสอบสิทธิ์ไม่สำเร็จ', { status: 500 })
    }

    if (hasPermission === true) {
      return response
    }
  } else {
    if (currentAppUser?.app_user_id != null) {
      return response
    }
  }

  const message = requiredPermission ? 'ไม่มีสิทธิ์ใช้งานส่วนนี้' : 'ต้องใช้บัญชีที่เปิดใช้งาน'
  return pathname.startsWith('/api/') ? jsonError(message, 403) : NextResponse.redirect(new URL('/login', request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)'],
}
