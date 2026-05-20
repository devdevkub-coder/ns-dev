# Development Rules

## Architecture Direction

Current active implementation/deploy target:
- Next.js app under `apps/next/`

Historical/target rehabilitation notes still describe the earlier Vue/Vite direction and remain useful for legacy comparison, but active implementation work in this repo currently happens in `apps/next/` unless explicitly redirected.

Historical target stack:
- Vue 3
- Vite
- TypeScript
- Vue Router
- Pinia
- TanStack Query
- Tailwind CSS
- Zod
- VueUse
- Supabase Auth / Postgres / Storage
- IndexedDB / Dexie only where offline or local cache is required

## Legacy Source Rules

- The old application is archived locally under `old-apps/legacy/`; this path is ignored by git.
- The audited Vue/Vite baseline lives locally under `old-apps/vue/`; this path is ignored by git.
- The active deploy target currently lives under `apps/next/`.
- Do not route to, import, or execute `old-apps/legacy/` from the active app.
- Use `old-apps/legacy/` and `old-apps/vue/` only as source material: copy the necessary function/module into the active app, then refactor it into the new structure.
- Preserve the existing UI appearance and business flow where possible while implementing it in the new app.
- For clone/migration batches, match the legacy/Vue visual surface first: cards, colors, banners, table density, button placement, labels, spacing, and compactness are part of the baseline. Do not redesign these surfaces unless the deviation is documented and approved. If the Vue clone has been simplified or has known column/layout drift, use `old-apps/legacy/` as the stronger baseline.
- Default list-table visual pattern for legacy-style pages is a white rounded card with horizontal overflow (`bg-white rounded-xl shadow overflow-x-auto`), compact zebra table (`w-full text-sm table-zebra`), slate header (`bg-slate-100 text-slate-700`), row separators (`border-t border-slate-100`), and the existing blue/red text action buttons unless the legacy source shows a stronger page-specific treatment.
- Refactor by module and by risk, not by wholesale replacement.
- Large refactors must be split into reviewable batches with one clear module, transform, or behavior change per batch.

## Migration Priority

Work must generally follow this order:
1. Project structure and development foundation
2. Security, users, roles, permissions
3. Master data
4. Key basic data
5. Core transactions
6. Inventory and stock logic
7. Finance and operational controls
8. Advanced modules
9. Reporting and cutover

Do not start heavy transaction migration before master data and key basic data are defined and validated.

## Code Organization

Historical Vue/Vite structure:

```text
src/
  router/
  views/
  components/
  stores/
  composables/
  services/
  queries/
  schemas/
  lib/
```

Layer responsibilities:
- views: page composition
- components: reusable UI
- stores: client/app state only; do not store server cache or direct database access here
- queries/services: data access and mutations
- schemas: validation
- lib: pure utilities

Business logic should not be embedded in templates.
