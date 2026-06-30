---
trigger: always_on
glob: "*"
description: "Token-light NS Scrap ERP rule router"
---

# Token-Light Rule Router

Do not read root `Peach.md` by default. This file is intentionally small so every agent session does not pay for the old full Peach context.

Read only the relevant rule files for the current task:

| Task type | Read |
|---|---|
| UI, page layout, dark mode, font size, table, modal, form visual work | `docs/agent-rules/ui.md`, `docs/design.md`, and the closest active app reference page |
| LINE share, Flex Message, image carousel, PDF/print notification | `docs/agent-rules/line-notification.md` |
| Plane backlog, issue comments, attachments, status changes | `docs/agent-rules/plane.md` |
| Normal implementation/refactor/migration batch | `docs/agent-rules/development.md`, `docs/agent-rules/workflow.md` |
| Form behavior, API payloads, validation, master data lists | `docs/agent-rules/validation.md` |
| Database, Supabase, schema, migration, seed data | `docs/agent-rules/database.md` |
| Browser QA, UAT screenshots, Playwright | `docs/agent-rules/testing.md`, `docs/agent-rules/sub-agents.md` |
| Git, commit, push, communication, final report | `docs/agent-rules/git-communication.md` |
| Resumable handoff or checkpoint docs | `docs/agent-rules/session-handoff.md` |

Keep the old root `Peach.md` as a deprecated pointer only. If a missing rule is discovered there, move the rule into the correct `docs/agent-rules/*.md` file instead of restoring full-startup Peach loading.
