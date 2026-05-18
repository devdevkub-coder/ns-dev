# 00 Current Work

## Current Status

Date: 2026-05-18  
Active app: `apps/next`  
Primary remote: `new-origin`  
Last pushed checkpoint: current MCP tooling checkpoint (`chore: add playwright mcp config`)

## Current Batch

`Batch MCP: Browser QA Tooling`

Goal:

- Add project-level Playwright MCP without replacing existing Supabase/Obsidian MCP config.
- Keep browser QA tooling discoverable in environment docs.
- Require Codex restart before expecting the new MCP tools in runtime.

## File Naming Changes

| Old Name | New Name | Meaning |
|---|---|---|
| `SRS.md` | `REQUIREMENTS_TARGET_SYSTEM.md` | SRS/requirements ของระบบใหม่หรือระบบเป้าหมาย |
| `NS_Scrap_ERP_System_Requirements.md` | `REQUIREMENTS_LEGACY_PROTOTYPE.md` | เอกสาร requirement/description ของระบบเก่า/prototype |

## Latest Completed Implementation Checkpoints

- `3805587 chore: upgrade next app to tailwind v4`
  - Upgraded active Next app to Tailwind CSS v4
  - Validated lint, type-check, build, and Tailwind package resolution
- `e900c6f docs: require resumable session handoffs`
  - Added resumable session handoff rules to `AGENTS.md`
  - Recorded TW4 as the next active batch after an interrupted install
- `14df0a5 docs: define sub agent operating rules`
  - Added sub agent use/close rules to `AGENTS.md`
  - Added operating model to this current work document
- `fa08cb1 docs: standardize requirements and doc index`
  - Renamed ambiguous requirements files
  - Added `00-doc-index.md` and this current work document
- `12fda4b feat: complete production report baseline`
  - Production pages/APIsครบแบบ read/report baseline
- `2d08f0d feat: add production category baseline`
  - Production output categories + production orders baseline
- `3ad5501 docs: add sitemap openapi preflight tasks`
  - Added Batch PRE for sitemap/OpenAPI before next major module

## Next Required Batch

`Batch PRE: System Map and API Contract Baseline`

Tasks:

1. Create `docs/migration/18-next-system-sitemap.md`
2. Inventory navigation routes vs real pages/APIs
3. Create `docs/api/openapi.yaml` skeleton
4. Add current API catalog baseline
5. Commit/push before `Batch S: Stock`

## Tailwind v4 Migration Status

Status: completed and pushed in the TW4 checkpoint.

Changes:

- `apps/next` now uses `tailwindcss@4.3.0` and `@tailwindcss/postcss@4.3.0`.
- `apps/next/postcss.config.cjs` now uses the Tailwind v4 PostCSS plugin.
- `apps/next/src/app/globals.css` now uses `@import "tailwindcss";` and CSS-first `@theme` tokens.
- Removed `apps/next/tailwind.config.ts`; active app theme tokens now live in CSS.
- Root `package.json` still keeps Tailwind v3 for old Vue tooling; this is intentional until old Vue tooling is removed or upgraded.

Validation passed:

- `npm ls tailwindcss @tailwindcss/postcss --workspace @ns-scrap-erp/next`
- `npm run lint --workspace @ns-scrap-erp/next`
- `npm run type-check --workspace @ns-scrap-erp/next`
- `npm run build --workspace @ns-scrap-erp/next`

## Playwright MCP Status

Status: configured locally, pending commit/push.

Changes:

- Added `playwright` server to project-level `.mcp.json`.
- Command: `npx --yes @playwright/mcp@latest --headless`
- Documented the setup in `docs/migration/10-environment-status.md`.

Validation passed:

- `node -e "JSON.parse(require('fs').readFileSync('.mcp.json','utf8')); console.log('mcp json ok')"`
- `npx --yes @playwright/mcp@latest --help`

Runtime note:

- Restart Codex before expecting `/mcp` or MCP resources/tools to show the new `playwright` server.

## Current Priority Queue

1. Batch PRE: System Map and API Contract Baseline
2. Batch S: Stock
3. Batch F: Finance and Debt
4. Batch T: Tracking 360
5. Batch D: Dual Costing / Trading / PO
6. Batch FF: Foreign Finance
7. Batch A: Finance / Accounting
8. Batch M: Main Dashboards and Operational Control
9. Batch SYS: System and Cleanup

## Operating Model

Before each module batch:

1. Read the module overview and legacy source touchpoints.
2. Break the module into page-level tasks.
3. For each page, document the expected fields, buttons, modals, APIs, DB tables, validation, pagination/sort/export, and Playwright checks.
4. Implement in reviewable slices.
5. Update the relevant tracker before moving to the next slice.
6. Commit/push after each meaningful checkpoint.

Use sub agents only for bounded parallel work:

- legacy flow search
- route/API inventory
- independent page audit
- Playwright smoke verification
- isolated docs or page/API implementation with clear file ownership

For Playwright work, use a sub agent by default so browser QA can run in parallel while the main agent continues implementation or integration. The main agent must define the exact Playwright scope and then integrate findings before committing.

Close sub agents when their task is integrated, no longer needed, blocked, overlapping, or after a batch checkpoint leaves them with no remaining work. Do not leave reminder agents open unless the user explicitly requested one for the active task list.

## Handoff Checklist

At every checkpoint, update docs as if a new session will start from only the repository:

1. Current batch/task/page
2. Exact partial work and files touched
3. Commands already run and result
4. Validation still required
5. Next concrete task
6. Whether to continue immediately or pause for discussion

## Known Carry-over Work

- `reports/` is untracked/local and must not be committed unless explicitly approved.
- Production write flow is not complete:
  - create/edit production order
  - production input/output write
  - process cost write
  - reverse/cancel/close/lock cost
  - stock ledger/cost allocation reconciliation
- Purchase follow-ups:
  - void/reversal
  - PO remaining qty reconciliation
  - header/line table refactor
- Sales follow-ups:
  - create/edit/post
  - FIFO/COGS
- Stock follow-ups:
  - Stock module pages still need Batch S
  - Stock transfer cancel/void and cost source still pending
- Finance follow-ups:
  - Payment approval persistence/printing
  - AP/AR allocation/reconciliation
- Auth/permission:
  - branch-scope enforcement
  - full legacy role matrix migration

## Validation Baseline

Latest full app validation passed during TW4:

- `npm run type-check --workspace @ns-scrap-erp/next`
- `npm run lint --workspace @ns-scrap-erp/next`
- `npm run build --workspace @ns-scrap-erp/next`

Tailwind dependency check:

- `npm ls tailwindcss @tailwindcss/postcss --workspace @ns-scrap-erp/next`
