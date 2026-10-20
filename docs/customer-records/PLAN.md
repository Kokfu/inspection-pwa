# Customer-centred history + customer records (accepted 2026-10-20)

## Accepted rules
1. Customer is the anchor. One timeline per customer: Service + Repair visits, newest first, type + status badges, filters (type, status, date, site).
2. Home = open work only, plus a "Recent completed" shortcut into the filtered customer timeline.
3. Technician timeline shows other technicians' visits as summary rows, NOT tappable. Server refuses detail for non-owners. Phone caches summaries only.
4. Technician-created customers are usable immediately, approved or not. Manager "Confirm" only marks the details as verified (no gating).
5. Manager edits permanent customer details. New visits use the latest details. Past visits keep the details they were made with; if the customer changed afterwards, the past visit shows "Customer details updated" and the manager may apply the latest details (explicit, audited, never silent).
6. Typing a customer name warns when it is similar to an existing customer (technician and manager).
7. Manager customer list = Joblogic-style table (search, filters, "Unconfirmed (n)" chip) -> detail page with Details (editable) / Sites / Timeline tabs. Technician has picker only.

## UPDATE 2026-10-20 (supersedes rule 5 below and build step 5)
Decision: customers stay a LIVE reference. Editing a customer changes the details on all records, past and future. No snapshots, no "Apply latest" action, no migration for this. Accepted trade-off: regenerating an old report/PDF shows current customer details. Customer edits are audited instead. See PROGRESS.md for the step list and PROMPTS.md for the per-step prompts.

## Open verification (before any schema change)
- `customers` already has a unique index on lower(btrim(display_name)) for active rows (migration 016). Exact duplicates are already blocked; the warning is for NEAR matches (client + server-side check, no migration).
- Visits reference `customer_id` (live). Final report history (migration 014) shows no customer snapshot. Confirm whether reports/PDFs read the live customer. If yes, rule 5 needs a snapshot of customer details per visit/final report; this is the one likely migration. Decide with the user before adding it.
- "Confirmed" flag on customers: check whether an existing column/proposal table can carry it; otherwise a small migration is justified.

## Build order
1. Shared visit row + unified read-only query (service + repair, `kind` field). No schema change.
2. Customer timeline; non-owner rows non-tappable; server detail guard + test.
3. Manager customer table + detail page + audited edit.
4. Confirmed/unconfirmed flag + near-duplicate name warning.
5. Details-version badge on past visits + manager "apply latest" (needs the snapshot decision).
Merge-duplicates is deferred (not in v1).
