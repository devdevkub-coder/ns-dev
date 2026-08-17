# NS Scrap ERP Agent Rules

This project is an existing NS Scrap ERP system that must be rehabilitated and refactored, not rewritten blindly.

## Must Follow

- **TOKEN-LIGHT RULE LOADING:** Do not read root `Peach.md` by default. At the start of a task, read `AGENTS.md` plus only the detailed rule files that match the work. The small router at `.agents/rules/peach.md` exists only to choose the right rule file; it must not pull the old full Peach context into every task.
- Use Thai for user-facing explanations unless the user explicitly requests another language.
- Active implementation/deploy target is the Next.js app under `apps/next/`.
- Treat `old-apps/legacy/` and `old-apps/vue/` as source material only. Do not route to, import, or execute them from the active app.
- Use the SIT Supabase project for development, Auth/RLS testing, and schema work. Treat the Production Supabase project as read-only unless the user explicitly approves a Production operation. Do not develop directly against `legacy-prod-source`.
- Never commit secrets, production dumps, raw sensitive exports, or `.env.local`.
- Do not store user passwords in application tables. Use `auth.users` as the authentication source of truth.
- Do not use destructive git commands or revert user changes unless explicitly requested.
- Git remote policy:
  - for normal day-to-day SIT work, use `sit-origin/main` as the canonical source of truth and push target
  - use one local working line aligned with the latest `sit-origin/main`; do not create per-task branches or worktrees unless the user explicitly requests an exception
  - fetch and integrate the latest `sit-origin/main` before editing and again before every push; never discard or overwrite existing local work while aligning
  - use `new-origin` only when the user explicitly requests a Dev or other non-SIT promotion
  - `origin` / `https://github.com/sirimasth/ns-scrap-erp.git` is legacy read-only reference material only
  - never push, force-push, create branches, delete branches, open PRs, write tags, or otherwise mutate `origin` / `https://github.com/sirimasth/ns-scrap-erp.git`
  - use `origin` only for read operations such as fetch, log, diff, show, and checkout-to-inspect
  - if both remotes exist, verify the destination remote before push, branch deletion, or PR creation
- Before any SIT push, deploy, migration, Supabase CLI, Vercel CLI, or MCP action, read `docs/agent-rules/sit-delivery.md` and verify the target, account, project ref, connection scope, and exact commit SHA.
- Before any Production push, promote, deploy, migration, Supabase CLI, Vercel CLI, or MCP action, read `docs/agent-rules/production-delivery.md`. Production is owner-controlled and read-only for agents by default; do not infer Production authorization from a generic delivery request.
- Update docs at every meaningful checkpoint as if the session can close at any time. Every time development or browser/UAT testing of a business flow is completed, you MUST write or update a flow summary (e.g. in the walkthrough or a design note) explaining "what is what" (the business entities and states) and "why it has to be like this" (the rationale behind the design and logic).
- Keep `docs/migration/00-current-work.md` short and operational. It is the active handoff file, not a long changelog. Leave there only the current objective, active batch, blockers, latest still-active decisions, expected write areas, required validation, and immediate next tasks. Move completed checkpoints, long validation logs, deploy logs, and old batch summaries into archive/tracker documents instead of letting `00-current-work.md` grow indefinitely.
- Keep document roles separated:
  - `AGENTS.md` = project rules and operating constraints
  - `docs/migration/00-current-work.md` = active handoff only
  - `docs/migration/00-doc-index.md` = routing index for canonical docs
  - `docs/migration/README.md` = migration-doc entrypoint only
  - `docs/migration/` = plan, tracker, and archive documents
  - `docs/notes/README.md` = filesystem entrypoint for business/domain/page-flow notes
  - `docs/notes/` = business, domain, and page-flow source documents
- Do not let `docs/migration/README.md`, `docs/migration/00-doc-index.md`, and `docs/migration/00-current-work.md` drift into overlapping roles again. If a document starts acting as both router, tracker, and long history log, split it.
- Obsidian-specific MOC files such as `docs/notes/_Index.md` may remain for vault navigation, but they are not the primary start-here file for normal repo work.
- Keep `docs/` root reserved for global cross-project documents only. New business notes, page-flow notes, and dated work summaries must not be created directly under `docs/`; place them under `docs/notes/` or the appropriate subfolder instead.
- Use a sub agent by default for Playwright/browser QA work; the main agent still defines scope and integrates findings.
- **🚫 NO DOM ON PLANE:** Do not use DOM automation, browser sub-agents, or Playwright to access, login, click, input, or interact with `https://plane.devkub.com/` under any circumstances. All interactions with Plane must be executed programmatically via backend REST APIs or node/bash scripts, or handled manually by the user.
- **Mandatory Plane issue workflow:** Apply this only to Plane issues assigned to the current user/agent and use backend REST APIs or scripts only. Move an assigned issue from `Backlog` to `Todo` when selecting it for work, move it to `In Progress` when implementation starts, and after the requested scope is complete and validation passes move it to `wait for test`—never directly to `Done`. Add a Thai completion comment summarizing the implemented scope, affected pages/files, validation results, branch/commit/push/deploy status, and any remaining risk. For UI work, upload fresh screenshots of every affected page, including Desktop and Mobile evidence when both layouts are in scope. Leave final `Done` confirmation to the tester/owner. If the required state update, comment, or screenshot upload cannot be completed, report the exact blocker and do not claim the Plane workflow is complete.
- **Mandatory Code Review:** After completing implementation and verification for every task/issue, you MUST perform a rigorous Code Review (checking type signatures, null safety, contract compliance, UI alignment, and edge cases) and present a Code Review Report before claiming completion.
- If the user requests modifications or code improvements, only perform the code changes and verify compilation locally. Do NOT run browser or DOM UAT testing unless the user explicitly requests testing (i.e. do not use browser sub-agent unless told to test).
- Split large refactors into reviewable batches with one clear module, transform, or behavior change per batch.
- During clone/migration batches, use `docs/design.md` as the active design convention source and keep legacy/Vue parity unless a difference is documented and approved.
- When the user asks for a UI/design/page report, design judgment, or "คิดว่าไง" on a concrete app page, you MUST inspect the real rendered page in the browser first, then inspect the relevant code, and only then report findings or recommend edits. Do not report from code scans alone unless the page cannot be opened; if it cannot be opened, say that explicitly.
- For every UI/page change in `apps/next/`, check these three inputs before editing:
  1. the business flow / requirement for that page,
  2. `docs/design.md`,
  3. the closest reference page in the active app.
- Do not patch UI from memory or from a loosely similar page alone. If `docs/design.md` and an existing page differ, follow `docs/design.md` unless an override is documented in `docs/migration/00-current-work.md`.
- For form/list/filter work, explicitly verify wording, field behavior, layout grouping, and control sizing against the relevant flow and reference page before claiming completion.
- For form field type decisions, map every field to the `Field Input Decision Matrix` in `docs/design.md` before choosing `text`, `number`, or `money pattern`.
- If a field looks numeric but represents money, identifier, or business code, do not infer the input type from appearance alone; use the matrix and the page flow.
- Do not change application code outside the intended business flow just to tolerate bad, legacy, or malformed data. If data violates the target contract, fix the data, migration, seed, or source-of-truth process instead of adding compatibility branches, fallback logic, skip-row handling, or silent coercion in runtime code.
- After a batch is validated, committed, and pushed, immediately start the next batch from `docs/migration/00-current-work.md` and the relevant tracker unless the user pauses, redirects, or the next step requires explicit approval for high-risk work.

## Cache And Image Delivery Rules

ใช้กฎชุดนี้กับทุกหน้าหรือ API ที่เพิ่มใหม่ ห้ามเพิ่ม cache จากความรู้สึกว่าเป็นข้อมูลที่เปลี่ยนไม่บ่อย ต้องระบุ contract และ source of truth ก่อนเสมอ

### 1. Classify The Data First

- **L0 static asset:** JavaScript, CSS, font และ asset ที่มี content hash ใช้ framework/CDN cache ได้
- **L1 global lookup:** currency, unit, type, payment method และ lookup master ที่ไม่มี user/branch scope ใช้ shared server/Redis cache ได้เมื่อมี repeated-read evidence
- **L2 scoped reference:** branch, warehouse, customer/supplier branch option, account ตาม scope ใช้ key ที่มี scope ครบ ห้ามใช้ global key ปนกัน
- **L3 search result:** autocomplete/search ใช้ normalized query key, TTL สั้นกว่า full list และจำกัดผลลัพธ์
- **L4 historical label:** แยก reader all-record หรือ snapshot ตามความต้องการของเอกสาร ห้ามใช้ active-only cache เพื่อแสดงข้อมูลเก่า
- **L5 business fact:** price, cost, WAC, stock, balance, ledger, permission, session, transaction status และ report fact ต้องอ่าน source ปัจจุบัน ไม่ cache เป็น reference option

### 2. Server And Redis Cache Contract

- Database เป็น source of truth; cache เป็น read-through เท่านั้น ห้ามเขียน master ลง Redis โดยตรง
- ใช้ `short-lived server cache -> Redis -> DB` ผ่าน `reference-master-cache` หรือ service กลางเดียวกัน ห้ามสร้าง memory/Redis cache เฉพาะหน้าใหม่เอง
- ทุก key ต้องระบุ entity, active/all, search/scoped mode และทุก dimension ที่มีผลต่อผลลัพธ์ เช่น branch, tenant หรือ permission scope
- ห้ามใช้ fallback, hardcode, skip-row หรือ silent coercion เมื่อ cache miss, data malformed หรือ scope หาไม่เจอ; cache miss ต้องอ่าน DB และข้อมูลผิดต้องแก้ที่ source/migration
- หลัง DB write สำเร็จเท่านั้นจึง invalidate key ที่เกี่ยวข้อง ครอบคลุม create, update, deactivate, delete, import และ image metadata update
- ห้ามใช้ active-only cache เพื่อ map historical/inactive records และห้ามย้าย write-time validation หรือ transactional stock/finance calculation เข้า cache
- Search cache ต้อง normalize query, จำกัดขนาดผลลัพธ์, ไม่ใส่ PII/raw query ใน log และใช้ TTL สั้น
- เพิ่ม cache key ใหม่ต้องมี consumer จริง, invalidation path, TTL, scope, owner และ focused test; key ที่ไม่มี repeated-read evidence ให้คง DB ตรงหรือ retire

### 3. Browser Cache Boundary

- API ที่มี auth, permission, financial, stock, transaction หรือ business data ใช้ `private, no-store` เว้นแต่มี policy ที่อนุมัติชัดเจน
- Browser memory cache ใช้ได้เฉพาะ allowlisted reference options ที่ไม่ sensitive, มี user scope เมื่อจำเป็น, TTL สั้น, bounded size และ pending-request deduplication
- ห้ามเก็บ auth/session/permission/financial/stock/ledger/transaction/report response หรือข้อมูลส่วนบุคคลลง `localStorage`, `sessionStorage` หรือ persistent browser cache
- หลัง master write ต้อง invalidate client cache ที่เกี่ยวข้อง และต้องไม่แชร์ข้อมูลข้าม user หรือ branch scope

### 4. Image Storage And Loading

- ห้ามเก็บ binary image หรือ base64 ใน Redis, browser memory หรือ response ของ option API; Database เก็บเฉพาะ storage key/metadata ที่จำเป็น
- เก็บรูปใน object storage/CDN แยกอย่างน้อย `original` และ `thumbnail`; list/picker ใช้ thumbnail เท่านั้น และโหลด original เมื่อเปิด preview/detail
- ย่อและบีบรูปก่อน upload; ใช้ format และขนาดตามหน้าที่ต้องแสดง ห้ามส่ง original ทุกแถวของ list
- ใช้ versioned/immutable storage key เมื่อ replace รูป เพื่อให้ตั้ง `Cache-Control` ระยะยาวได้ เช่น `31536000`; ห้ามใช้ long-lived cache กับ URL ที่ content เปลี่ยนใต้ key เดิม
- รูปที่เป็นข้อมูลภายในต้องใช้ bucket/policy และ signed URL ตาม privacy contract ห้ามทำ public URL เพียงเพื่อให้โหลดง่าย
- ใช้ `next/image` หรือ equivalent ที่กำหนด `sizes`, lazy loading และ stable dimensions สำหรับ UI; ห้าม preload รูปทุกแถวโดยไม่มีเหตุผลจาก flow
- Image upload ต้องอัปโหลด asset ใหม่, บันทึก metadata ผ่าน DB, invalidate reference/thumbnail metadata หลัง DB สำเร็จ และลบ asset เก่าหลังยืนยันว่าไม่มีการใช้งานแล้ว
- ห้ามทำ runtime fallback กลับไปอ่าน legacy base64/image field; การย้ายข้อมูลเก่าต้องทำเป็น migration/backfill ที่ตรวจครบและมีรายงาน orphan/missing asset ก่อน cleanup
- ก่อนเพิ่ม image cache ให้ตรวจขนาดไฟล์, จำนวน request, cache hit, CDN/Storage latency และ broken-image rate แยกจาก Redis reference-cache metrics

### 5. Required Design Note For New Work

ทุกงานใหม่ที่เพิ่ม cache หรือ image loading ต้องบันทึกสั้น ๆ ว่า:

1. ข้อมูลอยู่ระดับ L0-L5 ใด และ source of truth คืออะไร
2. key/URL scope, TTL, cache headers และ invalidation อยู่ตรงไหน
3. ข้อมูลใดห้าม cache และเหตุผลทางธุรกิจ
4. รูปใช้ original/thumbnail อย่างไร และข้อมูลมี privacy ระดับใด
5. test ที่ครอบ cache hit/miss, stale data, scope isolation, invalidation และ broken/missing image

ต้องอัปเดต `docs/notes/Reference Master Cache Flow.md` หรือ flow note ที่เกี่ยวข้องก่อนปิด batch และรัน validation ตาม `Validation Baseline`.

## User Reporting Preference

For user-facing task reports, default to Thai and use the user's preferred combined table format:

1. Problem / duplication report: columns `#`, `Problem found`, `Severity`, `Recommended action`.
2. Files changed report: columns `File`, `What changed`, `Status`; use status symbols such as `✅` and `❌` in the `Status` column.
3. Design decision report: columns `Topic`, `Decision`.

After those tables, add only a short validation and remaining-risk summary. For tiny answers, a concise Thai confirmation is acceptable.

## Team Git Workflow

Use this normal SIT working path:

```text
sit-origin/main -> one local working line -> sit-origin/main
```

- User decision 2026-08-04: do not create a new branch or worktree for each normal task. Keep one working line based on the latest deployed SIT source so page behavior and Git history do not diverge across local copies.
- Before editing and before pushing, fetch `sit-origin/main`, verify ancestry, and semantically integrate any newer remote changes with the intended local changes.
- Keep commits focused even though they share one working line. Never mix unrelated dirty files into a commit.
- Run only one local Next.js server for this repository at `http://localhost:3000`. Restart that instance when needed instead of starting ports 3001, 3004, or another parallel app instance.
- `origin` is legacy read-only. Do not push, force-push, tag, delete branches, or open PRs there.
- `sit-origin/main` is the normal SIT integration target. Use `new-origin/dev`, customer UAT, or release targets only when the user explicitly requests that promotion.
- The word `UAT` means the active deployed UAT environment, not just a branch name. Verify the real target from env/deployment settings before any promotion.
- Customer UAT promotion uses remote `uat-origin`. When the user says `push UAT` or `promote dev to UAT` without another target, use the customer UAT target defined by the current deployment/env rules, not `new-origin/uat` by assumption.
- Before any mutating git action, verify the remote, current working line, dirty files, and target ancestry.
- Follow the operational git procedure in `docs/agent-rules/git-communication.md`.

## Required Reading

Before substantial work, read:
- `docs/migration/00-current-work.md`
- `docs/migration/00-doc-index.md`
- `docs/design.md`
- `REQUIREMENTS_TARGET_SYSTEM.md`

Then load only the additional documents routed by:
- `docs/migration/00-doc-index.md`
- `docs/agent-rules/README.md`

For database, migration, or environment work, read the relevant DB/env documents before acting.

## Detailed Rule Files

Read only the rule files relevant to the task. Use `docs/agent-rules/README.md` as the router for detailed rule files.

- For SIT delivery or any SIT Git/CLI/MCP connection work, read `docs/agent-rules/sit-delivery.md`.
- For Production delivery, promotion, or any Production Git/CLI/MCP connection work, read `docs/agent-rules/production-delivery.md`.

Only open root `Peach.md` when the user explicitly asks for old Peach history, or when investigating why a legacy Peach rule existed.

## Project Goal

Improve the existing system so both code and database structure are correct, maintainable, and traceable while preserving current business flow as much as practical.

Do not treat this as a greenfield rewrite unless explicitly instructed.

## Current Environment Shortlist

- Active app: `apps/next/`
- Project MCP config: `.mcp.json`
- Project skills: `.agents/skills/`
- Current work handoff: `docs/migration/00-current-work.md`
- Current env, remotes, deployment targets, and Supabase IDs: `docs/migration/10-environment-status.md`

## Validation Baseline

For meaningful code changes, run validation proportional to risk. For the active Next app, prefer:

```bash
npm run lint --workspace @ns-scrap-erp/next
npm run type-check --workspace @ns-scrap-erp/next
npm run build --workspace @ns-scrap-erp/next
```

For docs-only changes, at minimum run:

```bash
git diff --check
```
