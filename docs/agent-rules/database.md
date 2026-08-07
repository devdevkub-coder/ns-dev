# Database Rules

## Schema Direction

- The current database dump is a baseline and migration source, not the final target model.
- Prefer relational structure over transaction-critical `jsonb`.
- Split transaction headers and lines.
- Use real foreign keys where practical.
- Keep ledger-style tables traceable and preferably append-only.
- Prefer meaningful business-facing keys and running document numbers for records users reference, such as `doc_no`, account code, product code, customer code, or supplier code.
- Avoid exposing UUID or opaque surrogate IDs as user-facing identifiers. Use UUID/opaque IDs only as internal primary keys when needed.
- For new target-schema tables, default to `id bigint generated/identity` as the internal primary key unless a documented exception is approved. Keep user-facing identifiers in separate business fields such as `code` or `doc_no`; do not reuse business codes as the database primary key for new design work.
- Store business-facing IDs/codes in canonical uppercase. When a master-data record uses a meaningful running code as its identifier, keep `id` and `code` uppercase and aligned unless a documented legacy reference requires a separate internal ID.
- For party addresses, do not force foreign records into the Thai address hierarchy. Domestic records may use postcode/province/district/subdistrict fields; foreign records must use international address fields such as ISO country code, address lines, city, state/region, and international postal code, with any free-form address note kept as address metadata rather than a general note.
- Use `auth.users` as the authentication source of truth.
- Do not store user passwords in application tables.
- Normalize roles and permissions instead of duplicating permission models.
- Define reconciliation queries for any migrated financial, stock, or transaction data.

## Environment Rules

Environment naming:
- `production`: `fhglqymcdmrgbsbadnwr`
- `sit`: `vbjlkxbytccklhqvxjuu`
- `legacy-prod-source`: `mqsgptraslgpyzbpndlg`
- customer UAT: separate deployment/environment when required

Note: `staging-uat` is a future Supabase environment/project name. Customer UAT promotion uses `uat-origin/main`; `new-origin/uat` was retired on 2026-07-17 and must not be recreated.

Account boundary:
- `production`, `legacy-prod-source`, and future `staging-uat` should be separate Supabase account/project contexts where practical.
- Do not assume access tokens, Auth users, API keys, Storage buckets, or project settings are shared.

Rules:
- `production` (`fhglqymcdmrgbsbadnwr`) is the current Production runtime/database. It is read-only by default; schema or data changes require explicit user approval.
- `sit` (`vbjlkxbytccklhqvxjuu`) is the development, integration, Auth/RLS testing, and schema-validation target.
- `legacy-prod-source` (`mqsgptraslgpyzbpndlg`) is the old customer source and is read-only for audit/migration work.
- For Supabase access, try the project-level MCP server first (`supabase` for current Production, `supabase-prod-source` for read-only legacy source) before falling back to Supabase CLI, `psql`, or direct connection strings.
- If MCP is not visible or not authenticated, report that explicitly and only use CLI/`psql` as a fallback with the target project verified first.
- Do not develop directly against `legacy-prod-source`.
- Do not run destructive operations against `legacy-prod-source` unless the user explicitly asks for it and the command scope is clear.
- Use legacy production DB credentials only for read-only audit, dump, and migration-source work.
- Apply and validate schema changes in `sit` first, then promote/apply them to `production` only with explicit approval.
- Test Supabase Auth and RLS in `sit`, not in Production or plain local Postgres, unless Production verification is explicitly requested.
- Use the approved customer UAT environment for customer/user testing before any Production change.
