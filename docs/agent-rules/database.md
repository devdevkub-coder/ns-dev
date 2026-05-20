# Database Rules

## Schema Direction

- The current database dump is a baseline and migration source, not the final target model.
- Prefer relational structure over transaction-critical `jsonb`.
- Split transaction headers and lines.
- Use real foreign keys where practical.
- Keep ledger-style tables traceable and preferably append-only.
- Prefer meaningful business-facing keys and running document numbers for records users reference, such as `doc_no`, account code, product code, customer code, or supplier code.
- Avoid exposing UUID or opaque surrogate IDs as user-facing identifiers. Use UUID/opaque IDs only as internal primary keys when needed.
- Store business-facing IDs/codes in canonical uppercase. When a master-data record uses a meaningful running code as its identifier, keep `id` and `code` uppercase and aligned unless a documented legacy reference requires a separate internal ID.
- Use `auth.users` as the authentication source of truth.
- Do not store user passwords in application tables.
- Normalize roles and permissions instead of duplicating permission models.
- Define reconciliation queries for any migrated financial, stock, or transaction data.

## Environment Rules

Use a separate Supabase dev/target project for development, auth testing, RLS testing, and frontend integration.

The customer's old production Supabase should be treated as a legacy source system only.

Environment naming:
- `dev-target`: `fhglqymcdmrgbsbadnwr`
- `legacy-prod-source`: `mqsgptraslgpyzbpndlg`
- `staging-uat`: not created yet
- `new-prod`: not created yet

Account boundary:
- `dev-target`, `legacy-prod-source`, and future `staging-uat` should be separate Supabase account/project contexts where practical.
- Do not assume access tokens, Auth users, API keys, Storage buckets, or project settings are shared.

Rules:
- For Supabase access, try the project-level MCP server first (`supabase` for `dev-target`, `supabase-prod-source` for read-only legacy source) before falling back to Supabase CLI, `psql`, or direct connection strings.
- If MCP is not visible or not authenticated, report that explicitly and only use CLI/`psql` as a fallback with the target project verified first.
- Do not develop directly against `legacy-prod-source`.
- Do not run destructive operations against `legacy-prod-source` unless the user explicitly asks for it and the command scope is clear.
- Use legacy production DB credentials only for read-only audit, dump, and migration-source work.
- Apply schema changes to `dev-target` first.
- Test Supabase Auth and RLS in `dev-target`, not in plain local Postgres.
- Use future `staging-uat` for customer/user testing before any production cutover.
- Final production target is open: either validated migration back into the customer's old environment or a new production Supabase project.
