# Production permission migrations synced to SIT — 2026-08-05

- Source: Production database `fhglqymcdmrgbsbadnwr`
- Target: SIT database `vbjlkxbytccklhqvxjuu`
- Applied in order: `20260804110000`, `20260804130000`, `20260804140000`, `20260804150000`
- Scope: coordinator, sorting department, and production department role permissions only
- No application tables, transaction rows, or production database objects were changed
- Postflight: relevant role grants match Production `82/82`; migration history matches `194/194`
- The apply used a controlled transaction from the Production migration SQL. The legacy SIT migration-history drift was left unchanged outside these four versions.
