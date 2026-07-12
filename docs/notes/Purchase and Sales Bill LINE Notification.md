# Purchase and Sales Bill LINE Notification

## Scope

This flow sends a LINE Flex Message after a new bill is saved successfully from:

- `/purchase/bills` -> document type `PB` -> configured Purchase Bill LINE group
- `/sales/bills` -> document type `SB` -> configured Sales Bill LINE group

WTI/WTO notifications remain owned by the confirmed weight-ticket flow and route to the configured receipt/delivery group.

## What is what

- `line_targets` is the registry of LINE groups known through the webhook.
- `line_notification_rules` maps document types (`WTI`, `WTO`, `PB`, `SB`) to a target group.
- `line_notification_jobs` is the post-commit delivery queue and retry record.
- `line_notification_attempts` records each delivery attempt.
- `purchase_bill` and `sales_bill` are notification source types; `PB` and `SB` are the routing document types.

## Trigger and failure policy

The trigger is the successful create transaction only. Editing, cancelling, paying, receiving payment, or replacing a supplier does not send another card in this scope.

Notification work runs after the bill transaction commits. A LINE or routing failure must not roll back a valid bill. Failed delivery stays visible in the existing LINE job/attempt history and follows the existing retry policy.

## Routing contract

| Document type | Intended target |
|---|---|
| `WTI`, `WTO` | Receipt/delivery group |
| `PB` | Purchase Bill group |
| `SB` | Sales Bill group |

PB/SB use explicit rules only. If no matching rule exists, the system creates no delivery job; it must not fall back to a default target or broadcast to every active group. This fail-closed rule prevents financial documents from leaking into the wrong LINE group.

The same LINE Official Account can be invited to all groups. Each group is registered by its own LINE target ID after the bot receives a webhook event.

## Flex Message content

Both cards use the same compact dark-card language while keeping bill-specific labels.

- document type, document number, document date, and counterparty
- branch and warehouse/channel information when available
- at most five product rows, followed by an `อีก N รายการ` summary
- bill total and actual paid/received balance state
- button linking to `/purchase/bills/[docNo]` or `/sales/bills/[docNo]`

Do not include tax IDs, bank accounts, COGS, gross profit, or other internal cost fields in LINE messages.

## Why it has to work this way

The saved PB/SB is the business event that establishes AP/AR and is therefore the earliest reliable notification point. Routing by document type keeps operational weight tickets separate from financial bills. Queueing and retry keep LINE availability outside the bill transaction, so an external messaging outage cannot damage ERP data.

## Configuration checklist

1. Invite the existing LINE bot to the receipt/delivery, Purchase Bill, and Sales Bill groups.
2. Send a message in each group so the webhook registers its target ID.
3. In `/admin/line-settings`, create explicit rules for `WTI,WTO`, `PB`, and `SB` and select the intended target for each rule.
4. Set `stop after match` for the one-group-per-document policy.
5. Create one PB and one SB in the development target and verify the job, attempt log, target group, and detail link.

## Dev-target verification (2026-07-13)

Dev-target `fhglqymcdmrgbsbadnwr` uses the active LINE target named `ทดสอบ` as the temporary destination for three separate rules:

- `WTI,WTO` -> `ทดสอบ`
- `PB` -> `ทดสอบ`
- `SB` -> `Peach, NAMPEC Official, Meng Watcharathat🤖`

Split-group live delivery verification succeeded for Purchase Bill `PB012607-0013` and Sales Bill `SB2607-0011`. Both jobs reached `status = sent` and recorded one successful attempt; PB resolved to `ทดสอบ` while SB resolved to `Peach, NAMPEC Official, Meng Watcharathat🤖`. These are temporary test mappings; change only each rule's target when the dedicated customer groups are registered.
