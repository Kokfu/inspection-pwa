# Customer-centred history — progress

Last updated: 2026-10-20 (plan accepted; no code started)

RULE: whoever finishes a step MUST update this file in the same task: status, date, files changed, tests run, findings, limitations. Do not mark Done with an open P0/P1. Git is handled by the user.

Status values: Not started | In progress | Blocked | Review | Done

## Decisions (final)
- D1 Customer is a LIVE reference. Editing a customer changes the details on all records, past and future. No snapshots, no "apply latest" step.
- D2 Technician-created customers are usable immediately. Manager "Confirm details" only marks them verified; nothing is gated on it.
- D3 Exact duplicate names are already blocked (migration 016 unique index on lower(btrim(display_name))). Only near-match warning is new.
- D4 Technician sees other technicians' visits as summary rows only, not tappable. Server refuses detail for non-owners.
- D5 Home = open work + "Recent completed" shortcut into the customer timeline filtered to Completed.
- D6 Merge-duplicates is out of scope for v1.
- D7 Customer edits must be audited (who, when, old -> new). If no audit table exists, the step stops and asks before adding a migration.

## Steps and waves
Steps in the same wave touch different files and may run in parallel chats. Run waves in order.

| Wave | Step | Title | Depends on | Schema change? | Status | Updated |
|---|---|---|---|---|---|---|
| A | S1 | Shared visit row + unified Service/Repair read query | none | No | Not started | |
| A | S3a | Manager customer table + detail (Details, Sites) + audited edit | none | Maybe (audit) | Not started | |
| A | S4 | Near-duplicate customer name warning | none | No | Not started | |
| B | S2 | Customer timeline + non-owner guard | S1 | No | Not started | |
| B | S5 | Confirmed flag + Unconfirmed chip + Confirm action | S3a | Likely (flag) | Not started | |
| C | S3b | Timeline tab inside manager customer detail | S2, S3a | No | Not started | |
| C | S6 | Technician Home: Open work + Recent completed shortcut | S2 | No | Not started | |
| D | S7 | Verification, phone check, docs | all | No | Not started | |

## Step log
(Append an entry per step when work happens. Format below.)

### S? — <title>
- Status:
- Date:
- Files changed:
- Behaviour changed:
- Tests run:
- P0/P1/P2 findings:
- Limitations / next:

## Open questions
- Does any audit table already exist for customer edits? (S3a to check first)
- Confirmed flag: can an existing column carry it, or is a migration justified? (S5 to check first)
