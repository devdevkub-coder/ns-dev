import 'server-only'

import { NextResponse } from 'next/server'

export const authNoStoreHeaders = Object.freeze({
  'Cache-Control': 'private, no-store',
})

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
