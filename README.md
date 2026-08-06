# NS Scrap ERP

Legacy ERP rehabilitation project.

## Current Entries

- Active Next.js app: `apps/next/`
- Local-only Vue/Vite baseline: `old-apps/vue/`
- Local-only legacy source: `old-apps/legacy/`
- Target requirements: `REQUIREMENTS_TARGET_SYSTEM.md`
- Legacy/prototype requirements: `REQUIREMENTS_LEGACY_PROTOTYPE.md`
- Documentation index: `docs/migration/00-doc-index.md`
- Current work status: `docs/migration/00-current-work.md`

The Next.js app is the active development and Vercel deployment target. The Vue/Vite app and original legacy app are kept locally under `old-apps/` as audited source/reference material and are ignored by git.

## Project Layout

```text
apps/next/                  # active Next.js app for deploy
  src/
  prisma/
old-apps/vue/               # local-only Vue/Vite baseline; ignored by git
  index.html
  src/
old-apps/legacy/            # local-only archived old app; ignored by git
  index.html
  export-button.js
docs/                   # migration docs and Obsidian notes
reports/                # local audit outputs; keep sensitive dumps out of git
```

## Local Development

Install dependencies:

```bash
npm install
```

Run the active Next.js app:

```bash
npm run dev
```

Build check:

```bash
npm run build
```

The active app entry is `apps/next`. The root scripts delegate to `apps/next` so Vercel and local commands do not accidentally build the archived Vue app.

Run the archived Vue/Vite baseline only when comparing old screens:

```bash
npm run old-vue:dev
```

## Legacy Source

The old application is archived in `old-apps/legacy/` for reference only.

```text
old-apps/legacy/index.html
old-apps/legacy/export-button.js
```

Use these files as source material when migrating a module, but do not import
them from `old-apps/vue/` and do not add routes from the new Vue app back to the
legacy runtime. If you need to inspect the legacy UI locally, open
`old-apps/legacy/index.html` directly in a browser as a static archived page.

## Environment

Copy `.env.example` to `.env.local` and fill the SIT Supabase values. Do not point local development at the current Production or legacy source project.

Required frontend values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://vbjlkxbytccklhqvxjuu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-sit-anon-key
```

Required database value for SIT import/testing:

```env
DATABASE_URL=postgresql://postgres.vbjlkxbytccklhqvxjuu:replace-with-sit-db-password@replace-with-sit-pooler-host:5432/postgres
SUPABASE_DB_USER=postgres.vbjlkxbytccklhqvxjuu
SUPABASE_DB_URL=postgresql://postgres.vbjlkxbytccklhqvxjuu:replace-with-sit-db-password@replace-with-sit-pooler-host:5432/postgres
```

Optional server values for Sales Plan live pricing:

```env
EXCHANGERATE_API_KEY=replace-with-api-key
CRON_SECRET=replace-with-random-16-plus-char-secret
```

Sales Plan live pricing notes:

- `POST /api/sales-plan` action `fetch-live` reads `USD/THB` from `https://www.google.com/finance/beta/quote/USD-THB` and falls back to ExchangeRate API when `EXCHANGERATE_API_KEY` is set
- `LME铜` / `LME铝` are read from `https://3g.fx678.com/Market/index/LME`
- `ทองเหลือง LME` and `กก./ตู้` remain manual
- `vercel.json` schedules `/api/cron/sales-plan-lme` on weekdays at `01:05 UTC` (`08:05` Thailand time)
- Per Vercel docs, `CRON_SECRET` is sent to the cron route in the `Authorization: Bearer ...` header

Keep `.env.local` private. It must not be committed.

## Supabase Environments

- `production`: `fhglqymcdmrgbsbadnwr`
  - Current Production runtime/database. Read-only by default; Production changes require explicit approval.
- `sit`: `vbjlkxbytccklhqvxjuu`
  - Use for local development, Supabase Auth/RLS testing, schema migration testing, and frontend integration.
  - Project-level MCP server name: `supabase`.
- `legacy-prod-source`: `mqsgptraslgpyzbpndlg`
  - Use only as the read-only source for audit, dumps, and migration mapping.
  - Project-level MCP server name: `supabase-prod-source`.

Before importing `reports/db_audit/public_app_dump.sql`, verify that
`DATABASE_URL` points to the SIT project `vbjlkxbytccklhqvxjuu`, not either
Production project.

## Migration Rule

Copy only the needed legacy functions or modules from `old-apps/legacy/` or audited Vue baseline code from `old-apps/vue/` into the active app structure, then refactor them into service/query/schema/component boundaries. The active app must not route to or import archived legacy runtime.

## Documentation Map

Start with:

- `docs/migration/00-doc-index.md` - canonical documentation map
- `docs/migration/00-current-work.md` - latest work status and next batch
- `REQUIREMENTS_TARGET_SYSTEM.md` - target/new system requirements
- `REQUIREMENTS_LEGACY_PROTOTYPE.md` - legacy/prototype reference
- `docs/migration/17-next-remaining-modules-progress.md` - remaining module batch/task tracker

Detailed historical module notes may still exist under `docs/notes/`, but current execution status should be tracked in `docs/migration/00-current-work.md` and the relevant migration tracker.
