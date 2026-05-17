import { NextResponse } from 'next/server'
import { authContextErrorResponse, getCurrentAuthContext, serializeAuthContext } from '@/lib/server/auth-context'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    return NextResponse.json(serializeAuthContext(context))
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
