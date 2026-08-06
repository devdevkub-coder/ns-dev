import 'server-only'

import { NextResponse } from 'next/server'
import { authNoStoreHeaders } from '@/lib/auth-response-headers'

export { authNoStoreHeaders }

export function authJson<T>(body: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', authNoStoreHeaders['Cache-Control'])
  return NextResponse.json(body, { ...init, headers })
}

export function withAuthNoStore(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', authNoStoreHeaders['Cache-Control'])
  return new NextResponse(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
