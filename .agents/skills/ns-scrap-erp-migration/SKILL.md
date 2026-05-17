---
name: ns-scrap-erp-migration
description: Project-specific shortcut for NS Scrap ERP rehabilitation, database redesign, Supabase Auth/RLS, schema mapping, migration planning, reconciliation, and phase prioritization. Use in this repo when a task affects DB model, migration docs, Supabase environments, master data, auth/permissions, or migration assumptions; read AGENTS.md as the central source of truth.
---

# NS Scrap ERP Migration

This is a project-level trigger shortcut. Do not duplicate project rules here.

## Workflow

1. Read `AGENTS.md` first. It is the central source of truth for project rules.
2. Read the required docs listed in `AGENTS.md` for the task type.
3. Use `SRS.md` for requirements and target scope.
4. Use `docs/migration/` for migration planning, schema mapping, reconciliation, rollout, and environment status.
5. Use `.mcp.json` only to understand project-level MCP routing; never place secrets there.

## Reviewable Batch Migration Pattern

Use this pattern for large refactors, legacy-to-Vue migration, schema cleanup, test migration, or repeated transforms.

1. Define one precise transform or module slice. Do not mix unrelated changes.
2. Scope the blast radius with `rg`, file lists, schema inventory, or menu/module mapping.
3. Work in reviewable batches by module, table group, route group, or file set.
4. Keep a local progress list or task document when a migration spans multiple batches.
5. Run targeted validation after each batch and broader validation at phase boundaries.
6. Document any behavior, DB, Auth/RLS, permission, or reconciliation assumption that changes.

Good batch boundaries:

- one master data module
- one route/menu group
- one transaction header/line redesign
- one permission/auth flow
- one import/export flow
- one repeated code transform

Avoid:

- framework migration plus DB redesign in the same batch
- formatting-only changes mixed with business logic changes
- broad rewrites without a validation checkpoint
- global rollback thinking; each batch should be independently reviewable

## Boundary

If this skill conflicts with `AGENTS.md`, follow `AGENTS.md` and update this shortcut if needed.
