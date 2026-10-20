# 3. Offline and Online: What You Need to Know

## 3.1 The rule in one sentence

**Being offline limits uploading, not typing.** Inputs, draft saving, the camera and submitting are
never switched off because the internet is down. Everything a technician enters is written to the
phone first, and only then sent to the server.

## 3.2 Where data lives

| Place | What is stored there | Survives |
|---|---|---|
| **The phone: IndexedDB** (inside the browser or installed app) | Drafts, submitted-but-unsynced inspections, the upload queue ("outbox"), downloaded customers, sites and form setups, photos as files (Blobs), repair visits, location proposals | App refresh, closing the app, force-close, phone restart, network loss, server downtime. **Not** a cleared browser or app data, uninstalling, or "Clear storage" |
| **The phone: Cache Storage** (service worker) | Only the app itself (pages, scripts, icons) so it can open with no signal | Same as above. Contains **no business data** |
| **The office PC: PostgreSQL** | The authoritative copy of all accepted records, accounts, customers, approvals, audit log | Docker restarts and PC restarts (stored in a Docker volume) |
| **The office PC: uploads folder** | Photo files after upload (`C:\InspectionSystem\runtime\uploads`) | Container rebuilds (it is a Windows folder, not inside the container) |

The server, not the phone, is the source of truth for accepted records. The phone's copy is
a working copy until the server confirms it.

## 3.3 Record states

Every piece of local work has one of these states:

| State | Meaning |
|---|---|
| **Draft** | Being edited. Saved on this phone only. Not queued for upload |
| **Pending** | Submitted. Saved on the phone and queued, waiting for a connection |
| **Syncing** | Being uploaded right now |
| **Synced** | The server confirmed **this exact record** (matched by its unique ID) |
| **Failed** | The upload was rejected or errored. The data is still on the phone. Read the error |
| **Conflict** | The server's setup changed (for example a site was removed) so the record cannot be accepted as-is. The data is still on the phone; a Manager can help |

A record is marked **Synced only** when the server replies with that record's own ID. A plain
"success" from the network is never trusted on its own. This prevents the phone ever showing
"done" for something the server does not have.

## 3.4 What works in each situation

Assumptions: Technician, signed in earlier, visit already downloaded to this phone.

| Action | Online | Offline (no network) | Wi-Fi up but server unreachable |
|---|---|---|---|
| Open the app | Yes | Yes, if it was opened online before (installed app reopens even after force-close) | Yes |
| Sign in with username and password | Yes | **No.** Sign in once online first | **No** |
| Stay signed in / reopen | Yes | Yes, the app trusts the saved identity | Yes |
| See the job list | Fresh from server | The last downloaded list | The last downloaded list |
| Fill in forms, save drafts, autosave | Yes | **Yes** | **Yes** |
| Take photos with the camera | Yes | **Yes** | **Yes** |
| Submit an inspection | Yes, uploads soon after | **Yes**, queued until connection | **Yes**, queued |
| Create a service visit for a customer and site already on the phone | Server creates it, SV number at once | **Yes.** The phone creates it. SV number arrives after sync | Yes, as offline |
| Create a service visit for a brand-new customer or brand-new site | Yes | **No**, needs the server | **No** |
| Add Customer (standalone page) | Yes | **Yes**, queued | Queued |
| Add a New Location proposal | Sent at once | **Yes**, saved as "pending sync" | Saved |
| Repair visit: create, fill, photograph, submit | Yes | **Yes**, if the customer's field list was downloaded while online | **Yes** |
| See whether a proposal was approved | Yes | **No.** Shows only local delivery state | No |
| View Final Report or download PDF | Yes | **No** | **No** |
| Complete Service, delete a visit | Yes | **No** | **No** |
| Read already-accepted inspections | Yes | Mostly **no** (not downloaded for reading) | Mostly no |
| All Manager and Admin screens (approvals, settings, staff, customers) | Yes | **No.** Need the server | **No** |

## 3.5 How uploading happens

1. Work is submitted → saved to the phone → one item added to the **outbox**.
2. The app tries to upload automatically at: **app launch**, when the phone **comes back online**,
   when the app **becomes visible again**, about **every 60 seconds** while open, and when the user
   presses **Sync Now** or **Retry Sync**.
3. Order is always: visit first, then its inspections, then photos/evidence. A photo never arrives
   before the record it belongs to.
4. The server saves each item in its own transaction. Sending the same item twice is safe: the
   server recognises its ID and does not duplicate it.
5. A network timeout is **not** treated as rejection. The item stays queued and is retried.
6. If the server refuses an item, it becomes **Failed** or **Conflict** and stays on the phone with
   the error message. It is never silently dropped.

The header shows the overall picture:

| Header message | Meaning |
|---|---|
| Online | Server connection working |
| Offline / Reconnecting | No connection yet. Prepared forms still work |
| Server unreachable / unavailable | Network exists but the office server is not answering. Prepared forms still work |
| Preparing offline use | Offline setup not finished. Stay connected |
| Offline ready | The app can open without signal. Still check each visit says **Ready for offline use** |
| Offline not available | This browser cannot do offline setup. Ask support before field use |
| N inspections waiting to sync | Submitted work on this phone, waiting for server confirmation |
| N location proposals waiting to sync | Same, for proposals |
| Syncing… | Transferring |
| Sync needs attention | At least one item is **Failed** or **Conflict**. Open it and read the error |
| All submitted changes synced | Nothing submitted is waiting. **Unsubmitted drafts are not counted** |

## 3.6 Preparing a phone for a site with no signal

Do this while online, before leaving:

1. Sign in. Open **My Service Jobs** and press **Refresh**.
2. Wait for **Offline ready** in the header.
3. Check each needed visit says **Ready for offline use**. If it says "Not ready for offline: reconnect
   and refresh", refresh while online.
4. For new visits at existing customers, make sure the customer and site list has been refreshed
   (a refresh while online does this).
5. For repair visits, open **New Repair Visit** online and let the customer's field list and Before
   photos download.
6. Offline readiness is checked against a recent confirmation (about 3 days). If a phone has not been
   online for several days, some systems will not let you **start** a new inspection until it reconnects,
   even though already-opened drafts keep working. Refresh before travelling.

## 3.7 Rules for staff

**Do**
- Sign in and refresh online before going to site.
- Wait for the "saved on this device" confirmation before closing the app or switching apps.
- Keep the app installed on the home screen.
- Reconnect at the end of the day and wait for **All submitted changes synced**.
- Keep the **same user** signed in on the phone until everything has synced.

**Do not**
- Clear browser data, site data, or app storage. This deletes unsynced work permanently.
- Uninstall the app while work is unsynced.
- Sign in as a different person on a phone that still has unsynced work from someone else.
- Assume a draft is safe on the server. Drafts exist only on the phone until submitted and synced.
- Assume "submitted" means "accepted". Only **Synced / Inspection Complete** means the server has it.

## 3.8 Updates and the offline app

A new version of the app is downloaded quietly in the background. It is **never applied while a
technician is editing**. A notice offers **Update now**; it only acts on safe screens (for example the job
list), never inside a form. Updating does **not** clear drafts, queued work or photos.

Before a software update is applied by IT, ask technicians to sync all work. This is a precaution:
the app's local database is versioned, and a past version change (version 12) discarded old
Repair List data on the phone. Synced work is unaffected, but unsynced old-format repair data
would be lost.

## 3.9 Storage tidy-up the app does by itself

- Unused draft photos of an already-synced inspection are removed after 24 hours.
- Local copies of photos that the server has confirmed are removed after 30 days.
- Neither rule ever deletes unsent work.

## 3.10 What the office PC being down means

If the office PC, Docker or its internet is off:
- Technicians with prepared phones keep working and queue everything.
- Nobody can sign in fresh, load new pages for the first time, refresh jobs, or sync.
- Managers and Admins cannot use the app at all.
- Email reminders are not sent (and a Missed outcome is recorded if the PC stays off past midnight).
- Nothing is lost. Queued work uploads when the server returns.

## 3.11 Known offline limits (be honest with the client)

1. A visit created or assigned **while the phone was offline** by someone else cannot be started on that phone.
2. Brand-new customers, brand-new sites and all Manager screens always need the server.
3. A reliability problem logged as **PHONE-SAVE-01** (a draft not persisting if the app is closed immediately after a
   save) was not reproduced in later testing, but its physical acceptance was never formally closed. Teach staff
   to wait for the save confirmation.
4. Installed-app offline behaviour has been tested on Android (Chrome and the installed WebAPK). **iPhone offline
   behaviour has not been tested.** **[FILL IN: if the client uses iPhones, test before go-live]**
5. A server-side "Complete Service", delete, report view and PDF all need a connection.

For developers, the full audit is [docs/manager-approvals-settings/OFFLINE_AUDIT.md](../manager-approvals-settings/OFFLINE_AUDIT.md),
the contract is [docs/architecture/02-offline-first-contract.md](../architecture/02-offline-first-contract.md), and the sync
protocol is [docs/architecture/03-sync-protocol.md](../architecture/03-sync-protocol.md).
