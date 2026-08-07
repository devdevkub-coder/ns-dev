export type LoginContractResult = { ok: true; lastLoginAt: string } | { ok: false; message: string }
export type PasswordChangedAcknowledgementResult = { ok: true } | { ok: false; message: string }

export const PASSWORD_CHANGE_ACKNOWLEDGEMENT_ERROR = 'บันทึกสถานะรหัสผ่านไม่สำเร็จ กรุณาลองใหม่'
export const PASSWORD_UPDATE_ERROR = 'เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่'

function loginContractErrorMessage(status: number | null) {
  if (status === 401) return 'Session เข้าสู่ระบบไม่ถูกต้อง กรุณาลองใหม่'
  return 'ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ กรุณาลองใหม่'
}

function isTransientLoginFailure(status: number | null) {
  return status == null || status === 429 || status >= 500
}

async function signOutLocal(signOut: () => Promise<unknown>) {
  await signOut().catch(() => undefined)
}

export async function completeBrowserLoginSession(input: {
  fetchImpl: typeof fetch
  signOut: () => Promise<unknown>
  expectedAuthUserId: string
}): Promise<LoginContractResult> {
  const fetchImpl = input.fetchImpl

  try {
    const response = await fetchImpl('/api/auth/login-complete', {
      cache: 'no-store',
      credentials: 'include',
      method: 'POST',
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok || !payload || typeof payload !== 'object' || !('lastLoginAt' in payload) || typeof payload.lastLoginAt !== 'string') {
      if (!isTransientLoginFailure(response.status)) await signOutLocal(input.signOut)
      if (isTransientLoginFailure(response.status)) {
        return { ok: false, message: 'ระบบกำลังตอบสนองช้า กรุณากดเข้าสู่ระบบอีกครั้ง' }
      }
      return { ok: false, message: loginContractErrorMessage(response.status) }
    }

    if (!('authUserId' in payload) || payload.authUserId !== input.expectedAuthUserId) {
      await signOutLocal(input.signOut)
      return { ok: false, message: 'Session เข้าสู่ระบบไม่ตรงกับบัญชีที่เลือก กรุณาลองใหม่' }
    }

    return { ok: true, lastLoginAt: payload.lastLoginAt }
  } catch {
    return { ok: false, message: 'ระบบกำลังตอบสนองช้า กรุณากดเข้าสู่ระบบอีกครั้ง' }
  }
}

export async function acknowledgePasswordChanged(input: {
  fetchImpl: typeof fetch
}): Promise<PasswordChangedAcknowledgementResult> {
  const fetchImpl = input.fetchImpl

  try {
    const response = await fetchImpl('/api/auth/password-changed', {
      cache: 'no-store',
      credentials: 'include',
      method: 'POST',
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok || !payload || typeof payload !== 'object' || !('cleared' in payload) || payload.cleared !== true) {
      return { ok: false, message: PASSWORD_CHANGE_ACKNOWLEDGEMENT_ERROR }
    }

    return { ok: true }
  } catch {
    return { ok: false, message: PASSWORD_CHANGE_ACKNOWLEDGEMENT_ERROR }
  }
}
