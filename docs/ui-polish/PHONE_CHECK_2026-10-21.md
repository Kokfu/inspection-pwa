# UI polish round — phone check (2026-10-21, build `build-20261021T101701Z`)

CPH2375 over USB (`http://localhost:8081`, NOT production HTTPS), Chrome, first signed in as Manager `mobiletest`, then signed out and in as `technician-demo` (credentials supplied by the owner in chat, set into the sign-in fields via CDP; adb typing garbled the username; not written to any file). Real taps (`adb input tap`) for the role button, the customer select and the filter chips; CDP only to navigate by hash and to read state. Width 360 px.

| Item | Check | Result |
|---|---|---|
| 1 Customers list | `#/manager-customers` at 360 px | PASS: phone card layout unchanged, no horizontal overflow (scrollWidth 360). The desktop table changes are Playwright-covered only; the phone still shows "-" for empty contacts and ISO dates by design (phone view was left untouched). |
| 2 Operations | `#/manager-operations` | PASS: slim "2 repair visits awaiting approval · Review" banner, chips Open 102 / Completed 21 / Total 123. Real tap on Completed: aria-pressed true, 21 cards. Real tap on Open: 102 cards. No overflow. |
| 5 Manager Current Services Done | `#/manager-services-done` | PASS: heading, "Select customer" picker with 13 customers. Real tap on the select and R1 Online Customer 1020: Customer history timeline appears with the completed service of 2026-10-21 by technician-demo. No overflow. |
| 3 Technician Completed Services | `#/technician-completed-services` as technician-demo | PASS: eyebrow, left-aligned heading, "Select customer" label and picker, helper line, no Back button (0 found), no overflow (scrollWidth 360). |
| 4 Technician Home search and hide/show | `#/jobs` as technician-demo | PASS: search box above the lists. Search text set by script (typing is not the item under test): "Retest" -> Showing 13 of 87, "SV-20261021-124" -> 1 of 87, "zzzz" -> 0 and "No visits match", cleared -> all 87. Real tap on Hide collapsed Service visits (page height dropped, aria-expanded false); after a reload it was still collapsed, so the preference persists; real tap on Show restored it. |

## Observations (P3, not fixed)
- Operations opens on the Total chip, not Open as drawn in the mockup, so the list starts with every visit.
- On Current Services Done the helper line "Pick a customer to see their finished visits." stays visible after a customer is chosen.

## Not tested
Desktop width on a real browser, installed WebAPK, HTTPS, offline behaviour of the new pages on the phone.

Phone left signed in as `technician-demo`; the Service visits section was shown again after the hide test. Chrome's "Save password?" prompt appeared at sign-in and was not accepted.
