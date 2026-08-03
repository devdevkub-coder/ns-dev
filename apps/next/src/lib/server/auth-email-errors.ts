type SupabaseErrorLike = {
  message?: unknown
  status?: unknown
}

export type AuthEmailLimitDetails = {
  code: 'AUTH_EMAIL_USER_COOLDOWN' | 'AUTH_EMAIL_PROJECT_LIMIT' | 'AUTH_EMAIL_PROVIDER_ERROR'
  error: string
  limitScope: 'user' | 'project' | 'provider'
  retryAfterSeconds: number | null
}

function readError(error: unknown): SupabaseErrorLike {
  return error && typeof error === 'object' ? error as SupabaseErrorLike : {}
}

export function describeAuthEmailError(error: unknown): AuthEmailLimitDetails {
  const { message, status } = readError(error)
  const normalized = typeof message === 'string' ? message.toLowerCase() : ''
  const numericStatus = typeof status === 'number' ? status : null

  if (normalized.includes('once every 60 seconds') || normalized.includes('rate limit') && normalized.includes('60')) {
    return {
      code: 'AUTH_EMAIL_USER_COOLDOWN',
      error: 'ส่งลิงก์ไม่ได้: อีเมลนี้เพิ่งขอไปแล้ว ระบบจำกัด 1 ครั้งต่อ 60 วินาที กรุณารอประมาณ 60 วินาทีแล้วลองใหม่',
      limitScope: 'user',
      retryAfterSeconds: 60,
    }
  }

  if (normalized.includes('email rate limit exceeded') || normalized.includes('rate limit exceeded') || numericStatus === 429) {
    return {
      code: 'AUTH_EMAIL_PROJECT_LIMIT',
      error: 'ส่งลิงก์ไม่ได้: โควตาอีเมลของ Supabase เต็ม (ผู้ให้บริการเริ่มต้นส่งได้ประมาณ 2 ฉบับต่อชั่วโมงทั้งโปรเจกต์) กรุณารอประมาณ 1 ชั่วโมงแล้วลองใหม่',
      limitScope: 'project',
      retryAfterSeconds: 3600,
    }
  }

  return {
    code: 'AUTH_EMAIL_PROVIDER_ERROR',
    error: 'ส่งลิงก์ไม่ได้: ผู้ให้บริการอีเมลปฏิเสธคำขอ กรุณาลองใหม่ภายหลังหรือตรวจสอบการตั้งค่า SMTP',
    limitScope: 'provider',
    retryAfterSeconds: null,
  }
}

export function authEmailErrorResponse(error: unknown) {
  const details = describeAuthEmailError(error)
  const headers = new Headers()
  if (details.retryAfterSeconds) headers.set('Retry-After', String(details.retryAfterSeconds))

  return {
    body: {
      code: details.code,
      error: details.error,
      limitScope: details.limitScope,
      retryAfterSeconds: details.retryAfterSeconds,
    },
    headers,
    status: details.retryAfterSeconds ? 429 : 502,
  }
}
