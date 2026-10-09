# Client user guide

Checked on 9 October 2026 by walking the real app (local demo, build `build-20261008T155132Z`) as administrator, supervisor and technician in a desktop-width browser, with a 360 px phone-width check of the menu and layout. It was not checked on the client's phone or on the client's production address. **[CONFIRM]** marks only things that depend on the client (company address, Gmail account, support contact, backup storage, install on the client's phone) or an action that could not be tried safely (it says which). This is a guide to using the current app, not production acceptance.

## Quick start — keep this page handy

| Who | Daily steps |
|---|---|
| Everyone | Open **[CONFIRM: company app address]**, choose your role card, and sign in with your own username and password. Use the **Menu** (phone) or the left-hand menu (larger screens) to move between screens. |
| Admin/Manager | Keep the office PC running. Check **Next Upcoming Service**, the recipient selections and the **Email reminders** delivery history. |
| Admin/Manager | Use **Add Customer** and **Services** to set up customers, sites and applicable systems. Set locations before the next visit is created. |
| Technician | Online: open **My Service Jobs**, use **Refresh**, wait for **Offline ready**, and check that the visits you need say **Ready for offline use**. |
| Technician | Open a visit, choose a system, then a location. Enter the results and attach a photo for each finding that needs one. Drafts stay on this device. |
| Technician | Use **Save Draft** (or just keep typing — drafts also autosave), then **Submit Inspection**. Submitted work uploads on its own when the connection is good; **Sync Now** forces a check. |
| Technician | Look at the top of the screen: **All submitted changes synced** means nothing submitted is waiting. It does not include drafts you have not submitted. |
| Supervisor | Review accepted work (**Current Services Done** → customer → **View Progress** → **Review / correct** → **Approve review**) and location proposals. |
| Admin/Manager | Keep both database and photo backups, their matching verification files, and the separate encrypted email key backup. See Appendix A. |
| If something fails | Do not clear the phone's app data. Note the message, the visit reference (for example SV-20261008-79) and the **Support build** shown at the top; call **[CONFIRM: support contact]**. |

## 1. Sign in, sign out and prepare a phone

1. Open **[CONFIRM: company HTTPS app address]**. Choose **Technician**, **Manager** or **Supervisor**. A sign-in form appears with **Username**, **Password** and **Sign in** (titled "Sign in to your service jobs", "Sign in to Operations" or "Sign in to review service visits"). Choosing a card does not give an account extra permissions: if the signed-in account is not allowed that role, the app says "This signed-in account does not have Manager access. Choose the role for this account to continue."
2. Enter the username and password your administrator gave you. Your administrator creates accounts (section 2); there is no self-registration.
3. Use **Sign out** (top right) when finished on a shared device. If nothing submitted is waiting, you are signed out at once. If submitted work has not synced yet, the app first lists what is waiting and asks "Sign out anyway?" — the work stays on the phone and syncs after you sign in again as the same user. Technicians should not sign out before their submitted work has uploaded.
4. **[CONFIRM: install on the client's phone]** Android Chrome: open the browser menu and choose **Install app** or **Add to Home screen**, then confirm. iPhone Safari: Share → **Add to Home Screen** → **Add**. The wording depends on the phone and browser; installation was not tried on the client's phone.
5. Technician: sign in online, use **Refresh**, open the visits/forms you will need and wait for **Offline ready**. Check each needed visit says **Ready for offline use** before leaving coverage.

Offline work is for prepared inspection forms: typing, saving drafts and taking photos continue without internet. Starting a **New Service Visit**, and all manager screens, need the server. See section 12 (Known limits). Do not clear site/app data to fix a connection problem.

### Menus

- **Technician:** Home, New Service Visit, Add Customer, Completed Services, Upcoming Services.
- **Admin/Manager:** Home, Technician List, Services, Operations, Add Customer, Current Services Done, Next Upcoming Service, Service Common Remarks, Service Catalog, Location Proposals, Company Profile, Email reminders.
- **Supervisor:** Home, Services, Current Services Done, Location Proposals. Supervisors have no Operations screen and see only visits of the technicians assigned to them (section 2).

### Header messages

| Message | Meaning |
|---|---|
| Online | The app has a working server connection. |
| Offline / Reconnecting | No connection yet, or the app is checking again. Prepared technician forms still work. |
| Server unreachable / Server unavailable | The phone has a network but the server does not answer. Prepared forms can still be used. |
| Preparing offline use | Offline setup has not finished. Stay connected and allow it to complete. |
| Offline ready | The app can open without a connection. Also check the visits you need say **Ready for offline use**. |
| Offline not available | This browser cannot provide the offline setup; ask support before field use. |
| N inspections waiting to sync | Submitted inspections are on this device, waiting for the server to confirm them. |
| N location proposals waiting to sync | A new-location proposal is saved on this device and has not been confirmed by the server yet. |
| Syncing… | Work is being transferred. |
| Sync needs attention | At least one inspection, photo or location proposal is **Failed** or **Conflict**. Open it and read its error. |
| All submitted changes synced | Nothing submitted is waiting or failing. Unsubmitted drafts are not counted. |

## 2. Admin/Manager: technicians and supervisors

1. Open **Technician List**. Under **Add Technician**, enter **Username**, **Person’s name** and **Password** (at least 12 characters). Choose **Role**: **Technician** or **Supervisor (review only)**, then **Add Technician**. The new person appears in the list as **Active**.
2. To change a displayed name, edit **Person’s name** beside the account and choose **Save name**. Under a technician, **Assigned supervisors for …** are checkboxes: a supervisor sees and reviews only the visits of technicians assigned to them, so tick the right supervisor(s) for each technician. Use **Filter by username** to find someone.
3. To stop access, choose **Deactivate**. The app asks "Deactivate this technician? They will no longer be able to log in." Confirm. The account moves out of the active list.
4. For permanent removal, tick **Show deactivated technicians (N)**, then choose **Permanently remove** beside the inactive person. The app asks you to type the exact username. An account that never did any work is deleted ("Unused technician account deleted."); an account with history stays in the records. This cannot be undone.
5. **Password reset:** beside a technician or supervisor, choose **Set new password**, type the new password twice (at least 12 characters) and choose **Set password**. The app confirms the person was signed out of existing sessions; give them the new password yourself. It does not reactivate a deactivated account, and it needs a connection to the server. This screen has no way to change an **administrator** password: IT resets that with the server's `resetAdminPassword` command (see Admin recovery in `docs/client-install-and-public-access.md`). **[CONFIRM: authorized IT/recovery contact]** *(Written from the code and automated browser tests; not yet walked through in the live app.)*

"Review only" means a supervisor cannot administer staff or customer setup. Supervisors can approve a review and make audited corrections to supported accepted V7 inspections (section 7).

## 3. Admin/Manager: customers and applicable systems

1. Open **Add Customer**. Enter **Customer display name**, **Initial Site**, **Telephone No**, **Contact**, **Fax**, **Contract No.**, **Service Frequency** (Not set / Monthly / Quarterly / Half-yearly / Annually) and **Site Address**. Tick the **Initial Assigned Services**, then **Create Customer**. The app opens the customer list afterwards.
2. Open **Services** (the **Customer Configuration** page). Use **Customer name or code** and **Search** (or **Clear**). Each customer card shows its sites, assigned services and configuration **Version**, with **Manage configuration** and **Archive**.
3. In **Manage configuration**: **Contact Details** has **Edit**; **Sites** has **+ Add Site** and **Save Address**; under **Assigned Services** tick the systems that apply and choose **Save & Activate** (or **Cancel**). Further down, **Service history** filters the customer's visits.
4. The **Services** list on the customer page shows each system with its state (for example "Assigned", "Not assigned yet"). Open one. Its tabs include **Form wording** (click the ✎ beside a label, then **Save wording** or **Discard**; **Preview as technician** shows the result) and **Preset rows**. Some systems cannot customise wording yet.
5. **Archive** (on a customer card) asks "Archive customer “…”? It will no longer appear in active lists, and can be restored later." Archive a customer you no longer service rather than leaving it in the lists.
6. Open **Service Catalog** to see the available systems. **Retire** stops a system being offered for new customer assignment; existing assignments stay. **[CONFIRM: retirement confirmation/submission]** — not tried, because it affects every customer. Do not retire a system merely because one customer does not use it.

Saving customer settings creates a new configuration version. Existing visits keep the systems, wording and settings they were created with; new visits use the new version.

## 4. Locations, zones and technician proposals

### Admin/Manager setup

1. Open **Services** → **Manage configuration** → open a system → **Preset rows**, where that tab is available.
2. Choose **Add zone** and enter **Zone name**. Choose **Add location**, enter **Location name**, pick its **Zone** from the list and set **Preset rows**. **Remove zone** / **Remove location** delete an entry from the editor.
3. Choose **Save zones & locations**. The page confirms "Saved. A new configuration version was created." **Reload** discards unsaved changes and reloads the current settings. A repeated name inside the same zone (or a repeated zone name) shows a warning but can still be saved.
4. Some systems use one General location or separate tables instead of zones. Follow the tabs shown for that system rather than adding artificial zones.

### Technician proposals and review

1. Technician: open a visit and choose **Add a New Location**. Choose the **System**, type a **Location name**, and pick an **Existing zone** or **New zone**. Use **Save Draft** to keep it, or **Submit for Review**. If a name repeats one already in the visit, a notice asks you to consider a different name, but you can still submit.
2. While online the proposal is sent at once and shows "New location submitted for review." Without a connection it shows "New location saved on this device, pending sync." and the header counts it. If it fails, it shows "Sync needs attention" with the reason and **Retry Sync**. After a successful submit you can choose **Add another location**. A proposal never changes the visit it was written on: the new location appears from the next visit, after approval.
3. A supported inspection form can offer **Save as format for next visit**. This proposes the current row layout for review; it does not submit the inspection or change past visits.
   - **Fire Rated Roller Shutter:** on a customer's first visit the form first asks **Number of zones** and **Locations in each zone** (open **Different number of locations in some zones?** to vary a zone), then opens already laid out in zones, ready to fill. A customer with one zone sees no zone headings. Type each shutter's **Location** (and optional **Asset Reference**), rename a zone with **Zone name**, and use **Add shutter to** a zone or **Add Zone** if something is missing. When you choose **Submit Inspection**, the layout is sent for review automatically if it is new or changed (it shows "Shutter layout saved on this device" or "sent to a Supervisor for approval"). Once a Supervisor approves it, the next visit shows **Same shutters as last time** with every zone and location already filled in, so you only record the results. To correct a saved name for future visits use **Correct format for next visit**; the current inspection keeps its original names.
4. Admin or Supervisor: open **Location Proposals**, choose **Pending** and click a proposal. The details show who submitted it, the service visit, the new location and its zone.
5. Choose **Approve**, or type a **Note (required to reject, optional to approve)** and choose **Reject**. **Close** leaves without deciding. Decisions cannot be undone. Approving adds the location to the customer's current settings for future visits. Use **Approved** or **Rejected** to see past decisions.
6. An unreadable proposal is listed by reference but cannot be decided through the ordinary screen. Ask support to inspect it; other readable proposals are unaffected.

The old demo proposal with reference **678f1e17** was rejected with an audit record on 8 October 2026. It no longer warns on Pending; its preserved unreadable submission is still listed under Rejected.

## 5. New visits, upcoming dates and recurrence

1. Technician, online: on **My Service Jobs** choose **+ New Service Visit** (also in the menu). Select **Customer** (or **+ Add New Customer**), then **Site**, then tick the **Applicable Fire Systems**. **Reuse Previous Service Format** copies the previous visit's system choice. Optionally fill **Service Call No**, **Arrival** and **Departure**. Choose **Create Service Visit**. The server records the creation date and time itself; the new visit opens with its remaining inspections listed. Admins do not create visits; they follow them under Operations.
2. Admin/Manager: **Operations** lists every visit with counts for Open / Completed / Total. Filter with **Technician**, **Customer name**, **Apply** and **Clear filters**. Click a visit to see its systems and **Accepted records**.
3. Admin/Manager: open **Next Upcoming Service**. Customers with a date are listed under **Scheduled**; the rest say **Not yet scheduled**. Use **Reminder recipients** and **Service routine** under a customer. A due date does not create a visit.
4. In **Service routine**, **Cadence** is **Manual dates**, **Every N weeks** or **Monthly on day N**. Weekly uses **Every number of weeks** (1–52), **Weekday** and **First due date**; monthly uses **Day of month** and **First due date** (months without that day are skipped). The first date must match the weekday or day chosen. Choose **Save routine**; the customer then appears under Scheduled and the recipients panel shows "Planned send" (09:00 Malaysia time on the day before).
5. Closing a service visit advances an active routine once. A manual date change must match the weekday/day; clearing the date pauses the routine and its reminders. **Manual dates** leaves scheduling entirely under your control.
6. To remove an unfinished visit: Admin chooses **Delete** beside it in Operations; a Technician opens the visit and chooses **Delete unfinished visit**, then confirms "Permanently delete service visit …? This cannot be undone." Visits with accepted inspection records cannot be deleted: Operations shows "Cannot delete: accepted records exist." The technician button works only while online and only on a visit of their own.
7. Technicians also have **Upcoming Services**: a read-only list of the customers they have serviced and when each is next due.

## 6. Technician: complete an inspection

1. Open **My Service Jobs** → visit → under **Applicable Systems** choose **Start inspection**. Systems with several locations (CO2, FM200 and so on) list their locations; open one. Finished ones show **Inspection Complete** and the accepted answers.
2. Fill in the form with the labels shown. A current form uses **Good**, **Not Good**, **Complete Repair** and **No Need Checking / N.A.**; detector rows use **Normal**, **Test**, **Isolation**. Older visits may say **Good / Poor / Not Relevant**. Each row also has a **Remark** list.
3. For every finding that needs evidence (**Not Good** or **Complete Repair** on current forms), choose that row's own **Remark** and attach one photo of its own: **Take Photo** or **Choose Existing Photo**. The row then says "Photo attached on this device" with **Replace with Camera** / **Replace from Gallery**. The older pressure-photo form says **Camera unavailable? Choose Existing Photo**. Read [Evidence policy](EVIDENCE_POLICY.md) for limits.
4. **Save Draft** saves on this device (the draft is also saved as you type; after a save the form briefly reloads). **Submit Inspection** checks the form: if anything is missing it lists "Complete before submitting" with each missing result, remark or photo. Fix those and submit again.
5. After submitting, the form says "Submitted on this device — waiting to sync." and the header counts it. With a connection it uploads on its own; **Sync Now** (My Service Jobs) forces a check. When the server confirms, the form changes to **Inspection Complete** with "Synced by …" and shows a **Pending Review** banner ("Supervisor approval is pending.") until a supervisor approves it. The accepted answers cannot be edited. A recorded finding shows **View accepted photo**.
6. If evidence fails, open the affected record and read its error. Choose **Start corrected copy**, confirm, fix the copy and submit it; the rejected original is archived on the phone and is not sent again. A submitted photo cannot be replaced on the same record. **[CONFIRM: corrected-copy screen]** — this needs a rejected record and was not reproduced in this walkthrough; it is covered by automated browser tests.
7. When every required inspection of a visit is accepted, the visit's **Complete Service** action closes it. **[CONFIRM: Complete Service button]** — a full visit was not completed in this walkthrough. Do not assume a completed form alone closes the whole visit.
8. **Completed Services** (menu) lists your closed visits; **View Report** opens the final report when online.

Unsent photos are kept by the app. The 24-hour rule concerns unused draft photos of an already-synced inspection; the 30-day rule concerns local copies of confirmed uploads. Neither is a deadline for deleting unsent work.

## 7. Reports — Admin/Manager, Supervisor and Technician

1. Admin/Manager or Supervisor: open **Current Services Done**, search **Customer name or code**, click the customer. The list shows its visits: completed ones offer **View Final Report**, **Download PDF** and **Archive**; unfinished ones offer **View Progress**. **Show archived visits** reveals archived ones.
2. The **Final Report** screen shows **Download PDF**, the approval line (for example "Report approved — Approved by … on …") and, for an admin, **Withdraw approval**. **Approve report** appears on a completed visit that is awaiting approval; it is separate from accepting an inspection. **[CONFIRM: approving a report awaiting approval]** — only an already-approved report was viewed.
3. **Download PDF** is available after report approval and successful report checks. A visit with audited corrections shows the corrected values in the browser report but cannot download a PDF yet (section 12).
4. To review or correct accepted V7 work: Admin goes **Operations** → visit → **Accepted records** → **Review / correct**. A Supervisor goes **Current Services Done** → customer → **View Progress** → **Review / correct**. The editor lists every field (type in **Search fields**); change a value, enter **Reason for these corrections (3–500 characters)** and choose **Save corrections** (or **Discard**). The original value stays in history. In this editor the fourth result is labelled **N.A.**
5. **Approve review** (shown to a Supervisor on a record that says **Pending Review**) marks it "Reviewed by Supervisor: …". It was exercised in this walkthrough. A saved correction invalidates a prior review. **[CONFIRM: Save corrections]** — corrections are permanent audit entries, so none was saved here.
6. Technicians open their own report from **Completed Services** → **View Report**, and cannot make corrections.

## 8. Email reminders — sender and receivers are different

### Set the sender (Admin/Manager)

1. Use **Email reminders**. **Sender Gmail address** is the client company's sending account: **[CONFIRM: client Gmail account]**. It is not the recipient list. The screen shows "Sender configured" once saved.
2. Sign in to that account at [Google Account](https://myaccount.google.com/). Turn on **2-Step Verification** under its security settings.
3. Open [App passwords](https://myaccount.google.com/apppasswords), sign in again if asked, name the password for this inspection system and create it. Copy the generated password into **Gmail app password** and choose **Save email settings**. Google requires 2-Step Verification, may restrict App passwords on some account types, and revokes them when the Google password changes. [Google's instructions](https://support.google.com/accounts/answer/185833?hl=en).
4. **[CONFIRM: client Google menus and sender save]** — Google setup and saving a real sender were not repeated in this walkthrough (sending was proven earlier on the demo account). If App passwords is unavailable, contact the Google account administrator or support. Do not use the normal Gmail password.
5. The stored password is never displayed. Leave the field blank to keep it; changing the sender requires a new app password. Messages contain only the customer name and next service date.

### Select receivers

1. On **Email reminders**, under **Staff notification addresses**, find the person (**Name, username, or email** / **Search**; **Status** All staff / Active only / Inactive only), enter **Reminder email** and choose **Save address**.
2. Open **Next Upcoming Service** → the customer → **Reminder recipients**. Tick the active technicians/supervisors who should receive it; staff without an email address say "add email in Email reminders Settings". Under **Additional recipients**, enter **Name** and **Email**, **Add address**, then **Save recipients**. The panel shows the **Planned send** time. A scheduled customer with nobody selected shows "Reminder blocked: add recipients." and appears under **Recipient gaps** on the Email reminders screen.

Reminders go to each selected address individually at **09:00 Malaysia time on the day before the customer's due date**. The office PC and worker must be running. The worker checks every 15 minutes and on startup: restarting later that day can catch up; restarting after midnight records a missed reminder rather than sending an out-of-date "tomorrow" message.

### Delivery history and failures

1. Open **Email reminders** → **Delivery status**: the next run time and counts (Sending or awaiting verification, sent, failed, Delivery uncertain, Missed), **Recipient gaps**, and **Recent deliveries** (customer, due date, address, outcome). Use **Refresh status** to reload.
2. Read the outcome before contacting the recipient or acting:

| Outcome | Meaning / action |
|---|---|
| sent | Gmail accepted the message for delivery. It does not prove it reached the inbox or was read. |
| failed | Sending failed (for example "failed (connection)"). Check the reason, sender/app password and office connectivity with IT. |
| unknown / Delivery uncertain | Sending may have happened but could not be confirmed. Check with the recipient before sending manually. |
| missed / Missed | The sending day passed. Arrange appropriate contact rather than expecting an out-of-date reminder. |
| Sending or awaiting verification | Not final yet. Refresh status. |

**Failed, uncertain and missed reminders are not automatically retried.** After fixing the problem, arrange a manual reminder; saving the settings again is not a resend button. Date changes keep delivery history and send no automatic cancellation email. Review the selected recipients whenever you change a due date.

## 9. Company letterhead and common remarks

1. Admin/Manager: open **Company Profile**. Fields: **Legal name**, **Registration No.**, **Address**, **Telephone**, **Fax**, **Email**, **Complaint hotline**, **Verified-by name**, **Verified-by title** and **Report number format** (must include the literal tokens `{YYYY}` and `{SEQ4}`, e.g. `MFE/SR/{YYYY}/{SEQ4}`). Tick **Company details confirmed as final**, then **Save company profile**. **[CONFIRM: client letterhead details and save]** — saving changes the live letterhead on every PDF, so it was not changed here.
2. For the logo, choose a PNG/JPEG up to 2 MB and **Upload logo**. **Reset to default** restores the default logo. **[CONFIRM: logo upload/reset]** — not changed here for the same reason.
3. **Service Common Remarks**: choose the **Service** (Automatic Sprinkler, Hose Reel, Hydrant, Fire Alarm Panel, FM200, CO2, …), then **Add common remark**, **Edit** or **Remove**. A common remark is a shortcut: make sure it describes the actual finding.

## 10. Daily and weekly admin checks

1. Daily: keep the office PC powered, connected and awake during service/reminder hours. Check that staff can reach the app and inspect **Email reminders** for failed/uncertain/missed outcomes.
2. Daily: arrange both database and photo backups using Appendix A. Keep their matching verification files and copy the set securely off the PC. **[CONFIRM: backup schedule, storage location and responsible person]** Backup scheduling/retention are client setup, not automatic app features.
3. Weekly: verify recent backups, review upcoming dates/recipients and confirm a current encrypted off-device copy of the email key exists. The database/photo scripts do not include this key.
4. After power loss or Windows updates: check Docker Desktop and the app before staff resume. IT startup and health checks are in Appendix A.
5. For help, contact **[CONFIRM: support name, telephone/email, office-PC custodian and escalation hours]**. Supply the error, visit reference and Support build; do not send passwords or the email key.

## 11. Troubleshooting

| Symptom | Meaning | Action |
|---|---|---|
| Server unreachable | The server or connection is unavailable. | Continue prepared local inspections; reconnect later. Admin asks IT to check PC/Docker/network. |
| Sync needs attention | An inspection, photo or location proposal failed or conflicted. | Open it, read the error and fix it; use **Retry Sync** on a proposal, or a corrected copy for rejected photo evidence. Preserve app data. |
| 1 proposal cannot be shown | A stored proposal has an unreadable format. | Send its reference to support. Other readable proposals remain usable. Do not approve it blindly. |
| Email failed | Sender authentication or delivery connection failed. | Check history/reason with IT; repair settings/connectivity and arrange manual contact. No automatic retry. |
| Delivery uncertain | It may already have been sent. | Check with the receiver before duplicating it. |
| Forgot password | No self-service reset exists. | See section 2, step 5. Do not remove the account. |
| PDF unavailable | Approval/history checks or corrections prevent download. | Review the Final Report notice; ask support if a corrected PDF is needed. |
| Form/visit not cached offline | This device has not prepared that form. | Reconnect and open it online first; do not invent a replacement visit. |
| Draft save/photo storage error | Local storage could not finish. | Keep the app open, free unrelated storage, retry; do not clear this app's data. |
| Supervisor cannot see a visit | The supervisor is not assigned to the technician who created it. | Admin assigns the supervisor under **Technician List** (section 2). |

## 12. Known limits

- **Corrected visits cannot download a PDF yet.** When a visit has audited corrections, the browser report shows the corrected values but **Download PDF** stays unavailable. Do not distribute an earlier PDF as if it contained the corrections. This needs a product change; ask support.
- **No password reset feature.** See section 2, step 5 for the workaround (deactivate and recreate a technician/supervisor; IT command for an administrator).
- **Offline needs the job opened online once.** A visit can be used without internet only after it has been downloaded to that phone online (it says **Ready for offline use**) and its form has been opened. A visit created or assigned while the phone was offline cannot be started.
- **New visits need to be online.** **+ New Service Visit**, **Add Customer** and all manager screens need the server. Only filling in, saving and photographing prepared inspections works offline.
- **Supervisors see only their assigned technicians' visits** and have no Operations screen.
- **A rejected photo cannot be replaced on the same record.** Use **Start corrected copy** (section 6).
- **Reminders are never retried automatically**, and an accepted inspection cannot be deleted (only unfinished visits can).

## 13. Glossary

| Term | Meaning |
|---|---|
| Admin/Manager | Owner's account for staff, customer and office settings. |
| Supervisor | Reviewer of inspections, proposals and reports; also permitted audited V7 corrections. |
| Technician | Field inspector completing their own authorized work. |
| Service visit / job | One visit containing its applicable systems and required inspections. |
| Zone / location | A grouping and a named place to inspect. |
| Draft | Editable work saved on this device. |
| Pending | Locally submitted work awaiting acceptance. |
| Accepted / Synced | The server confirmed the inspection; its original is frozen. |
| Corrected copy | A fresh editable draft replacing rejected local work. |
| Audited correction | A recorded amendment to accepted V7 values; the original remains. |
| Report approval | A decision authorizing a completed report; separate from inspection acceptance. |
| Sender / receiver | The Gmail account sending reminders / an address selected to receive them. |

## Appendix A — Admin/IT only: office PC, backups and health checks

**[CONFIRM: installed project directory and runtime paths]** The commands below follow the repository's operations runbooks; they were not run as a backup/deployment drill in this walkthrough. A qualified operator should confirm them on the client's Windows PC before handover.

### Start and check the system

1. Start Docker Desktop and wait until its engine is ready. Have IT configure its normal Windows startup and keep the PC awake.
2. Open PowerShell in the installed project folder. For an already-installed system, run:

```powershell
docker compose up -d
docker compose ps
```

3. Confirm postgres is healthy and proxy, api and reminder-worker are running. Open the configured app address and check sign-in. **[CONFIRM: client HTTPS/domain and health-check URL]** IT can check `/api/health`; a healthy API alone does not prove external HTTPS access or live Gmail delivery.

### Take and verify backups

1. With the system running, open PowerShell in the installed project folder.
2. Run both backups:

```powershell
.\scripts\Backup-Database.ps1
.\scripts\Backup-Uploads.ps1
```

3. Each backup produces a data file and a matching `.manifest.json` verification file. Default folders are `C:\InspectionSystem\runtime\backups\postgres` and `C:\InspectionSystem\runtime\backups\uploads` **[CONFIRM: client paths]**. A script error means the backup is not verified complete.
4. Verify each resulting data file using its actual path:

```powershell
.\scripts\Verify-Backup.ps1 -BackupPath '<actual database .dump path>'
.\scripts\Verify-Backup.ps1 -BackupPath '<actual uploads .zip path>'
```

5. Copy both data files and both matching manifests to approved off-device storage. Separately preserve `C:\InspectionSystem\runtime\operational\service-due-email.key` **[CONFIRM: configured key path or legacy override]** in an encrypted, access-controlled recovery set. Never include the key in an unencrypted dump/zip or a support message.
6. Agree the backup retention policy and schedule. These scripts do not prune old backups. **[CONFIRM: approved retention and off-device custody]** Have IT perform periodic restore drills in disposable targets; do not casually restore over the live system. Follow [Backup and restore runbook](../operations/backup-and-restore.md).

For email recovery, the matching database and original email key are needed. Do not replace the key to fix decryption; follow [Service due email operations](../operations/service-due-email.md) with the authorized IT contact.
