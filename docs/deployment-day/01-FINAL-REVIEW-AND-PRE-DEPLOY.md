# 1. Final review and pre-deploy checklist (developer only)

> Written 2026-10-22 from branch `phase-8e-client-demo-polish` (`2bd9b1a` + uncommitted review work). This folder
> is **for you, the developer**, and never reaches the client (`.gitattributes` export-ignore). The client
> receives the [Client Handover Pack](../handover/README.md) and the [Office PC Technical Guide](../it-guide/README.md).
>
> Read in order: **this file** (before the remote session) → [02 Deploy-day checklist](02-DEPLOY-DAY-CHECKLIST.md)
> (during it) → [03 Emergency runbook](03-EMERGENCY-RUNBOOK.md) (keep open the whole time).

## 1.1 Verdict

**Ready for a pilot install on the client PC** once the Git steps in 1.5 are done and the deploy-day risks R-1 and
R-2 are handled. Code-wise there is no open P0/P1: the final retest (2026-10-22) re-verified the only P1 (FR-12,
Portable Fire Extinguisher sync) on a real phone over `https://app.mfets.com`; gates passed (API 794/794,
Playwright 787 + 2 load flakes that pass alone, V7 live gate 2/2).

Never done yet (deploy day proves it): an install on the client's PC, the client's tunnel pointing at that PC, a
reboot of that PC, a backup + restore drill there, and the client's own phones.

## 1.2 Deploy findings from this review

| # | Sev | Finding | Status / what to do |
|---|---|---|---|
| R-1 | **P1** | `app.mfets.com` is live on your **dev PC**. If the client PC joins the same tunnel while the dev PC is connected, Cloudflare splits traffic between two databases. | Open. Cut over first: [02 §B](02-DEPLOY-DAY-CHECKLIST.md#b-cut-over-the-hostname-from-the-dev-pc-before-the-session). |
| R-2 | **P1** | Test phones hold dev data and a dev session for `app.mfets.com`. | Open. Clear site data on those phones ([02 §B](02-DEPLOY-DAY-CHECKLIST.md#b-cut-over-the-hostname-from-the-dev-pc-before-the-session)). |
| R-3 | **P1** (backup) | `Backup-Database.ps1` + `Backup-Uploads.ps1` skip `runtime\operational\` (letterhead, logo, e-mail key). | **Fixed:** `scripts/Backup-All.ps1` (tested on the dev stack). Schedule it on deploy day. |
| R-4 | P2 | `Prepare-ClientPC.ps1` crashed under `powershell -File`. | **Fixed.** |
| R-5 | P2 | Docker Desktop starts only after a Windows sign-in, so after a power cut the system stays down until someone signs in. | Decide on deploy day: Autologon + screen lock, or a named person. Record it in handover chapter 10.4. |
| R-6 | P2 | `docker compose config` without `--quiet` prints `.env` secrets; `Update-System.ps1` did that. | **Fixed:** `Update-System.ps1` now validates with `--quiet` and prints the update checklist. Still never run `config` without `--quiet` on a shared screen. |
| R-7 | P2 | `Health-Check.ps1` default (`https://localhost`) fails in tunnel mode. | Use the public URL or the Host-header `curl` in [03 §2](03-EMERGENCY-RUNBOOK.md#2-quick-health-commands). |
| R-8 | P2 | Base images not pinned to a patch (`node:22-alpine`, `caddy:2-alpine`). | Accepted for now; compare `docker image ls` if the client build behaves differently. |
| R-9 | P3 | Stale docs (FR-12 "NO-GO", reactivate, deploy status). | **Fixed.** |
| R-10 | P3 | Tracked junk: `README.md.txt` and a stray root file of captured Git output. | **Deleted** (commit the deletions). |
| R-11 | P2 | Client PC would have received every developer file (docs, test records, agent notes, test scripts). | **Fixed:** `.gitattributes` + `scripts/dev/Publish-ClientRelease.ps1` publish a `client-release` branch with client files only (1.5). |

## 1.3 Project items still open (not tunnel, not Docker)

Nothing below blocks go-live. Decide each one consciously; items marked **Before** are worth doing first.

| # | Item | Type | Recommendation |
|---|---|---|---|
| P-1 | **Customer master data.** Production starts with zero customers and there is no spreadsheet import. Every customer, site, fire system, zone/location and preset row must be entered by a Manager before technicians can create visits. | Data | **Before.** Agree who enters it and when; budget hours per customer. Offer CSV import as paid follow-up if the list is long. |
| P-2 | **Company letterhead.** The built-in profile is `confirmed: false` with an empty "verified by" name/title, and the default logo file `mfe-logo.png` is **not in the repository**, so fresh-install PDFs have no logo until one is uploaded. | Config | **Before.** On deploy day: Settings → Company Profile, upload the real logo, fill "verified by", tick confirmed. Get the logo PNG from the client beforehand. |
| P-3 | **Report numbers restart at 0001** (`MFE/SR/2026/0001`, `MFE/RR/2026/0001`) on the new database. The service-report prefix is editable in Settings → Company Profile; the starting number is not. | Decision | **Before.** Ask the client for the last paper number. No code change needed: one SQL line on deploy day sets the year's counter ([02 step 10](02-DEPLOY-DAY-CHECKLIST.md)). Only a series that does not restart each year would need code. |
| P-4 | **Phone retests pending** for fixes made 2026-10-21: I-77 (Hose Reel/CO2/Wet Chemical keyboard closes on autosave), I-78 (cold start with server unreachable), I-80 (Android Back from drawer), I-81 (calendar dots), OA-7 (New Service Visit setup persisted before sync). Source: `remaining-work/REMAINING_WORK_FLOW.md`. | Test | **Done on the dev stack 2026-10-22** (build `build-20261022T110325Z`, localhost phone): I-77, I-78, I-80, I-81 (Overdue only) and OA-7 all PASS ([register](../testing/PHONE_TESTING_STATUS.md), section "Pre-deploy phone retest"). Still worth a short pass on the production URL after install (HTTPS, the client's phones). |
| P-5 | **I-79** repair visit stopped saving once (~10 min, 4 app tabs); mitigated, root cause unknown. | Risk | **Not reproduced** in the 2026-10-22 pre-deploy pass (one tab); owner decision: note and ignore. Still tell technicians to use one app window; the "Saving is slow" notice appears if it recurs. |
| P-6 | **Owner decision CR-11:** five screens where both review roles now read "Admin" (`docs/testing/CR11_ADMIN_WORDING.md`). | Decision | Ask the client during handover, or close as "accepted". |
| P-7 | **FR-13:** an entirely empty Portable Fire Extinguisher form can be submitted. | P3 | Accept, or add a "at least one quantity" check later. |
| P-8 | **E-2:** failed reminder e-mails are not retried. | P3 | Client acknowledgement (handover chapter 8). |
| P-9 | **iPhone** offline use never tested. | Test | If any technician uses an iPhone, test it on deploy day. |
| P-10 | P3 backlog, re-checked 2026-10-22: **L-7** radios and **L-8** N+1 query were already fixed in code (L-7 now has a regression check in `technician-location-proposal-form.html`). **E-1 fixed:** the reminder worker writes a heartbeat after each cycle and has a Docker healthcheck (`unhealthy` in `docker compose ps` after ~40 min without a cycle reaching the database). **L-6** is covered by the 15 s re-verify (I-78) and 20 s server probe; **phone-timed 2026-10-22: header Online 3.5 s after the server returned, no Reconnect tap.** Two new P3 rows were opened by the review: PD-4 (header wording while a visit is pending) and PD-5; and **PD-1 (P2, six developer files with dev paths would have shipped) is fixed: `.gitattributes` updated and the publish script now refuses any shipped file containing a developer path. Confirm the first `Publish-ClientRelease.ps1` run finishes without that error.** Left on purpose: the large JS bundle warning (splitting it changes what the service worker precaches; not worth the offline risk before go-live) and HSTS 1 day (raise after a few stable weeks, see `Caddyfile`). | P3 | Remaining two after go-live. |
| P-11 | Paper-form templates in `client-material/` and `client-input-private/` are client files on your PC only (ignored by Git). | Housekeeping | Return or keep per your agreement; they never ship. |

Corrections to earlier notes: the missing **departure time is by client request** (CR-03/04, "Remove Departure;
Arrival automatic"); FR-14 made the cover say "Arrival time" only. CR-09/CR-10 (old Repair List) were superseded
by the repair-visit redesign; CR-02 site requests and CR-07 section remarks were completed by later work
(see the status note at the top of `client-format-request/CLIENT_CHANGE_REQUESTS_2026-10.md`).

## 1.4 What reaches the client and what stays with you

`.gitattributes` marks developer-only paths `export-ignore`. They stay in this repository and on GitHub, but
`scripts/dev/Publish-ClientRelease.ps1` builds the `client-release` branch from `git archive`, which drops them.

| Client gets | Stays with you |
|---|---|
| `apps/` source needed to build (no tests, no validation CLIs), `infra/reverse-proxy` (no test script), `docker-compose.yml`, `.env.example`, operations `scripts/*.ps1`, `README.md`, `docs/handover/`, `docs/it-guide/`, the PDF/Word packs, a generated `RELEASE.txt` | All other `docs/` (architecture, deployment-day, testing, prompts, progress logs), `HANDOVER.md`, `AGENTS.md`, `.agents/`, `.claude/`, `apps/*/tests`, `*.test.ts(x)`, `scripts/dev`, `scripts/phone-testing`, `scripts/security`, `scripts/testing`, `Test-*.ps1`, `requirements.txt` |

Tested 2026-10-22 in a scratch clone: 633 files published, the leak check passed, the working tree and current
branch were untouched, and `docker compose build api proxy` succeeded on the published files.

Add any new developer-only path to `.gitattributes`. The script refuses to publish if a developer path slips
through, or if a required file is missing.

## 1.5 Git and release steps (you run these)

Current state: the branch is **185 commits ahead of `origin`** (the push from this session was blocked by the
permission system, so run it yourself) and 338 ahead of `main` (fast-forward possible).

1. Review and commit the working tree (this review's docs, scripts, `.gitattributes`, the deletions).
2. Quick gates on that commit:
   ```powershell
   cd apps\api; npm run typecheck; npm run build
   cd ..\web; npm run typecheck; npm run build
   cd ..\..; git diff --check
   ```
3. Push the branch; fast-forward `main` and push it:
   ```powershell
   git push origin phase-8e-client-demo-polish
   git checkout main; git merge --ff-only phase-8e-client-demo-polish; git push origin main
   ```
4. Tag the release (use the deploy date) and push the tag: `git tag release-20261025; git push origin release-20261025`.
5. **Create a separate private repository for the client**, for example `Kokfu/inspection-pwa-release` (empty, no
   README), and add it as a remote once: `git remote add client https://github.com/Kokfu/inspection-pwa-release.git`.
   A separate repository means the client PC's access token can only ever read client files.
6. Publish and push the client release:
   ```powershell
   .\scripts\dev\Publish-ClientRelease.ps1 -Ref release-20261025 -Push
   ```
   It creates/advances branch `client-release`, tags it `client/release-20261025`, and pushes both to `client`.
7. Create a fine-grained GitHub token with **read-only Contents** access to **that release repository only**. It is
   used once on the client PC for `git clone` (02 §C step 3) and stored in the client's password manager.

Later updates: commit → tag `release-YYYYMMDD` → `Publish-ClientRelease.ps1 -Ref release-YYYYMMDD -Push` → on the
client PC `git pull` and `docker compose --profile tunnel up -d --build` (IT guide 1.6).

Never copy across: `.env`, `node_modules`, `client-input-private/`, `client-material/`, `*.log`, `runtime/`.

## 1.6 Ask the client before the session (send this list)

| Item | Why |
|---|---|
| Remote access to the PC, a Windows **administrator** account, and someone at the PC who can reboot it and enter BIOS | Docker/WSL install needs admin and a reboot |
| PC details: Windows edition, RAM (16 GB recommended, 8 GB minimum), free disk on C: (50 GB+), virtualization enabled | Docker Desktop + WSL 2 |
| Who owns `mfets.com` and which **Cloudflare account** it is in; access to it | The tunnel lives in the client's account |
| Names of the **two people** who will hold Manager accounts | Never only one Manager |
| Technicians' names, wanted usernames, phone models (Android / iPhone) | Accounts and phone acceptance (P-9) |
| Gmail address + **app password** for reminders (2-Step Verification on) | Settings → Email Reminders |
| Off-PC backup target (USB drive, BitLocker if Windows Pro, or a cloud-synced folder they own) | `Backup-All.ps1 -CopyTo` |
| UPS? Who switches the PC on after a power cut? | Single point of failure |
| Final letterhead details, "verified by" name and title, and a **logo PNG** | P-2 |
| Report numbering: start at 0001, or continue a paper series? | P-3 |
| The customer list (and who will type it in) | P-1 |

## 1.7 Bring to the session

- This folder, and [`DEPLOY_TO_CLIENT_PC.md`](../DEPLOY_TO_CLIENT_PC.md) for detailed commands.
- The release tag, the release repository URL and its read-only token.
- A password manager for: the database password (generated by `Prepare-ClientPC.ps1`), Manager passwords, the
  tunnel token, the `.env` copy.
- Your phone with the app removed and site data cleared (R-2).
- The printed packs from [`docs/client-pack/`](../client-pack/README.md).
- Time: about **3 hours** (Docker + reboot 45 min, build 20 min, setup 30 min, tests 45 min, training 30 min).
