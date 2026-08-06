import 'server-only'

import { NextResponse } from 'next/server'
import { authNoStoreHeaders } from '@/lib/auth-response-headers'

export { authNoStoreHeaders }

export function authJson<T>(body: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  Object.entries(authNoStoreHeaders).forEach(([name, value]) => headers.set(name, value))
  return NextResponse.json(body, { ...init, headers })
}

export function withAuthNoStore(response: Response) {
  const headers = new Headers(response.headers)
  Object.entries(authNoStoreHeaders).forEach(([name, value]) => headers.set(name, value))
  return new NextResponse(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
