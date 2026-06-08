# Expense Dashboard Flow

## Purpose

`/daily/expense-dashboard` is a read-only monitoring dashboard for daily expenses. It helps users compare expense categories across recent months and detect unusually high or low expense movement.

This page does not create, edit, approve, pay, cancel, export, or repair expense documents. Expense entry and document ownership stay with `/daily/expense` and the daily money-flow pages.

## Legacy Baseline

Legacy source: `old-apps/legacy/index.html`, component `view-expenseDashboard`.

The active Next page must preserve the legacy dashboard calculation unless a later requirement explicitly changes the target behavior:

- Period selector supports `3`, `6`, and `12` months, with `6` months as the default.
- Month columns are the last selected number of months, oldest first.
- Category buckets are built from active expense categories plus `_uncat` / `ไม่ระบุหมวด`.
- Expense grouping uses the header-level expense category, not line-level categories.
- Expense amount per row is `amount + vat`.
- Heatmap rows are filtered to categories with total amount greater than zero and sorted by total amount descending.
- Anomaly rules match the legacy thresholds.

## Data Inputs

- `rows`: expense rows returned by `GET /api/daily/expenses`.
- `categories`: expense category master data returned by `GET /api/master-data/expense-categories`.
- `periodMonths`: dashboard selector value, one of `3`, `6`, or `12`.
- Current month is derived from the active app date helper, then converted into a `YYYY-MM` month list.
- The active app date helper uses business timezone `Asia/Bangkok`, so the dashboard year/month rolls over by Thai business date instead of UTC date.

The dashboard uses the rows returned by the expense API without adding another status filter in the client. If cancelled-expense exclusion becomes a business requirement, it must be specified in the source API contract or documented as an explicit dashboard rule change.

## Calculation Contract

1. Build `monthList` as the last `periodMonths` months in `YYYY-MM`, oldest first.
2. Build one row bucket for every active category where `active !== false`.
3. Add `_uncat` / `ไม่ระบุหมวด` as a fallback bucket.
4. For each expense row:
   - Skip the row if it has no date.
   - Use `row.date.slice(0, 7)` as the month key.
   - Skip the row if the month is outside `monthList`.
   - Use `row.categoryId` only when it exists in the active category bucket map; otherwise use `_uncat`.
   - Add `(Number(row.amount) || 0) + (Number(row.vat) || 0)` into that category/month bucket.
5. For each category bucket:
   - `total` is the sum of all selected months.
   - `avg` is `total / periodMonths`.
   - `latest` is the value in the last month of `monthList`.
   - `deviation` is `((latest - avg) / avg) * 100` when `avg > 0`; otherwise `0`.
   - `anomaly = high` when `avg > 0` and `latest > Math.max(avg * 1.5, 5000)`.
   - `anomaly = low` when `avg > 0`, `latest > 0`, and `latest < avg * 0.3`.
   - Otherwise `anomaly = null`.
6. Filter out buckets where `total <= 0`.
7. Sort visible category rows by `total` descending.
8. Compute `grandByMonth`, `total`, `avg`, `latest`, previous month total, and `vsAvg` from visible category rows.

Important: even though `/daily/expense` supports multi-line expense entries, this dashboard intentionally follows legacy behavior and uses `row.categoryId`, `row.amount`, and `row.vat` at the expense header level. A future line-level dashboard must be documented as a separate target behavior change.

## Date / Year Rollover

The dashboard does not hardcode the year. It derives the current month from `todayDateInput()`, which returns the current date in `Asia/Bangkok` as `YYYY-MM-DD`.

Effects:

- On a new calendar year, the dashboard month list changes automatically from the Thai business date.
- Near midnight, the dashboard follows Thailand date rollover, not UTC rollover.
- The same helper is also used by daily/finance/stock form defaults that import `todayDateInput()`, such as default payment date, transfer date, due date, and some default report filters.
- Export filenames and unrelated utilities that call `new Date().toISOString()` directly are outside this dashboard flow and are not changed by this document.

## UI Contract

- The global app shell/topbar owns the page title. Do not add a duplicate hero title block inside the page.
- Period control label: `📅 ดูย้อนหลัง:`.
- KPI cards:
  - `💸 รวม {periodMonths} เดือน`
  - `📈 เฉลี่ย/เดือน`
  - `📅 เดือนนี้`
  - `เทียบเฉลี่ย`
- Anomaly panel:
  - When anomalies exist, show `🚨 ตรวจพบความผิดปกติ {count} หมวด`.
  - High anomaly label: `⬆ สูงผิดปกติ`.
  - Low anomaly label: `⬇ ต่ำผิดปกติ`.
  - When no anomalies exist, show `✓ ไม่พบความผิดปกติ — ค่าใช้จ่ายแต่ละหมวดอยู่ในช่วงค่าเฉลี่ย`.
- Heatmap table columns:
  - `หมวด`
  - selected month labels
  - `เฉลี่ย`
  - `รวม`
  - `สถานะ`
- Table status labels:
  - `⬆ สูง`
  - `⬇ ต่ำ`
  - `✓ ปกติ`
- Footer row label: `รวมทุกหมวด`.
- Note text must explain the legacy rule: current month is high when it is more than `1.5×` average and over `5,000`, or low when it is less than `30%` of average.

## Non-Goals

- No write action from this page.
- No payment approval or payment voucher action from this page.
- No row repair or migration fallback logic in the client.
- No line-level expense category split unless the business flow is changed and this document is updated first.

## Validation Checklist

- Changing `3`, `6`, and `12` months updates the month columns, KPI totals, averages, and anomaly calculations.
- Empty data shows no anomaly and no fake category rows.
- Header-level category grouping matches the legacy dashboard.
- Amount math uses `amount + vat`.
- High and low anomaly thresholds match the legacy rules.
- Thai wording and labels match this document.
- The page remains horizontally scrollable only inside the heatmap table on narrow screens; the page shell itself should not create accidental mobile overflow.
