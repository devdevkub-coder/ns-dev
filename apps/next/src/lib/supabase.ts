import { createBrowserClient } from '@supabase/ssr'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

function isInvalidRefreshTokenMessage(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('invalid refresh token')
    || normalized.includes('refresh token not found')
    || normalized.includes('refresh token is invalid')
}

export function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  client ??= createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return client
}

export async function getSessionSafely(supabase: SupabaseClient): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()

  if (!error) {
    return data.session
  }

  if (isInvalidRefreshTokenMessage(error.message)) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    return null
  }

  throw error
}
