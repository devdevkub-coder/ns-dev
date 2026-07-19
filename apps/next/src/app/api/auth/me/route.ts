import { authContextErrorResponse, getCurrentAuthContext, serializeAuthContext } from '@/lib/server/auth-context'
import { authJson, withAuthNoStore } from '@/lib/server/auth-response'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    return authJson(serializeAuthContext(context))
  } catch (caught) {
    return withAuthNoStore(authContextErrorResponse(caught))
  }
}
