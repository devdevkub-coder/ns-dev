export const LINE_CONNECTION_PROFILES = {
  'sit-a': {
    id: 'sit-a',
    label: 'OA A · SIT',
    appHost: 'ns-erp-sit.vercel.app',
    supabaseProjectRef: 'vbjlkxbytccklhqvxjuu',
  },
  'production-b': {
    id: 'production-b',
    label: 'OA B · Production',
    appHost: 'ns-erp.vercel.app',
    supabaseProjectRef: 'fhglqymcdmrgbsbadnwr',
  },
} as const

type LineConnectionProfile = (typeof LINE_CONNECTION_PROFILES)[keyof typeof LINE_CONNECTION_PROFILES]

const CUSTOM_PROFILE = { id: 'custom', label: 'Custom/Unknown' } as const

function parseHost(value: string | null | undefined) {
  try {
    return new URL(value ?? '').hostname.toLowerCase()
  } catch {
    return null
  }
}

function parseSupabaseProjectRef(value: string | null | undefined) {
  const host = parseHost(value)
  const match = host?.match(/^([a-z0-9]+)\.supabase\.co$/)

  return match?.[1] ?? null
}

function findDataProfile(supabaseUrl: string | null | undefined) {
  const projectRef = parseSupabaseProjectRef(supabaseUrl)
  return Object.values(LINE_CONNECTION_PROFILES).find((profile) => profile.supabaseProjectRef === projectRef)
}

function findTargetProfile(appUrl: string | null | undefined) {
  const appHost = parseHost(appUrl)
  return Object.values(LINE_CONNECTION_PROFILES).find((profile) => profile.appHost === appHost)
}

function profileOrCustom(profile: LineConnectionProfile | undefined) {
  return profile ?? CUSTOM_PROFILE
}

export function resolveLineConnectionProfile({
  appUrl,
  supabaseUrl,
}: {
  appUrl: string | null | undefined
  supabaseUrl: string | null | undefined
}) {
  const dataProfile = findDataProfile(supabaseUrl)
  const targetProfile = findTargetProfile(appUrl)
  const source = profileOrCustom(dataProfile)
  const target = profileOrCustom(targetProfile)
  const aligned = Boolean(dataProfile && targetProfile && dataProfile.id === targetProfile.id)

  return {
    id: source.id,
    label: source.label,
    appHost: targetProfile?.appHost ?? null,
    supabaseProjectRef: dataProfile?.supabaseProjectRef ?? null,
    aligned,
    reason: aligned
      ? 'ฐานข้อมูลและ Webhook อยู่ใน environment เดียวกัน'
      : dataProfile && targetProfile
        ? 'ฐานข้อมูลและ Webhook URL อยู่คนละ environment'
        : 'ไม่สามารถยืนยัน environment ของฐานข้อมูลหรือ Webhook URL ได้',
    dataProfileId: source.id,
    dataProfileLabel: source.label,
    targetProfileId: target.id,
    targetProfileLabel: target.label,
  }
}
