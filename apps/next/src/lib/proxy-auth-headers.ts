import { authNoStoreHeaders } from './auth-response-headers'

export function applyAuthResponseHeaders(source: Headers, target: Headers) {
  const sourceHeaders = source as Headers & { getSetCookie?: () => string[] }
  const setCookies = sourceHeaders.getSetCookie?.() ?? []

  if (setCookies.length > 0) {
    setCookies.forEach((value) => target.append('set-cookie', value))
  } else {
    const setCookie = source.get('set-cookie')
    if (setCookie) target.set('set-cookie', setCookie)
  }

  Object.entries(authNoStoreHeaders).forEach(([name, value]) => {
    target.set(name, value)
  })

  return target
}
