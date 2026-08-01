type FinanceActorContext = {
  appUser: { email: string | null } | null
  authUser: { email?: string | null }
}

/** Financial facts must have a real accountable actor; '-' is not an audit identity. */
export function requireFinanceActor(context: FinanceActorContext) {
  const actor = context.appUser?.email?.trim() || context.authUser.email?.trim()
  if (!actor) throw new Error('ไม่พบผู้ใช้งานสำหรับบันทึกข้อมูลทางการเงิน')
  return actor
}
