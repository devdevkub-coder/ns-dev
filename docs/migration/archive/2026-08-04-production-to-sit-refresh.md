# Production to SIT database refresh — 2026-08-04

- Source: current Production database `fhglqymcdmrgbsbadnwr`.
- Target: SIT database `vbjlkxbytccklhqvxjuu`; the previous SIT data was intentionally overwritten.
- Restored scope: `public`, `maintenance`, `supabase_migrations`, `auth.users`, and `auth.identities`.
- Postflight reported matching counts for 172 public tables, 56 Auth users, 25 app users, 254 products, 59 customers, and 1,914 suppliers.
- Excluded by design: transient Auth sessions/tokens/MFA rows and Storage binary objects. Public audit counts may differ because verification creates audit traffic.
- No application code or Production database schema was changed by this refresh.
