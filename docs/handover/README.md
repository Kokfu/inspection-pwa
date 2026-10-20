# Inspection PWA — Client Handover Documentation

Last written: 2026-10-20 from the source code on branch `phase-8e-client-demo-polish`.

This folder is the handover pack for the Inspection PWA: an offline-first web app that
technicians use on their phones to record fire-system service visits and repair visits, and
that managers use in an office browser to set up customers, review work, approve reports
and send email reminders.

## Read in this order

| # | File | Who needs it | What it covers |
|---|---|---|---|
| 1 | [01-accounts-and-access.md](01-accounts-and-access.md) | Owner / IT contact | The three account types, how to **create / reset / change / retire a Manager account**, how a Manager creates and removes Technician and Admin accounts, password rules |
| 2 | [02-user-guide.md](02-user-guide.md) | Everyone (by role) | Every feature in plain language: service visits, repair visits, approvals, reports, email reminders, settings |
| 3 | [03-offline-and-online.md](03-offline-and-online.md) | Everyone, especially technicians | What works without internet, what does not, how syncing works, what the status messages mean, what never to do |
| 4 | [04-operations-and-maintenance.md](04-operations-and-maintenance.md) | IT contact / office PC custodian | Starting and stopping, daily/weekly checks, backups, updates, where files live, what to do after a power cut |
| 5 | [05-handover-checklist-and-suggestions.md](05-handover-checklist-and-suggestions.md) | Owner (you) | What still has to be filled in or decided before handing over, known limits, and suggested extra documents |

## The one thing to understand first: role names

The screen names and the database names for the roles differ. This causes the most confusion,
so learn this table before anything else.

| What the person sees on the sign-in card | Database role (`users.role`) | Can do |
|---|---|---|
| **Manager** | `admin` | Everything: staff accounts, customers, services, settings, email, approvals, corrections |
| **Admin** | `supervisor` | Review only: approve reports/proposals, correct accepted records. Sees only the technicians assigned to them. Cannot manage staff or settings. |
| **Technician** | `inspector` | Field work: create visits, fill forms, take photos, submit |

In this documentation, "Manager" always means the full-access account (`admin` in the
database), and "Admin" always means the review-only account (`supervisor` in the database).
Commands such as `createAdmin.js` and `resetAdminPassword.js` create and reset **Manager**
accounts, despite their file names.

## Other documents already in the repository

These existed before this pack. They are more detailed and are linked from the relevant pages here.

| Document | Use |
|---|---|
| [docs/client/USER_GUIDE.md](../client/USER_GUIDE.md) | Older, longer user guide (updated 10 Oct 2026). Does **not** cover the Approvals hub, Settings hub, Repair Visit redesign or offline visit creation. Use this pack for those. |
| [docs/client/ADMIN_ACCOUNT_RECOVERY.md](../client/ADMIN_ACCOUNT_RECOVERY.md) | Account recovery steps (also summarised in file 01) |
| [docs/client/EVIDENCE_POLICY.md](../client/EVIDENCE_POLICY.md) | Photo and evidence rules |
| [docs/client-install-and-public-access.md](../client-install-and-public-access.md) | First install on the client PC, domain, Cloudflare Tunnel or static IP |
| [docs/operations/backup-and-restore.md](../operations/backup-and-restore.md) | Backup and restore scripts |
| [docs/operations/service-due-email.md](../operations/service-due-email.md) | Email reminder operations and key custody |
| [docs/architecture/](../architecture) | Design decisions, security, offline contract, sync protocol (for developers) |
| [HANDOVER.md](../../HANDOVER.md) | Developer-facing live status log. Not for the client. |

## What was and was not verified

Everything here was written from reading the source code, the existing documentation and the
test records. Nothing in this pack was re-tested on the client's PC. Items that depend on the
client (domain, Gmail account, support contact, backup location) are marked **[FILL IN]**.
File 05 lists them all in one place.
