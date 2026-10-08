# Inspection evidence policy

Checked against the application on 8 October 2026. This describes the current behavior; older visits keep their original form and requirements.

## Results and required evidence

Use the result labels on the visit you are completing. The current form (V7) has four choices:

| Result | What to enter |
|---|---|
| Good | The check passed. No finding photo is required. |
| Not Good | Explain the problem in that check's own remark and attach one photo to that check. |
| Complete Repair | Explain the repair in that check's own remark and attach one photo to that check. |
| N.A. | The check does not apply. No finding photo is required. |

Older forms may say **Good / Poor / Not Relevant**. On the older Fire Alarm evidence form (V6), each Poor check requires its own remark and photo. Not Relevant means the check does not apply. Earlier forms do not automatically acquire the newer photo requirement. Follow the requirements displayed on that particular visit.

Do not use a general comment instead of a required field remark. Do not use one photo for two findings. Within the same visit and system, the same image cannot support different fields or locations, even if it is attached twice. A separate visit may use the same image, although a current, relevant photograph is preferable.

Normal / Test / Isolation are separate equipment-state choices; they are not substitutes for these inspection results.

## Which systems need photos?

On V7, the finding rule applies to all eleven inspection systems below. Each photo-enabled check marked Not Good or Complete Repair needs **one photo of its own**. There is no fixed minimum number for a whole visit: the total depends on its findings.

- Automatic Sprinkler System
- Dry / Wet Riser System
- Hose Reel System
- CO2 Fire Extinguisher System
- Fire Alarm / Detector System
- Wet Chemical System
- Hydrant System
- Smoke Ventilation System
- Fire Intercom System
- FM200 System
- Fire Rated Roller Shutter

Portable Fire Extinguisher is a registration form and has no photo-evidence workflow.

For older Automatic Sprinkler visits with the optional pressure-photo policy, up to one photo can be attached to each of six readings: jockey-pump cut-in and cut-out, duty-pump cut-in, standby-pump cut-in, water-supply gauge and installation gauge. These pressure photos are optional. Current V7 uses finding photos instead; it does not show this older pressure-photo workflow.

## Taking or choosing a photo

1. Enter the finding's remark.
2. Use **Take Photo**, or **Choose Existing Photo** to select an image from the phone. The older pressure-photo form labels the gallery option **Camera unavailable? Choose Existing Photo**.
3. Check the preview and that it belongs to the right finding. The app records whether it came from the camera or gallery; the older pressure-photo form also displays a **Gallery attachment** label.
4. Before submitting, use **Replace with Camera** or **Replace from Gallery** if the draft photo needs changing. The older pressure-photo form also offers **Remove**; the V7 finding-photo controls do not offer that button.

The app accepts an image the browser can open. JPEG and PNG are practical choices; other formats depend on the phone/browser. A selected source image must be no larger than 20 MB, no more than 40 million pixels, and no more than 12,000 pixels on either side. Invalid or oversized images are refused with an explanation.

The app converts the image to JPEG, reduces its longest side to at most 1,600 pixels and compresses it, aiming for about 1.5 MB. The resulting photo must be at most 2 MB. The server accepts JPEG evidence only and checks the actual image. These are per-photo limits, not a promise that every phone image format will work.

## Offline work and acceptance

Prepare the phone online first: sign in, wait for **Offline ready**, and open the visits and forms needed for the day. Offline ready describes the app's ability to open; it does not mean every visit has been downloaded.

You can type, save drafts and take or choose photos offline in prepared forms. Answers and photos are saved on that phone first. Submitted work waits for a connection. Keep the phone's app data until the server confirms acceptance.

Photos are uploaded **before** the associated inspection is accepted. Uploading a photo alone does not complete an inspection. The server must confirm the inspection and bind all its required photos to it together. A lost connection leaves work to retry; it is not proof of acceptance.

| State shown | Meaning and action |
|---|---|
| Draft | Saved locally; still editable and not submitted. |
| Pending / Pending Sync | Submitted on the phone and waiting to finish upload/acceptance. Keep the app data. |
| Syncing | Transfer is underway. Photos may show Uploading. |
| Synced | The server confirmed this exact inspection. Its accepted answers and evidence are frozen. |
| Failed | Upload or acceptance did not finish successfully. Read the error; correct the problem or retry after reconnecting. |
| Conflict | The server cannot accept the submitted identity or evidence as sent. Read the error; a corrected copy may be needed. |

The header may say **Sync needs attention** even when a parent inspection still says Pending, because one of its photos failed. **All submitted changes synced** does not mean unsubmitted drafts have been sent.

## Correcting rejected evidence

Once a photo has been submitted, its bytes cannot be replaced on that same record. Changing only the answers may be possible for other kinds of rejection; changing rejected photo evidence needs a fresh copy.

1. Open the Failed or Conflict inspection. A draft that contains already-submitted photos can also offer recovery.
2. Choose **Start corrected copy** and confirm the explanation.
3. The app creates a new draft with your answers and photos. Replace the incorrect photo or correct the answers in that new draft.
4. Save and submit the new draft, then check that it becomes Synced.

The rejected record is archived on that phone and will not be sent again. The new draft takes over its work. This archive is currently device-only; it is not a supervisor-accessible server history. This workflow does not change an inspection already accepted by the server.

## How long photos stay on the phone

Unsent inspection photos are **not** automatically removed after 24 hours or 30 days. Photos belonging to Draft, Pending, Failed or Conflict inspections are kept. Photos needed by an unfinished transfer are also kept. Uncertain or unreadable local records are retained conservatively.

After the parent inspection is confirmed Synced, local cleanup can remove:

- An unused, never-uploaded draft photo after at least **24 hours** from the later relevant parent/photo update. For example, a finding was changed to Good before submission and that photo was no longer required.
- A confirmed-uploaded photo's local copy after at least **30 days** from the later relevant parent/photo confirmation or update.

Cleanup is checked at most once per day while the signed-in workspace runs; it is not a guaranteed deletion at an exact hour. Removing these eligible phone copies does not remove accepted server photos. Photos without a live parent, including uncertain recovery leftovers, are kept rather than deleted automatically.

The app's retention rules cannot protect against clearing browser storage, removing app data, losing the phone or operating-system storage eviction. Keep enough free space and check sync before changing devices.

## Accepted records, reports and corrections

Technicians can view their authorized accepted records and evidence. Admins and supervisors can view accepted records for review. Accepted original answers, photos and the visit's form/settings stay frozen; ordinary editing cannot overwrite them.

**Current correction access:** both Admin and Supervisor can append audited corrections to supported V7 records. Each correction records the previous value, replacement, reason, author and time. This differs from an admin-only policy; an admin-only restriction is not currently implemented. Corrections do not replace the accepted photographs. Technicians cannot make these accepted-record corrections.

**Accepted → Final Report → PDF:** accepted records supply the report; a completed visit is required for a Final Report. The report uses the visit's original form/settings and accepted evidence, plus supported audited corrections. Drafts, waiting uploads and unaccepted photos do not become report evidence. Report approval is a separate step from inspection acceptance.

The browser's **Download PDF** is available only after report approval and successful report/history checks. Currently, if the visit has corrections, the screen shows corrected V7 values but keeps PDF download unavailable until PDF generation supports those corrections. Re-approving alone does not remove that limitation. Do not distribute an earlier PDF as if it contains the corrections.

## Form history

V1–V7 are historical form versions. A visit keeps the version and configuration it was created with. New settings and later form versions apply to future visits; they do not silently change drafts, pending work or accepted historical inspections.

## Documentation differences found

- The V7 project skill still describes Good / Poor / Not Relevant and Poor-only evidence. Current V7 implements Good / Not Good / Complete Repair / N.A., with evidence for both findings.
- Some older descriptions treat returning the same rejected record to draft as enough to replace evidence. Current submitted-photo protection requires **Start corrected copy** for photo changes.
- Admin-only accepted-record correction, requested in the brief, differs from the implemented Admin-and-Supervisor audited correction access.
- The report-template README retains an older “no template today” analysis below its newer deployment notes. It should not be read as the current PDF implementation.

These differences are reported for the next documentation/policy checkpoint; this task does not change forms, permissions or historical records.
