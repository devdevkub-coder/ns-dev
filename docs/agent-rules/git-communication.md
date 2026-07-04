# Git And Communication Rules

## Git Rules

- Do not revert user changes unless explicitly requested.
- Do not use destructive git commands unless explicitly requested.
- Keep commits focused by phase or module.
- Push only to `new-origin` / `https://github.com/terner/new-ns-scrap-erp.git`.
- Customer UAT promotion currently uses `nserpdev/uat` / `https://github.com/nserpdev-commits/ns-erp.git` when the user explicitly asks to promote to customer UAT.
- Do not use `new-origin/uat` for current customer UAT promotion.
- Treat `origin` / `https://github.com/sirimasth/ns-scrap-erp.git` as legacy read-only reference material only.
- Never push, force-push, create branches, delete branches, open PRs, write tags, or otherwise mutate `origin` / `https://github.com/sirimasth/ns-scrap-erp.git`.
- Use `origin` only for read operations such as fetch, log, diff, show, and checkout-to-inspect.
- Do not commit local tool settings such as `.claude/settings.local.json` unless the user explicitly wants it.

## Communication Rules

When explaining work:
- Be direct and concise.
- Explain tradeoffs clearly.
- Surface risk early.
- State whether a change affects legacy behavior, database structure, or migration assumptions.
