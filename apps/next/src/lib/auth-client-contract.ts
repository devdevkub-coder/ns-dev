export type LoginContractResult = { ok: true } | { ok: false; message: string }

function loginContractErrorMessage(status: number | null) {
  if (status === 401) return 'Session เข้าสู่ระบบไม่ถูกต้อง กรุณาลองใหม่'
  return 'ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ กรุณาลองใหม่'
}

async function signOutLocal(signOut: () => Promise<unknown>) {
  await signOut().catch(() => undefined)
}

export async function completeBrowserLoginSession(input: {
  fetchImpl: typeof fetch
  signOut: () => Promise<unknown>
}): Promise<LoginContractResult> {
  try {
    const response = await input.fetchImpl('/api/auth/login-complete', {
      cache: 'no-store',
      credentials: 'include',
      method: 'POST',
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok || !payload || typeof payload !== 'object' || !('lastLoginAt' in payload) || typeof payload.lastLoginAt !== 'string') {
      await signOutLocal(input.signOut)
      return { ok: false, message: loginContractErrorMessage(response.status) }
    }

    return { ok: true }
  } catch {
    await signOutLocal(input.signOut)
    return { ok: false, message: 'เชื่อมต่อระบบเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่' }
  }
}
