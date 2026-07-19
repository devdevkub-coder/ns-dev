import 'server-only'

import { createHmac } from 'node:crypto'

const FORGOT_PASSWORD_IP_LIMIT = 10
const FORGOT_PASSWORD_IP_WINDOW_SECONDS = 15 * 60
const FORGOT_PASSWORD_EMAIL_LIMIT = 3
const FORGOT_PASSWORD_EMAIL_WINDOW_SECONDS = 30 * 60

type RedisPipelineResult = Array<{ result?: unknown }>

export type ForgotPasswordRateLimitResult =
  | { outcome: 'allowed' }
  | { outcome: 'throttled' }
  | { outcome: 'unavailable' }

const admitForgotPasswordScript = `
local ipKey = KEYS[1]
local emailKey = KEYS[2]
local ipLimit = tonumber(ARGV[1])
local ipTtl = tonumber(ARGV[2])
local emailLimit = tonumber(ARGV[3])
local emailTtl = tonumber(ARGV[4])

local ipCurrent = tonumber(redis.call('GET', ipKey) or '0')
local emailCurrent = tonumber(redis.call('GET', emailKey) or '0')

if ipCurrent >= ipLimit or emailCurrent >= emailLimit then
  return { 0, ipCurrent, emailCurrent }
end

local ipCount = redis.call('INCR', ipKey)
if ipCount == 1 then redis.call('EXPIRE', ipKey, ipTtl) end

local emailCount = redis.call('INCR', emailKey)
if emailCount == 1 then redis.call('EXPIRE', emailKey, emailTtl) end

return { 1, ipCount, emailCount }
`

function redisConfig() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  const secret = process.env.AUTH_RATE_LIMIT_SECRET

  if (!url || !token || !secret) return null
  return { secret, token, url: url.replace(/\/+$/, '') }
}

export function normalizeForgotPasswordEmail(email: string) {
  return email.trim().toLowerCase()
}

export function authRateLimitFingerprint(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function rateLimitKey(scope: 'email' | 'ip', fingerprint: string) {
  return `auth:forgot-password:${scope}:${fingerprint}`
}

function isAdmissionResult(value: unknown): value is [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((item) => typeof item === 'number' && Number.isFinite(item))
    && (value[0] === 0 || value[0] === 1)
}

export async function consumeForgotPasswordRateLimit(input: { email: string; ip: string | null }): Promise<ForgotPasswordRateLimitResult> {
  const config = redisConfig()
  const email = normalizeForgotPasswordEmail(input.email)
  if (!config || !email) return { outcome: 'unavailable' }

  const emailKey = rateLimitKey('email', authRateLimitFingerprint(email, config.secret))
  const ipKey = rateLimitKey('ip', authRateLimitFingerprint(input.ip ?? 'unknown', config.secret))

  try {
    const response = await fetch(`${config.url}/pipeline`, {
      body: JSON.stringify([[
        'EVAL',
        admitForgotPasswordScript,
        '2',
        ipKey,
        emailKey,
        String(FORGOT_PASSWORD_IP_LIMIT),
        String(FORGOT_PASSWORD_IP_WINDOW_SECONDS),
        String(FORGOT_PASSWORD_EMAIL_LIMIT),
        String(FORGOT_PASSWORD_EMAIL_WINDOW_SECONDS),
      ]]),
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    if (!response.ok) return { outcome: 'unavailable' }
    const payload = await response.json() as RedisPipelineResult
    const result = payload[0]?.result
    if (!isAdmissionResult(result)) return { outcome: 'unavailable' }

    return { outcome: result[0] === 1 ? 'allowed' : 'throttled' }
  } catch {
    return { outcome: 'unavailable' }
  }
}
