# UI polish round — phone check (2026-10-21, build `build-20261021T101701Z`)

CPH2375 over USB (`http://localhost:8081`, NOT production HTTPS), Chrome, signed in as Manager `mobiletest`. Real taps (`adb input tap`) for the role button, the customer select and the filter chips; CDP only to navigate by hash and to read state. Width 360 px.

| Item | Check | Result |
|---|---|---|
| 1 Customers list | `#/manager-customers` at 360 px | PASS: phone card layout unchanged, no horizontal overflow (scrollWidth 360). The desktop table changes are Playwright-covered only; the phone still shows "-" for empty contacts and ISO dates by design (phone view was left untouched). |
| 2 Operations | `#/manager-operations` | PASS: slim "2 repair visits awaiting approval · Review" banner, chips Open 102 / Completed 21 / Total 123. Real tap on Completed: aria-pressed true, 21 cards. Real tap on Open: 102 cards. No overflow. |
| 5 Manager Current Services Done | `#/manager-services-done` | PASS: heading, "Select customer" picker with 13 customers. Real tap on the select and R1 Online Customer 1020: Customer history timeline appears with the completed service of 2026-10-21 by technician-demo. No overflow. |
| 3 Technician Completed Services | not run | NOT TESTED on the phone: no technician password was available to the agent. Playwright covers it. |
| 4 Technician Home search and hide/show | not run | NOT TESTED on the phone, same reason. Playwright covers filtering, persistence and offline filtering. |

## Observations (P3, not fixed)
- Operations opens on the Total chip, not Open as drawn in the mockup, so the list starts with every visit.
- On Current Services Done the helper line "Pick a customer to see their finished visits." stays visible after a customer is chosen.

## Not tested
Technician pages (items 3 and 4), desktop width on a real browser, installed WebAPK, HTTPS, offline behaviour of the new pages on the phone.
