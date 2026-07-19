# Auth Edge Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden public password-reset and browser-session entry points without changing the deferred server-owned password-completion or invitation-activation lifecycle.

**Architecture:** Supabase Auth and PostgreSQL remain sources of truth. The public forgot-password route validates its request, uses a Redis admission check, resolves the application user, then calls Supabase. Shared auth response and client-contract helpers make cache and error behaviour consistent while staying outside the reference-master cache.

**Tech Stack:** Next.js App Router, TypeScript, Supabase SSR/admin clients, Prisma, Upstash Redis REST API, Vitest.

## Global Constraints

- Do not redesign `POST /api/auth/password-changed`, its proxy allowlist, forced-password state transition, or invitation activation. The P0 is deferred and tracked in `docs/migration/14-auth-permission-batch-plan.md`.
- Missing Redis configuration, missing `AUTH_RATE_LIMIT_SECRET`, invalid Redis responses, and Redis transport errors must fail closed with HTTP 503 before Supabase delivery.
- Never write raw submitted email to Redis, logs, or audit metadata. Use a trimmed/lowercased HMAC-SHA-256 fingerprint; hash source IP for Redis keys too.
- Valid forgot-password requests return `202 { accepted: true }` whether unknown, inactive, throttled, or delivered. Invalid body/redirect stays 400.
- Auth/session/permission responses use `Cache-Control: private, no-store`.
- No database migration. Do not modify unrelated dirty files or run browser UAT unless explicitly requested.

---

## Task 1: Fail-closed Redis password-reset limiter

**Files:**
- Create: `apps/next/src/lib/server/auth-rate-limit.ts`
- Create: `apps/next/src/lib/server/auth-rate-limit.test.ts`
- Modify: `apps/next/src/app/api/auth/forgot-password/route.ts`
- Create: `apps/next/src/app/api/auth/forgot-password/route.test.ts`

**Interfaces:**

```ts
export type ForgotPasswordRateLimitResult =
  | { outcome: 'allowed' }
  | { outcome: 'throttled' }
  | { outcome: 'unavailable' }

export async function consumeForgotPasswordRateLimit(input: {
  email: string
  ip: string | null
}): Promise<ForgotPasswordRateLimitResult>
```

The route consumes the typed result before looking up an application user or calling Supabase. Audit metadata emits only a source, identifier type, and fixed outcome code, never an email, fingerprint, reset URL, or provider text.

- [ ] Define limits: IP maximum 10 in 15 minutes; normalized email maximum 3 in 30 minutes.
- [ ] Require `AUTH_RATE_LIMIT_SECRET`; normalize email with `trim().toLowerCase()` and HMAC both email and IP with SHA-256/base64url.
- [ ] Read Upstash REST configuration directly in this security helper, never through `reference-master-cache` because that helper permits DB fallback.
- [ ] Send one Redis `EVAL` call with both keys. Inspect both current counts before incrementing either; set each TTL only on first creation; return `throttled` without extending a window.
- [ ] Strictly validate the Redis result. Any configuration, HTTP, network, or result-shape failure becomes `unavailable`.
- [ ] Update the route to admit through the limiter after payload/redirect validation. `allowed`, `throttled`, unknown/inactive user, and delivery-failure paths use generic 202; `unavailable` returns 503 before Supabase.
- [ ] Remove raw email audit metadata and replace it with `source`, `identifierType`, and `accepted`, `throttled`, or `delivery_failed` outcome.
- [ ] Test normalization/fingerprinting; allowed/throttled/unavailable Redis paths; identical generic responses for unknown/throttled; no delivery on throttling/unavailability; no raw email in audit payloads.

**Verification:**

```bash
npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/auth-rate-limit.test.ts apps/next/src/app/api/auth/forgot-password/route.test.ts
```

**Commit:**

```bash
git add apps/next/src/lib/server/auth-rate-limit.ts apps/next/src/lib/server/auth-rate-limit.test.ts apps/next/src/app/api/auth/forgot-password/route.ts apps/next/src/app/api/auth/forgot-password/route.test.ts
git commit -m "fix(auth): rate limit password reset requests"
```

## Task 2: Auth API cache contract

**Files:**
- Create: `apps/next/src/lib/server/auth-response.ts`
- Create: `apps/next/src/lib/server/auth-response.test.ts`
- Modify: `apps/next/src/app/api/auth/me/route.ts`
- Modify: `apps/next/src/app/api/auth/login-complete/route.ts`
- Modify: `apps/next/src/app/api/auth/forgot-password/route.ts`
- Modify: `apps/next/src/app/api/auth/password-changed/route.ts`

**Interfaces:**

```ts
export const authNoStoreHeaders: Readonly<Record<'Cache-Control', string>>
export function authJson<T>(body: T, init?: ResponseInit): NextResponse<T>
```

Every terminal response from the four routes consumes `authJson`, including success and errors. This task changes headers only for `password-changed`.

- [ ] Create a server-only helper that merges `Cache-Control: private, no-store` with additional headers while preventing replacement of that policy.
- [ ] Convert all terminal JSON responses in the four routes to the helper while preserving their existing statuses/body shapes, aside from Task 1's forgot contract.
- [ ] Test helper precedence and representative success/error response headers for all four routes.

**Verification:**

```bash
npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/auth-response.test.ts apps/next/src/app/api/auth/forgot-password/route.test.ts
npm run type-check --workspace @ns-scrap-erp/next
```

**Commit:**

```bash
git add apps/next/src/lib/server/auth-response.ts apps/next/src/lib/server/auth-response.test.ts apps/next/src/app/api/auth/me/route.ts apps/next/src/app/api/auth/login-complete/route.ts apps/next/src/app/api/auth/forgot-password/route.ts apps/next/src/app/api/auth/password-changed/route.ts
git commit -m "fix(auth): prevent caching auth responses"
```

## Task 3: Validate existing browser sessions on `/login`

**Files:**
- Create: `apps/next/src/lib/auth-client-contract.ts`
- Create: `apps/next/src/lib/auth-client-contract.test.ts`
- Modify: `apps/next/src/app/login/LoginPageClient.tsx`
- Create: `apps/next/src/app/login/LoginPageClient.test.tsx`

**Interfaces:**

```ts
export type LoginContractResult = { ok: true } | { ok: false; message: string }

export async function completeExistingBrowserSession(input: {
  fetchImpl: typeof fetch
  signOut: () => Promise<unknown>
}): Promise<LoginContractResult>
```

The login page redirects only after `{ ok: true }`. On a failed contract it signs out locally once, displays stable Thai copy, and does not redirect repeatedly.

- [ ] Implement a client-safe helper that posts to `/api/auth/login-complete`, validates the success shape, and classifies non-OK, invalid JSON, and network errors without using provider/server text.
- [ ] Ensure failure signs out before returning a stable Thai error.
- [ ] Replace the existing-session redirect effect with this helper and retain cancellation guards.
- [ ] Reuse the helper for fresh password login completion where types permit, without changing the route/proxy lifecycle.
- [ ] Test helper success/non-OK/malformed/network/sign-out cases and a jsdom page test proving a stale session does not redirect on contract failure.

**Verification:**

```bash
npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/auth-client-contract.test.ts apps/next/src/app/login/LoginPageClient.test.tsx
```

**Commit:**

```bash
git add apps/next/src/lib/auth-client-contract.ts apps/next/src/lib/auth-client-contract.test.ts apps/next/src/app/login/LoginPageClient.tsx apps/next/src/app/login/LoginPageClient.test.tsx
git commit -m "fix(auth): validate existing browser sessions"
```

## Task 4: Stable password UI errors and acknowledged lifecycle calls

**Files:**
- Create: `apps/next/src/lib/auth-client-errors.ts`
- Create: `apps/next/src/lib/auth-client-errors.test.ts`
- Modify: `apps/next/src/app/reset-password/ResetPasswordPageClient.tsx`
- Modify: `apps/next/src/app/admin/change-password/ChangePasswordPageClient.tsx`
- Modify: `apps/next/src/app/profile/ProfilePageClient.tsx`
- Create: `apps/next/src/app/reset-password/ResetPasswordPageClient.test.tsx`
- Create: `apps/next/src/app/admin/change-password/ChangePasswordPageClient.test.tsx`
- Create: `apps/next/src/app/profile/ProfilePageClient.test.tsx`

**Interfaces:**

```ts
export function passwordUpdateErrorMessage(error: unknown): string
export function passwordLifecycleErrorMessage(error: unknown): string
```

These helpers produce stable Thai classifications for invalid input, expired/invalid recovery session, network failure, generic provider failure, and lifecycle acknowledgement failure. They never return provider-controlled text.

- [ ] Map known safe cases to Thai copy and map every unknown provider error to one generic Thai message.
- [ ] Replace all direct `updateError.message` rendering in reset, admin-change, and profile-change pages.
- [ ] Replace swallowed `fetch('/api/auth/password-changed')` calls with a response-contract check. Do not show the final page success state until acknowledgement succeeds.
- [ ] Keep the endpoint authorization, proxy allowlist, forced-password transition, and invitation flow unchanged; this is a client acknowledgement improvement only.
- [ ] Preserve form validation and existing successful sign-out/navigation after acknowledgement.
- [ ] Test helper non-leakage and jsdom page rendering that asserts original provider error strings are not shown.

**Verification:**

```bash
npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/auth-client-errors.test.ts apps/next/src/app/reset-password/ResetPasswordPageClient.test.tsx apps/next/src/app/admin/change-password/ChangePasswordPageClient.test.tsx apps/next/src/app/profile/ProfilePageClient.test.tsx
npm run lint --workspace @ns-scrap-erp/next
```

**Commit:**

```bash
git add apps/next/src/lib/auth-client-errors.ts apps/next/src/lib/auth-client-errors.test.ts apps/next/src/app/reset-password/ResetPasswordPageClient.tsx apps/next/src/app/admin/change-password/ChangePasswordPageClient.tsx apps/next/src/app/profile/ProfilePageClient.tsx apps/next/src/app/reset-password/ResetPasswordPageClient.test.tsx apps/next/src/app/admin/change-password/ChangePasswordPageClient.test.tsx apps/next/src/app/profile/ProfilePageClient.test.tsx
git commit -m "fix(auth): standardize password error handling"
```

## Task 5: Deployment note and full validation

**Files:**
- Modify: `docs/migration/14-auth-permission-batch-plan.md`
- Modify: `docs/migration/00-current-work.md`
- Modify: `docs/superpowers/specs/2026-07-19-auth-edge-hardening-design.md`
- Modify: `docs/superpowers/plans/2026-07-19-auth-edge-hardening-implementation-plan.md`

**Interfaces:** No runtime interface changes. Documentation records the required server-only environment configuration, no-migration result, validation evidence, and deferred P0.

- [ ] Add a checkpoint naming `AUTH_RATE_LIMIT_SECRET`, required Redis connectivity, focused test evidence, and the fact that no migration ran.
- [ ] Keep `00-current-work.md` operational: close this batch only after validation and leave the deferred P0 as the immediate auth-security follow-up.
- [ ] Add final commit IDs and validation result to the design; never add secret values.
- [ ] Run focused tests, lint, type-check, production build, and `git diff --check`. Fix failures in their owning task before closing the batch.

**Verification:**

```bash
npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/auth-rate-limit.test.ts apps/next/src/app/api/auth/forgot-password/route.test.ts apps/next/src/lib/server/auth-response.test.ts apps/next/src/lib/auth-client-contract.test.ts apps/next/src/lib/auth-client-errors.test.ts
npm run lint --workspace @ns-scrap-erp/next
npm run type-check --workspace @ns-scrap-erp/next
npm run build --workspace @ns-scrap-erp/next
git diff --check
```

**Commit:**

```bash
git add docs/migration/14-auth-permission-batch-plan.md docs/migration/00-current-work.md docs/superpowers/specs/2026-07-19-auth-edge-hardening-design.md docs/superpowers/plans/2026-07-19-auth-edge-hardening-implementation-plan.md
git commit -m "docs(auth): record edge hardening validation"
```

## Final Delivery Checklist

- [ ] Verify `AUTH_RATE_LIMIT_SECRET`, `KV_REST_API_URL`, and `KV_REST_API_TOKEN` in each deployment environment before release.
- [ ] Confirm no database migration is queued.
- [ ] Confirm the `password-changed` P0 remains explicit in the auth tracker and release handoff.
- [ ] Push only scoped auth-hardening commits to `new-origin/dev` after checking remote, branch, worktree, and ancestry.

## Execution Record 2026-07-19

- Task 1 completed in `27a7795e`.
- Task 2 completed in `bcc73466`.
- Task 3 completed in `599134de`; React Strict Mode is guarded so an existing-session validation does not call login completion twice.
- Task 4 completed in `2a66879e`. The acknowledgement and provider-error mapping were consolidated into `auth-client-contract.ts` rather than a second client helper. Focused contract and login-page tests cover the non-leak and fail-closed contracts; no browser UAT was run.
- Task 5 completed: focused auth suite passed 29/29; workspace lint, type-check, production build, and `git diff --check` passed. No database migration was created or applied.
