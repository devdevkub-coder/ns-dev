# Required Manual-Entry Field Highlighting — 2026-07-19

## Completed checkpoint

Active Next forms now use the customer-approved office/ERP convention for required manual entry:

- editable fields that the user must complete stay pale yellow (`#FFF7CC`) before focus, while focused, and after entry;
- focus keeps the yellow surface and adds the shared blue border/ring;
- validation errors override yellow with the shared red error surface;
- optional, disabled, read-only, calculated, and automatically populated fields remain neutral;
- required select placeholders cannot be selected again after a real value is chosen;
- visible required labels are connected to their controls or required control groups for accessibility.

What is what: yellow identifies data that belongs to the user's required manual-entry workflow. It is not an empty-field warning and does not mean that a saved value is invalid.

Why it has to be like this: office users scan mixed document forms containing manual, reference, calculated, and automatic values. Persistent highlighting makes the fields they own visible throughout the workflow without turning neutral system data into false action items.

## Scope

The audit covered 289 TSX files, including 97 files containing form controls. Confirmed gaps were corrected in PO Buy/PO Sell, shared Master Data, Company Profile, authentication/profile forms, Daily Transfer/Expense, Customer Advance, payment/receipt cancellation flows, LINE settings, Admin Users, Cost Allocator, and WTI/WTO forms. LINE Channel Token, LINE Channel Secret, and Public App URL remain optional because both client and API contracts allow blank values; the PDF Storage Bucket remains required.

## Validation

- Focused required-field regression: `8/8` passed after the final accessibility and PO Sell schema corrections.
- Full ESLint: passed with zero errors and the existing warning in `qa-thai-font.tsx`.
- Production build: passed and generated `308/308` pages.
- Full Vitest: `275/289` passed; the 14 remaining failures are pre-existing and confined to seven Finance/Branch Scope/shared-table test files outside this batch.
- `npm audit`: zero vulnerabilities.
- PO Buy field-level browser evidence passed previously at `C:\tmp\po-buy-required-highlight-post-fix.png`.
- Company Profile browser verification confirmed required fields yellow, optional fields neutral, and no overflow.
- Daily Transfer and shared Master Data opened without console errors or overflow, but their create modals were not detected; no field-level browser claim is made for those two routes.

PO Sell now enforces its already-documented required branch at the shared client/API schema boundary and maps nested item validation back to the exact row fields. No database schema, calculation, permission, or successful document-save behavior changed in this checkpoint.
