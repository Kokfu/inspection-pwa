# Site proposal physical-phone retest — 2026-10-20

Result: **PASS for the site-proposal phone checkpoint; no new P0/P1/P2 findings.**

Device: OnePlus/Oppo CPH2375, Android 13, Chrome 155, USB device `182449ec`.
Native viewport observed: 360 × 665 CSS pixels, DPR 2; no viewport/device emulation.
Build: `build-20261020T052523Z`. Source HEAD observed: `02f4361`; site-proposal
implementation checkpoint: `29113fb`.

Origin: `http://localhost:8081` through the existing USB reverse tunnel and test
proxy to the rebuilt desktop stack. Chrome reported a secure context and an
active service-worker controller. This is **not production-domain HTTPS testing**.

The technician, supervisor and manager workflows below ran on the physical
phone. Offline relaunch used the installed Inspection PWA WebAPK
`org.chromium.webapk.ab425dac179d8a50b_v2`; Android reported Chrome's
`SameTaskWebApkActivity` as the resumed activity, with no browser address bar.

## Objectives and real results

| Check | Result |
| --- | --- |
| Create a visit while its proposed site is pending | PASS: phone created SV-20261020-119 and SV-20261020-120, displayed the approval-submission confirmation and opened each In Progress visit. |
| Client request uses newSite XOR siteId | PASS: captured creation body contained newSite and no siteId, with a stable request UUID. |
| Pending sites excluded from dropdown | PASS: after the first phone proposal, the dropdown still contained only the existing active Retest Approve Site and Retest Original Site. The technician's own pending site was absent. |
| Creation retry/double-tap safety | PASS: replay of the first exact create body returned HTTP 200 and the same visit ID. Rapid double-click on the second Create sent one POST. |
| Technician cannot review proposals | PASS: phone session GET review API returned 403. |
| Supervisor rejection and required note | PASS: blank note was blocked in the phone UI. A valid note plus the explicit native confirmation produced Server confirmed: Rejected. Rapid double-click produced one decision POST. |
| Supervisor cannot archive | PASS: archive attempt from Supervisor1 returned 403. |
| Manager approval | PASS: mobiletest approved exactly the submitted name/address; captured decision body had only decision/requestId. Fresh status was Approved. Exact decision replay returned the same decision ID. |
| Rejection leaves visit business data intact | PASS: canonical before/after comparison retained id, reference, title, status, createdAt, configurationSnapshot, serviceDate, serviceTime, site and completion values. The completion checkedAt field is a fresh read timestamp and was excluded; siteApproval correctly changed to rejected. Inspection entry remained available and a test Draft saved. |
| Rejected sites excluded from ordinary site management | PASS: rejected site absent from active and archived site lists; admin archive/restore attempts against it returned 409. |
| Archive and historical names | PASS: native archive confirmation explained existing visits/reports are preserved. Approved phone site moved to Archived sites; history still showed SV-119 and SV-120 with the original names. |
| Restore name clash and recovery | PASS: temporary active same-name site caused 409 with the plain active-name-clash message. Archiving that temporary conflict allowed restoration of the original site with its submitted address intact. |
| Final technician dropdown | PASS: restored Phone Approval Site was selectable; Phone Rejection Site was absent. |
| Mobile review layout | PASS: page width and scroll width both 360; approval/rejection targets measured 153×72 and 147×72 CSS pixels, note font 16px. Screenshots saved. |
| Real offline draft entry/save | PASS: Wi-Fi and mobile data disabled, USB proxy stopped, Android Active default network: none, navigator.onLine false and API health fetch failed. Edited and saved the rejected-site inspection Draft locally. |
| Existing-site offline visit creation unchanged | PASS: new-site addition disabled with its connection explanation; existing site/system selection and Create remained enabled. Created one local visit while genuinely offline. |
| Force-close and installed-PWA offline reopen | PASS: force-stopped Chrome and the documented installed WebAPK, then launched the installed PWA while Android still had no active network. App shell opened offline; cached Technician selection led to the saved jobs. Local visit and exact comment text remained available and editable. |
| Stable local/outbox identities after force-close | PASS: same client UUID and same one Pending outbox operation, attempts 0, survived the process stop. |
| Reconnect and automatic sync | PASS: exact client UUID became SV-20261020-121. Local status Synced, same outbox operation Completed, attempts 1. No manual Sync tap was needed. |
| Exact confirmation and idempotent replay after reconnect | PASS: receipt clientJobUuid and jobId both equalled the local UUID; request/replay retained the visit number and returned idempotent:true. Server job list contained exactly one matching UUID. |

Cross-technician pending-site exclusion, malformed authority responses,
transaction rollback and races retain their separate automated coverage from the
[web checkpoint](SITE_PROPOSAL_WEB_RETEST_2026-10-20.md). Those suites were not
rerun during this phone-only follow-up.

## Retained test data

Customer: **Site Review Retest 2026-10-20** (`7869cb71-4537-4938-9a63-c25db70a6d13`).

- **SV-20261020-119** (`b6afbea0-ff9e-4abc-9e69-6cc313a8d609`): Phone Approval
  Site 2026-10-20, Approved and active after archive/restore.
- **SV-20261020-120** (`1a0a1618-bd60-4527-aca7-80f34a9af6c4`): Phone Rejection
  Site 2026-10-20, Rejected and absent from permanent site lists; visit retained.
  One phone-local Portable Fire Extinguisher Draft remains, unsubmitted, with
  comment “Phone offline draft survives app force-close after site rejection.”
- **SV-20261020-121**, client/server UUID
  `795aa6e7-72a0-4f3d-9f21-2a100d6ef9de`: created offline on the approved phone
  site and automatically synced. Outbox operation
  `5641c86d-cad5-4a19-8b09-015f3a2edf35` completed once.
- The temporary conflicting Phone Approval Site remains archived. Previous web
  test sites/visits and unrelated customer records were not edited or deleted.

## Environment restoration and evidence

Wi-Fi and mobile data were restored to their original enabled settings; Android
again reported an active network. The existing proxy was restarted hidden,
normal fault mode remains empty, and the original USB mappings remain in place.
The phone was left in the installed PWA on synced test visit SV-121.

Evidence is in ignored `test-results/site-proposal-phone-20261020/`, including:

- `phone-pending-visit.png`, `phone-pending-excluded.png`
- `phone-reject-note-required.png`, `phone-supervisor-rejected.png`
- `phone-approval-review.png`, `phone-manager-approved.png`
- `phone-archived-history.png`, `phone-restore-conflict.png`, `phone-restored.png`
- `phone-active-only-dropdown.png`, `phone-offline-existing-site-entry.png`
- `phone-installed-offline-os.png`, `phone-installed-offline-draft-os.png`
- `installed-offline-visit-after-forceclose.png`
- `installed-offline-draft-after-forceclose.png`, `installed-synced-visit.png`

Remote pointer actions needed the on-screen keyboard dismissed on some forms.
Unconfirmed native review dialogs were initially dismissed by the automation
client; those attempts sent no decision POST. The completed checks explicitly
accepted the expected confirmation text and verified fresh server status.
These harness interactions are not counted as application defects or successful
decisions. Credentials were supplied per session and not saved in the harness.

## Limits and readiness

No application source, schema, deployment configuration, Git index or history was
changed. Only verification documentation and ignored test artifacts were written.
`git diff --check` passed.

Not tested here: production-domain HTTPS, iOS, camera/photo capture, generating a
new Final Report/PDF, or killing the app during an unconfirmed in-flight local
write. This pass does not close unrelated release/repair acceptance items.

**Site-proposal web + physical-phone objectives met; ready for the next checkpoint.**
