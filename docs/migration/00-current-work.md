# 00 Current Work

## WTI/WTO chooser scroll-lock and weight-field alignment — 2026-08-03

- Active branch/worktree: `codex/weight-ticket-camera-gallery-20260803` in the isolated weight-ticket worktree; do not alter the dirty primary workspace.
- Objective: keep the WTI/WTO image source chooser from moving the form behind it, and align the three weight inputs on mobile without changing calculation, upload, API, DB, Storage or cache contracts.
- Expected write areas: `WeightTicketAttachmentGrid*`, `WeightTicketFormCore*`, WTI/WTO flow/page-flow notes and this daily tracker.
- Proven so far: focused suites `34/34`; targeted/workspace lint, type-check, SIT-env Webpack build `331/331` routes and diff review passed; Codex Browser mobile geometry shows all three inputs at `40px` with the same top; repeated live open/close keeps the form scroller at `82 -> 82` after excluding locator actionability scroll; no browser console errors; fresh-context acceptance verdict `ACCEPTED`.
- Required before publish: final fetch/semantic integration check against latest `sit-origin/main`, commit/push and remote SHA verification.
- No Plane issue mapping is known for this follow-up; do not invent one.
