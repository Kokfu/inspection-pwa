# CR-12 / Q-A1 — Comments box as free text, and the approval flow (RECORDED, NOT BUILT)

Recorded 2026-10-22 from the owner, to be confirmed with the client. **No code has been changed.**

## 1. Comments box: free text in every service visit

Owner request: the Comments section should be plain free text on every service visit, not "Choose a remark".

What the screen does today (Fire Alarm, FM200, CO2, Hose Reel, Hydrant; seen on Fire Alarm):
- The per-row remarks (e.g. Standby Pump "Remark") are a **single-row picker**: choose one wording, a later choice replaces it (R4).
- The Comments box is NOT a per-row picker. It is the older **stacked list**: "Choose a remark" dropdown, "Add new remark" button, and every remark you add is listed underneath with a Remove button. That is why the page grows downward: each extra remark adds one more row (the screenshot shows 3: "123", "Battery spoilt - 12V x 7AH", "Packing seal spoilt"). Nothing is wrong or duplicated.
- So the Comments box behaves differently from every other remark on the form (R4 deliberately left it alone: it has no section key, `sectionKey !== "comments"` in `RemarksField.tsx`).
- Dry/Wet Riser, Smoke Ventilation, Fire Intercom, Roller Shutter and Wet Chemical already use plain text for Comments.

Requested behaviour: one free-text box titled Comments on every system, no dropdown, no "Add new remark", no Remove list.

Questions for the client:
1. Single multi-line text box (technician types everything), or still allow one line per comment?
2. Do they still want the common-remark wordings offered in Comments at all (e.g. "Battery spoilt - 12V x 7AH")? If not, the shared list stays only for the per-row remarks.
3. Maximum length? (today's field limit applies unless told otherwise)
4. Visits already saved with the list-style comments: keep showing them as text lines (recommended; no data migration).
5. Report/PDF: print the text as typed, line breaks kept.

Build notes (for later): web only (`RemarksField.tsx` Comments branch + the five forms' Comments boxes); no migration, no Dexie change; the stored value is already newline-joined text so old drafts and accepted visits stay readable.

## 2. Approval flow: how it works today (code-verified)

1. Technician fills each system form and taps **Submit Inspection**. The server accepts the submission on sync (idempotent, exact UUID). **No manager approval is involved here.**
2. Technician taps **Complete Service** (`POST /inspection-jobs/:id/close`). The server only checks that all required systems are accepted (otherwise 409 JOB_INCOMPLETE). **No manager approval is needed to complete.**
3. A completed visit is "Awaiting approval". An Admin/Manager approves the **report** (`POST /manager/service-visits/:id/report-approval`). Only then can the PDF be downloaded (409 REPORT_NOT_APPROVED before that). A later correction withdraws the approval back to awaiting.

So there is **one** approval, not two: the manager does not approve the form and then the report. The submission is auto-accepted; approving the report is the single review. The duplication the owner is worried about does not exist in the current build.

Possible refinement to raise with the client: the manager only reviews after the technician has completed the service, so the technician cannot be stopped from completing. If the client wants the manager to review BEFORE completion, that would be a new gate (and a Level 2 change); the owner's flow as stated (submit -> complete -> manager approves once) already matches what is built.
