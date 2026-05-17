---
name: ns-scrap-erp-quality-audit
description: Project-specific quality audit workflow for NS Scrap ERP. Use in this repo when reviewing legacy UI behavior, click paths, shared state side effects, browser smoke tests, accessibility, responsive layout, release readiness, workspace tooling, or final verification after a migration/refactor slice. Always read AGENTS.md first.
---

# NS Scrap ERP Quality Audit

This project-level skill consolidates the useful parts of click-path audit, browser QA, accessibility checks, workspace surface audit, and verification loop for this repo.

## Required Context

Read first:

- `AGENTS.md`
- `SRS.md` when the audit relates to requirements or business behavior
- `docs/migration/09-implementation-tasklist.md` when the audit affects phase readiness
- `docs/migration/10-environment-status.md` when the audit touches Supabase, MCP, deployment, or environment assumptions

Use these project skills when relevant:

- `vue-vite-project-setup` for app structure and framework boundaries
- `vue-vitest-testing` for unit/component testing
- `vue-best-practices` for Vue component and router work
- `pinia` for client/app state behavior
- `supabase` for Auth/RLS/database behavior
- `ns-scrap-erp-migration` when findings affect DB model, migration, roles, permissions, or reconciliation

## When To Use

Use this workflow for:

- Legacy `index.html` behavior audits before refactor.
- Button, menu, modal, export, import, form, and route click-path review.
- Major UI refactors where the customer expects the same flow and visual behavior.
- Shared state changes in Pinia/composables/services.
- Browser smoke tests before handing a preview to the user/customer.
- Accessibility and keyboard navigation checks.
- Final verification before saying a slice is complete.
- Workspace/tooling audits before adding more MCP servers, skills, or project rules.

## Hard Rules

- Do not change business behavior silently. If behavior changes, document the old behavior, new behavior, and reason.
- Do not connect tests to `legacy-prod-source`.
- Do not print secrets or raw sensitive data in audit reports.
- Treat legacy UI as the baseline unless the user explicitly approves a new UI behavior.
- Keep findings actionable: include file/path, touchpoint, expected result, actual result, risk, and suggested fix.

## Click-Path Audit

Use this for buttons or flows that can look correct but end in the wrong state.

1. Identify the touchpoint: label, menu path, component/file, and handler.
2. Trace each function call in order.
3. Record state reads, state writes, resets, side effects, network calls, and async ordering.
4. Check whether a later call silently undoes an earlier call.
5. Check whether the final state matches what the user expects from the label/action.
6. Convert every confirmed bug into either a regression test or a documented follow-up task.

Report format:

```text
CLICK-PATH: [severity]
Touchpoint: [button/menu/form] at [file/path]
Expected: [user-visible result]
Actual: [observed or traced result]
Trace: [call 1 -> call 2 -> side effect/conflict]
Risk: [business/user impact]
Fix: [specific next step]
```

Prioritize:

- login/logout/session bootstrap
- menu visibility and route guards
- permission-aware buttons
- export/import buttons
- stock and finance actions
- save/submit/cancel/delete flows
- modal open/close and form reset flows

## Browser QA

For preview/staging/local UI checks:

1. Open the target URL.
2. Check console errors and failed network requests.
3. Verify desktop and mobile viewports.
4. Test login, protected route access, logout, and core navigation.
5. Submit valid and invalid form data for the target flow.
6. Capture issues that block customer UAT separately from non-blocking polish.

Use Playwright for repeatable flows when the behavior is business-critical. Do not rely only on visual inspection for auth, permissions, stock, finance, or export behavior.

### Local Web App Testing Pattern

Use this pattern when testing the legacy static app or the Vue/Vite app locally:

1. If the target is static legacy HTML, inspect `index.html` first to identify stable selectors and global scripts.
2. If the target is a dynamic Vue/Vite route, start the dev server and wait for the rendered page before inspecting selectors.
3. In browser automation, wait for JavaScript and network activity to settle before reading DOM state.
4. Capture console logs, failed requests, and screenshots for any failed flow.
5. Prefer user-facing selectors: role, text, labels, stable IDs, or explicit test IDs. Avoid fragile generated class selectors.
6. Close browser instances and stop local servers after checks.

For Vite, default to `http://localhost:5173` unless the repo scripts or current session use another port.

## Accessibility Checks

Minimum checks for changed UI:

- Interactive elements are reachable by keyboard.
- Focus is visible and returns to the triggering element when modals/dropdowns close.
- Icon-only buttons have accessible labels.
- Forms have labels and text-based error messages.
- Errors are not communicated by color alone.
- Modals trap focus while open and can be closed intentionally.
- Tables and data-heavy screens keep readable headings and action labels.

## Verification Loop

Before marking substantial work complete, run the checks that exist in this repo:

```bash
npm run build
npm test
```

If package scripts differ, inspect `package.json` and use the actual commands. For targeted fixes, run the smallest relevant test first, then the broader build/test check.

Also review:

- `git diff --stat`
- changed files for accidental secret exposure
- changed docs if the work affects requirements, migration assumptions, environments, auth, RLS, or DB structure

Final report should state:

- Build/test commands run and result.
- Any checks not run and why.
- Whether legacy behavior changed.
- Whether DB/migration assumptions changed.
- Remaining risks or follow-up tasks.

## Workspace Surface Audit

Use before adding tools or project configuration:

1. Inspect only relevant surfaces: `AGENTS.md`, `.mcp.json`, `.agents/skills/`, `package.json`, `.env.example`, docs.
2. Classify each capability as available, available but poorly wrapped, or missing.
3. Prefer project-level config for project-specific knowledge.
4. Avoid adding global config unless the capability is truly cross-project.
5. If a new skill would mostly duplicate `AGENTS.md`, update `AGENTS.md` or an existing project skill instead.
