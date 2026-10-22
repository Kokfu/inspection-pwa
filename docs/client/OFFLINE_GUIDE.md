# Working Offline — What Works and What Does Not

Prepared 22 October 2026 for the client. Written from the current source code and from automated tests run that day (section 6). It has not yet been confirmed on the client's own phones in a real dead-zone; that is listed in section 7.

## 1. The idea in one paragraph

A technician's phone keeps a **copy of the app and of the work in progress on the phone itself**. Having no signal never stops a technician from typing, choosing options, taking photos or saving. Only **sending** the work to the office server waits for a connection. When the phone is back in coverage, saved work uploads on its own, and the app marks an item **Synced** only after the server confirms that exact record. Nothing the technician has entered is thrown away because the connection dropped.

## 2. Get the phone ready (needs signal, once)

Offline work only works on a phone that was **prepared while online**:

1. Open the company app address and **sign in as the technician** (online).
2. On **My Service Jobs**, press **Refresh**. This downloads the day's visits, customers, sites and setup onto the phone.
3. Wait until the top of the screen says **Offline ready**.
4. Check that each visit you need says **Ready for offline use**.
5. Install the app on the home screen (Android: **Install app** / **Add to Home Screen**; iPhone: Share → **Add to Home Screen**).
6. Do this before driving to a site with weak signal. A visit's "ready" status lasts **3 days** for starting a system that was never opened; press **Refresh** again when back online to renew it.

Never clear the phone's browser or app data. That is where unsent work lives.

## 3. What WORKS with no internet

| Task | Offline? | Notes |
|---|---|---|
| Open the app from the home screen | Yes | The app itself is stored on the phone. Opening works with the phone in flight mode. |
| Stay signed in / reopen the app | Yes | The technician who signed in online on this phone is recognised. Signing in a *new* user or after sign-out needs a connection. |
| See today's prepared visits | Yes | Shows what was downloaded at the last Refresh. |
| Fill in any inspection form of a prepared visit (all 12 systems: hydrant, hose reel, sprinkler, risers, fire alarm, fire intercom, smoke ventilation, CO2, wet chemical, FM200, portable extinguishers, roller shutter) | Yes | Every field, choice and remark stays editable. |
| Save a draft / autosave | Yes | Drafts are written to the phone as you type. They survive refresh, closing the app, a dead battery restart, and loss of signal. |
| Take photos, attach photos, remove or retake photos | Yes | Photos are stored on the phone and uploaded later. Photos are recorded as taken with the camera or chosen from the gallery. |
| Submit an inspection | Yes | Shows **Pending Sync** (saved on this device, waiting for the server). It can be closed and reopened and is still there. |
| Start a **New Service Visit** | Yes, for customers and sites already on the phone | The visit is created on the phone with the phone's date and time and a temporary reference; the real SV number is given when it syncs. Customers and sites must have been downloaded earlier (Refresh). |
| **Add Customer** | Yes | Saved on the phone and sent later. |
| Request a **new location** inside a site | Yes | Saved and submitted on the phone; the office reviews it after it syncs. |
| **Repair visits** (create, fill in, photograph, submit) | Yes, for customers/sites/field lists already downloaded | Use **Download for offline** on the Repair screen while connected for each customer you will repair. Gets its RV number on sync. |
| Look at a customer's earlier visit summaries | Partly | Shows the summaries saved on the phone at the last online refresh, with a note that recent changes may be missing. |
| Delete a visit that was created offline and not yet started | Yes | Only for visits not yet sent and not started. |

## 4. What does NOT work with no internet

| Task | Why | What to do |
|---|---|---|
| First sign-in, signing in as another person, password changes | The server checks the password. | Sign in online first. |
| A visit that was created or assigned **after** the phone last refreshed | The phone does not have it. | Reconnect and Refresh. |
| Starting a system that was never opened, when the visit was not refreshed in the last 3 days | The phone cannot ask the server whether that system was already accepted. | Reconnect and Refresh, or ask the office. |
| **Add a new site** to a customer | A site must be registered with the server. | Add it when connected. |
| **Complete** the whole service visit | Completion needs the server's confirmation that every inspection was accepted. | Reconnect first (the app shows "Reconnect before completing this service visit"). |
| Seeing whether the office **accepted, returned or approved** your work | Only the server knows. | Reconnect. A "Synced" tick appears only when the server confirms. |
| **Upcoming Services** list and **Completed Services / final reports / PDF download** | Loaded fresh from the server. | Reconnect. |
| **Admin and Manager screens** (Technician List, Services, Operations, Approvals, Reports, Settings, Email reminders, Location Proposals, Company Profile, Service Catalog) | The office works on live central data. They are not meant to be used offline. | Use from the office PC or a connected phone. |
| Email reminders | Sent by the office server. | Not affected by the technician's phone. |
| Installing a new app version | The new version downloads only when online. | The app asks before updating and never interrupts a form; update from **My Service Jobs** while connected. |

## 5. What happens when the connection comes back

1. The header changes from **Offline** to **Online**.
2. Submitted inspections, photos, new customers, new visits and location/repair submissions upload automatically, in the correct order: the visit first, then the form, then its photos.
3. Each item shows **Pending Sync → Syncing → Synced**. **Sync Now** forces a check.
4. Sending is safe to repeat. If the connection drops half-way, the app retries; the server will not create a duplicate record.
5. If the server refuses something (for example, the system was already accepted by someone else), the item shows **Sync needs attention / Needs review** with the reason. **It is never deleted.** Nothing is lost; open it and read the message.
6. The header line **All submitted changes synced** means nothing submitted is waiting. It does not count drafts that were never submitted. Remember to press **Submit Inspection**.

## 6. What was tested (22 October 2026)

All run on the current build. "Automated" means a script drove a real Chromium browser with the network switched off, using the app's real offline storage.

| Test | Result |
|---|---|
| Header goes Offline when the connection is lost mid-session, repeated on/off cycles, "network up but server unreachable" | Pass (4 tests) |
| Cold start with the server unreachable, then automatic re-verification when it comes back | Pass |
| Create a service visit offline at phone (360 px), tablet (768 px) and desktop widths; reload; sync with exact record ID; no duplicates | Pass (3 widths) |
| Offline-created visit opens its form with no reload, saves locally, then syncs | Pass |
| Server refuses a sync: item stays, shows reason, Retry works once fixed | Pass |
| Delete an unsent offline visit | Pass |
| Offline start rules (when a never-opened system may or may not start offline) | Pass (12 unit tests) |
| Server-unreachable handling, timeouts, "fail closed" on bad data | Pass (51 unit tests) |
| Offline form → reload → sync round trip with photos for Hydrant, Hose Reel, Automatic Sprinkler, Dry/Wet Riser, Fire Intercom, Smoke Ventilation, Portable Fire Extinguisher | Pass (7 tests) |
| Existing Hydrant and Hose Reel local draft and exact-ID sync regression | Pass (2 tests) |
| **Production build, real service worker:** page loaded online, network switched off, page reloaded | **Pass** — the app opened from the phone-side copy with no network (sign-in screen shown; the app shell is cached) |

Total: 17 offline browser tests + 7 system round-trip tests + 72 unit tests passed, 0 failed, plus the production-build check above.

## 7. Not yet verified — to be done with the client

These are honest limits of the testing so far and should not be presented as proven:

- **Not tried on the client's physical phones** (flight-mode test, force-close, reopen from home screen, real camera).
- **Not tried on the client's real HTTPS domain** (the production-build check ran on the demo PC address).
- Browsers delete stored website data in rare cases (very low phone storage, or an iPhone not opened for about 7 days). **Sync submitted work the same day**, and do not rely on a phone as the only copy for weeks.
- The 3-day offline-start window and the cached customer lists are only as fresh as the technician's last **Refresh**.

Suggested acceptance check on a real phone: sign in online → Refresh → wait for **Offline ready** → turn on flight mode → force-close → reopen from the home screen → fill a form with a photo → Submit (shows Pending Sync) → force-close and reopen (still there) → turn flight mode off → confirm it becomes Synced and the office sees exactly one record.

## 8. Short rules for technicians

1. Refresh and wait for **Offline ready** before leaving coverage.
2. Work normally with no signal — nothing is blocked.
3. Press **Submit Inspection** for each finished inspection.
4. When back in coverage, open the app and check the header says **All submitted changes synced**.
5. Never clear app or browser data. If something fails, note the message, the visit reference and the build number at the top of the screen, and call support.
