# Peach.md Deprecated Router

`Peach.md` is no longer the mandatory startup context for NS Scrap ERP agents.

Why: the old file mixed UI standards, Plane workflow, notification rules, and historical notes into one large document. Reading it on every task wastes token budget and makes agents carry unrelated context.

Use the task-specific rule files instead:

| Task type | Read |
|---|---|
| UI, layout, dark mode, font, tables, modals | `docs/agent-rules/ui.md` |
| LINE, Flex Message, PDF, share success behavior | `docs/agent-rules/line-notification.md` |
| Plane backlog, comments, attachments, issue status | `docs/agent-rules/plane.md` |
| General implementation lifecycle | `docs/agent-rules/workflow.md` |
| Database and Supabase | `docs/agent-rules/database.md` |
| Validation and forms | `docs/agent-rules/validation.md` |
| Browser QA / UAT | `docs/agent-rules/testing.md` |
| Git and final communication | `docs/agent-rules/git-communication.md` |

Do not add new working rules here. Put them in the smallest matching file under `docs/agent-rules/`.
