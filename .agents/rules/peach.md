---
trigger: always_on
glob: "*"
description: "Peach: AcexPOS UI Standard, Git & Scope Rules"
---

# Peach UI Guidelines & Reference (AcexPOS Style)

- **MANDATORY STARTUP CHECK:** Every time you start a new conversation session, before doing any other work, checking files, or proposing changes, you MUST read the root Peach.md, .agents/rules/peach.md, and .agents/rules/ponytail.md using the view_file tool to ensure all UI standards, developer guidelines, operation constraints, and Ponytail lazy-mode coding rules are fully loaded.

## 🎨 AcexPOS UI Standard

### 1. KPI / Metric Summary Cards
- **No Outer Wrapper Card:** Never wrap summary cards in an outer wrapper (e.g., `bg-slate-50 border-slate-200`). Render cards directly on the main background layout grid.
- **Metric Cards Style:** `bg-white shadow-sm border border-slate-200 rounded-xl` with circular pastel background icons on the left, and values + labels on the right.
- **No Left-border Accents:** Avoid left-border color highlights/borders on cards.
- **Financial Status Colors:** If margin/diff is 0, use neutral gray (`bg-slate-100 text-slate-600` for icon, `text-slate-900` for number). Do not use green or red for zero values.
- **Mobile Viewport Grid:** Display as 2 columns on mobile/tablet viewports to avoid long vertical stacks. 5th card spans 2 columns for symmetry.

### 2. Filters & Toolbar
- **Desktop Actions Right-aligned:** Align primary actions (Refresh, Export Excel, Create) to the top-right of the filters row using `ml-auto`.
- **Mobile Responsive:** Use bottom sheets or filters drawers for mobile, separating desktop and mobile toolbar layouts.

### 3. Data Table & Grid
- **Lined Table Style (/purchase/bills style):** Desktop main table must use thin row dividers (`divide-y divide-slate-100`), soft borders (`border border-slate-200 shadow-sm rounded-md`), and gentle hover highlights (`hover:bg-slate-50`). No thick black lines.
- **Resizable & Sorting Columns:** Every main and sub data table on Desktop must support resizable column widths (using `useResizableColumns` and `<ResizableTableHead>`) and column sorting. A "Reset Table Widths" button must be provided to restore column widths to their defaults.
- **Mobile Table Parity:** Hide desktop tables on small viewports and render a compact vertical card list instead.
- **Focus Rings:** Remove default browser black focus rings (add `outline-none` or customize globally).

### 4. Modals & Forms
- **Dark Header:** Use `bg-slate-900` background and `text-white` for modal headers.
- **Form Footer:** Cancel (text-only) and Confirm (solid button, e.g., `bg-[#0F172A] hover:bg-[#1E293B]`) buttons must align to the bottom-right.
- **No Dialog Borders:** Remove outer white/gray borders from modals; rely on soft shadows (`shadow-2xl`) for depth.

### 5. User Specific Preferences
- **No Black Borders/Outlines:** Use soft pastel borders (`border-slate-100` or `border-slate-200/60` for tables, `border-slate-300` for inputs/filters). Remove focus outlines.
- **Font & Controls:** Use `Noto Sans Thai` for all UI controls (`button`, `input`, `select`, etc.) matching the body font. Never use `font-sans`.
- **Control Sizing:** Height should be `h-9` to `h-10` with `text-sm` for desktop filters. Mobile card list text must not be smaller than `text-xs`.
- **Batch Print Button Style:** Action buttons for printing multiple selected documents (Batch Print) must use a premium orange/amber style (`bg-amber-600 hover:bg-amber-700 text-white`) and be placed in the table header bar next to pagination controls.
- **Prevent Form Editing Standard:** For financial documents (such as Receipt Vouchers), once a document has been created, fields like "วิธีจ่าย/รับเงิน", "วันที่" and the referenced lines table (add line, delete line, choose bills dropdowns) must be disabled in Edit Mode to prevent accidental modification of saved data.
- **Spin Buttons Removal:** Remove default spin buttons (up/down arrow controls) from numeric inputs in tables (amount, withholding tax, discounts) using Tailwind utility classes (`[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`).

---

## 🚫 Git & Scope Rules
- **No Master Data / Product Creation:** Do not insert new products or test master records. Use existing database records.
- **Strict Scope Control:** Perform only explicitly requested changes. No proactive refactoring or upgrades outside the task scope.
- **Local Validation Only:** Test compilation locally (`type-check`, `lint`, `build`). Do not run browser UAT unless explicitly requested.
- **No Self-Commits/Push:** Only modify files locally. Do not run `git commit` or `git push` unless explicitly ordered by the user.
- **UAT Sync Branch:** Push to `new-origin dev` branch for deployment and QA (no need to push to `uat` or `main`).
- **Fail-Fast Policy:** Stop and ask if there's type conflicts, compilation failures, or database mismatches.
- **Daily Checklist:** Always create/update a daily task checklist (e.g. `task17-06-26.md`) before making edits.
- **Final Flow Summary:** Write/update flow docs in `docs/notes/` describing entities and rationale when business flows are completed or UAT tested.
- **Workspace Cleanliness:** Run `git status` to clean temporary files and only stage related code changes before proposing commits.
- **Plane Workflow Standard (ขั้นตอนการทำงานบน Plane):**
  For tasks tracked on Plane (https://plane.devkub.com/), follow this workflow:
  1. **Backlog -> Todo**: If a ticket assigned to us is in **Backlog**, move it to **Todo**.
  2. **Todo -> In Progress**: When starting development/coding, move it to **In Progress**.
  3. **In Progress -> Wait for test**: Once coding and local testing/validation are complete, move the ticket to **Wait for test**, write a Thai summary comment explaining the changes, and attach a UAT screenshot showing the result.

