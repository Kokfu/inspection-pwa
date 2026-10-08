# Client user guide

Checked on 8 October 2026 against the local demo, build `build-20261008T130702Z`. **[CONFIRM]** marks a client setup detail or a step not exercised in the live UI during this walkthrough. This is a guide to using the current app, not production acceptance.

## Quick start — keep this page handy

| Who | Daily steps |
|---|---|
| Everyone | Open **[CONFIRM: company app address]**, choose your role, and sign in with your own account. Use **Menu** to move between screens. |
| Admin/Manager | Keep the office PC running. Check **Next Upcoming Service**, recipient selections and **Email reminders** delivery history. |
| Admin/Manager | Use **Add Customer** and **Services** to set up customers, sites and applicable systems. Set locations before creating the next visit. |
| Technician | Online: open **My Service Jobs**, use **Refresh**, wait for **Offline ready**, and check that needed visits say **Ready for offline use**. |
| Technician | Open a visit, choose a system, enter findings and attach each required photo. Draft work stays on this device. |
| Technician | **[CONFIRM: editable-form walkthrough]** Use **Save Draft** or wait for the saved confirmation, then **Submit Inspection**. Reconnect and use **Sync Now** if needed. |
| Technician | Check for **Synced**. **All submitted changes synced** does not include drafts you have not submitted. |
| Supervisor | Review accepted work and location proposals. Review/approve the completed report before it is distributed. |
| Admin/Manager | Keep both database and photo backups, their matching verification files, and the separate encrypted email key backup. See Appendix A. |
| If something fails | Preserve the phone's app data. Record the message, visit reference and Support build; call **[CONFIRM: support contact]**. |

## 1. Sign in, sign out and prepare a phone

1. Open **[CONFIRM: company HTTPS app address]**. Choose **Manager**, **Supervisor** or **Technician**. Choosing a card does not give a different account extra permissions.
2. **[CONFIRM: login-form wording]** Enter the username and password supplied by your administrator and sign in. Admin and technician sessions were verified in this walkthrough; the login fields themselves were completed by the owner.
3. Use **Sign out** when finished on a shared device. **[CONFIRM: sign-out confirmation wording]** Finish the confirmation shown. Avoid signing out before a technician has uploaded work needed that day.
4. **[CONFIRM: install on the client's phone]** Android Chrome: open the browser menu and choose **Install app** or **Add to Home screen**, then confirm. iPhone Safari: use Share → **Add to Home Screen** → **Add**. The wording depends on the phone/browser; these installation menus were not exercised here.
5. Technician: sign in online, use **Refresh**, open required visits/forms and wait for **Offline ready**. Check each needed visit says **Ready for offline use** before leaving coverage.

Offline work is for prepared inspection forms: typing, saving and taking photos continue without internet. New Service Visit and manager configuration require the server in the current UI. Do not clear site/app data to fix a connection problem.

### Header messages

| Message | Meaning |
|---|---|
| Online | The app currently has a working server connection. |
| Server unreachable | The server cannot be reached; prepared technician forms can still be used locally. |
| Preparing offline use | Offline setup has not finished. Stay connected and allow it to complete. |
| Offline ready | The app shell is ready to open offline. Also check the visits/forms you need. |
| Offline not available | This browser cannot provide the expected offline setup; ask support before field use. |
| N inspections waiting to sync | Locally submitted inspections are waiting for server confirmation. |
| Syncing… | Work is being transferred. |
| Sync needs attention | At least one inspection or photo is Failed/Conflict. Read its error. |
| All submitted changes synced | Submitted inspection work has no waiting/failing record or photo shown by this summary; unsubmitted drafts remain local. |

## 2. Admin/Manager: technicians and supervisors

1. Open **Technician List**. Under **Add Technician**, enter **Username**, **Person’s name** and **Password**; the password must have at least 12 characters. Choose **Role**: **Technician** or **Supervisor (review only)**, then **Add Technician**. **[CONFIRM: account creation submission]** This walkthrough inspected the form but did not create a staff account.
2. To edit a person's displayed name, change **Person’s name** beside the account and choose **Save name**. Set the technician's **Assigned supervisors** using the checkboxes. **[CONFIRM: staff-change submission]**
3. To stop access, choose **Deactivate** and confirm. The account becomes inactive and cannot sign in. **[CONFIRM: deactivation confirmation]** No staff account was deactivated during this walkthrough.
4. For permanent removal, select **Show deactivated technicians**, then **Permanently remove** beside the intended inactive technician. **[CONFIRM: removal dialog]** The implementation asks you to type the exact username. Used accounts keep historical records; unused accounts are deleted. This action is permanent. It was not performed here.
5. **Password reset:** there is currently no reset-password button or reset flow in this app. Contact **[CONFIRM: authorized administrator/IT recovery contact and procedure]**. Do not remove an account to solve a forgotten password.

The “review only” role label means a supervisor cannot administer staff/customer setup. Supervisors currently can make audited corrections to supported accepted V7 inspections; see section 7.

## 3. Admin/Manager: customers and applicable systems

1. Open **Add Customer**. Enter **Customer display name**, **Initial Site**, contact details and **Site Address**. Choose **Initial Assigned Services**, then **Create Customer**. **[CONFIRM: customer creation submission]**
2. Open **Services** to reach **Customer Configuration**. Search using **Customer name or code**, choose **Search**, and open the customer card.
3. Review **Contact Details** and **Sites**. Use **Edit**, **+ Add Site** or **Save Address** as appropriate. Under **Assigned Services**, select the systems that apply and choose **Save & Activate**. **[CONFIRM: configuration submission]**
4. Under **Services** on the customer page, open a system. Its tabs may include **Form wording**, **Preset rows** and **Settings**. Some systems state that wording cannot be customised yet.
5. Open **Service Catalog** to see available systems. **Retire** removes a system from future customer assignment; it leaves existing assignments intact. **[CONFIRM: retirement confirmation/submission]** Do not retire a system merely because one customer does not use it.

Saving customer settings creates a new configuration version. Existing visits keep the systems, wording and settings they were created with; new visits use the new version.

## 4. Locations, zones and technician proposals

### Admin/Manager setup

1. Open **Services** → customer → system → **Preset rows**, where that tab is available.
2. Choose **Add zone**, enter **Zone name**, then **Add location**. Enter **Location name**, select **Zone** and set **Preset rows**.
3. Edit existing names/counts in the same area. Review removals carefully. Choose **Save zones & locations**. **Reload** discards unsaved editor changes and reloads current settings.
4. **[CONFIRM: saving locations]** The fields and add controls were inspected, then the unsaved test edits were discarded with Reload; this walkthrough did not save a new configuration.

Some systems use one General location or separate tables instead of zones. Follow the system's available tabs rather than adding artificial zones.

### Technician proposals and review

1. Technician: open the visit and choose **Add a New Location**. **[CONFIRM: proposal form walkthrough]** Name it, choose/name its zone and use **Submit for Review**. A local proposal can wait for reconnecting; it does not grant permission to alter an existing frozen visit.
2. **[CONFIRM: format-saving controls]** A supported form can offer **Save as format for next visit**. This proposes the current row layout for review; it does not submit the inspection or change historical visits.
3. Admin or Supervisor: open **Location Proposals**, choose **Pending** and select a readable proposal. Check the target, submitted details and requested change.
4. Choose **Approve**, or enter **Note (required to reject, optional to approve)** and choose **Reject**. These decisions are terminal. Approvals merge into current customer settings for future visits.
5. Use **Approved** or **Rejected** to inspect past decisions. An unreadable proposal is listed by reference, but cannot be decided through the ordinary UI. Ask support to inspect it; other readable proposals remain usable.

The old demo proposal with reference **678f1e17** was rejected with an audit record on 8 October 2026. It no longer warns on Pending; its preserved unreadable submission is still listed on Rejected.

## 5. New visits, upcoming dates and recurrence

1. Technician, online: on **My Service Jobs**, choose **+ New Service Visit**. Select **Customer**, **Site** and **Applicable Fire Systems**. Review **Service Call No**, **Arrival** and **Departure**, then **Create Service Visit**. The server records creation date/time automatically. **[CONFIRM: creation submission]** The form was inspected without creating a visit.
2. Admin/Manager: use **Operations** to inspect visits. Use **Technician**, **Customer name**, **Apply** and **Clear filters** to find work.
3. Admin/Manager: open **Next Upcoming Service** to set a customer's next due date. **[CONFIRM: native date-control save on client device]** Review the saved date after editing. A due date does not itself create a service visit.
4. Open **Service routine**. Under **Cadence**, choose **Every N weeks** or **Monthly on day N**. Weekly uses **Every number of weeks** (1–52), **Weekday** and **First due date**. **[CONFIRM: monthly fields]** Monthly uses day 1–31 and a matching first date; months without that day are skipped. Choose **Save routine**.
5. Closing a service visit advances an active routine once. A manual date change must match its weekday/month day; clearing the due date pauses the routine. **Manual dates** keeps scheduling under manual control.
6. To remove an unfinished visit, Admin uses **Delete** in Operations; Technician opens the visit and uses **Delete unfinished visit**. The technician's button is available only before inspection work starts, while online. Accepted records prevent deletion. **[CONFIRM: deletion confirmation/submission]** No visit was deleted here.

## 6. Technician: complete an inspection

1. Open **My Service Jobs** → visit → system under **Applicable Systems**. A completed system offers **View inspection**.
2. **[CONFIRM: editable-form walkthrough]** Enter readings and results, using the visit's labels. Current V7 uses **Good / Not Good / Complete Repair / N.A.**; older visits may use **Good / Poor / Not Relevant**.
3. For every finding that requires evidence, enter that field's own remark and attach its own photo. **[CONFIRM: live photo picker/camera]** Use **Take Photo** or **Choose Existing Photo**; the older pressure-photo form says **Camera unavailable? Choose Existing Photo**. Preview the picture before submitting. Read [Evidence policy](EVIDENCE_POLICY.md) for limits and older-form exceptions.
4. **[CONFIRM: live draft save and submission]** Wait for the draft's saved confirmation; use **Save Draft** when offered. Autosave is local. Use **Submit Inspection** to freeze and queue completed work. Fix any listed required fields/photos first.
5. Reconnect. Automatic sync attempts submitted work; **Sync Now** offers a manual check. Photos upload first. Pending is not completion: wait for the inspection to become **Synced**.
6. If evidence fails, open the affected record and read its error. **[CONFIRM: live corrected-copy action]** Choose **Start corrected copy**, confirm, fix the copied draft, then submit it. The rejected original is archived locally and will not resend. Do not replace an already-submitted photo on the same record.
7. **[CONFIRM: live visit-close button and confirmation]** After all required inspections are accepted, use the visit's **Complete Service** action. Do not assume a completed form alone closes the whole visit.

Unsent photos are retained by the app. The 24-hour rule concerns unused draft photos of an already-synced inspection; the 30-day rule concerns confirmed-uploaded local copies. Neither is a deadline for deleting unsent work.

## 7. Reports — Admin/Manager, Supervisor and Technician

1. Admin/Manager or Supervisor: open **Current Services Done**, search **Customer name or code**, choose the customer and the completed visit's **View Final Report**. The customer history can also include unfinished visits with **View Progress**.
2. Review the completed report. **Approve report** is a separate decision from accepting an inspection. **[CONFIRM: approval action in an awaiting-approval report]** The walkthrough viewed a report already approved by a supervisor; it did not change approval.
3. Use **Download PDF** after approval. If report/history checks fail or corrections exist, the app may withhold download. The current V7 browser report shows audited corrections, but PDF download remains blocked when corrections exist. Contact support; do not distribute an older PDF as corrected.
4. To correct supported accepted V7 work, open **Operations** → visit → **Accepted records** → **Review / correct**. Find a field with **Search fields**, enter the replacement and **Reason for these corrections (3–500 characters)**, then **Save corrections**. The original stays in history. **[CONFIRM: correction save]** The editor was inspected without saving.
5. Both Admin and Supervisor can currently append corrections. Supervisor can also **Approve review**. **[CONFIRM: supervisor session/review action]** These permissions were verified in source, not by a signed-in supervisor walkthrough. Admin can **Withdraw approval** with a reason; **[CONFIRM: withdrawal submission]** this was not exercised.
6. Technician: use the completed visit's report action when online and authorized. **[CONFIRM: technician Completed Services/report menu]** Technicians view their own authorized accepted work and cannot make accepted-record corrections.

## 8. Email reminders — sender and receivers are different

### Set the sender (Admin/Manager)

1. Use **Menu** → **Email reminders**. **Sender Gmail address** is the client company's sending account: **[CONFIRM: client Gmail account]**. It is not a recipient list.
2. Sign in to that account at [Google Account](https://myaccount.google.com/). Turn on **2-Step Verification** under its security settings.
3. Open [App passwords](https://myaccount.google.com/apppasswords), sign in again if requested, name the password for this inspection system, and create it. Copy the generated password into the app's **Gmail app password** field; use **Save email settings**. Google requires 2-Step Verification, may restrict App passwords for some account types/protection settings, and revokes them when the Google account password changes. [Google's instructions](https://support.google.com/accounts/answer/185833?hl=en).
4. **[CONFIRM: client Google menus and sender save]** Google setup and saving a real sender were not performed here. If App passwords is unavailable, contact the account administrator/support. Do not use the normal Gmail password.
5. The stored app password is not displayed. Leave the field blank to keep it; changing the sender requires a new app password.

### Select receivers

1. On **Email reminders**, find the person under **Staff notification addresses**. Enter **Reminder email** and choose **Save address**.
2. Open **Next Upcoming Service** → scheduled customer → **Reminder recipients**. Select the active technicians/supervisors who should receive this customer's reminder. Staff without an email are unavailable for selection.
3. Under **Additional recipients**, enter **Name** and **Email**, then **Add address**. Choose **Save recipients** and review **Effective recipients** and **Planned send**. **[CONFIRM: address/recipient save]** These controls were inspected without changing addresses or sending email.

Reminders go to each selected address individually at **09:00 Malaysia time on the day before the customer's due date**. The office PC and worker must be running. The worker checks every 15 minutes and on startup: restarting later that day can catch up; restarting after midnight records a missed reminder rather than sending an obsolete “tomorrow” message.

### Delivery history and failures

1. Open **Email reminders** → **Delivery status** → **Recent deliveries**. Use **Refresh status** to reload.
2. Read the outcome before contacting the recipient or taking manual action:

| Outcome | Meaning / action |
|---|---|
| sent | Gmail accepted the message for delivery. It does not prove delivery to the inbox or that anyone read it. |
| failed | Sending failed. Check the stated reason, sender/app password and office connectivity with IT. |
| unknown / Delivery uncertain | Sending may have happened, but confirmation is uncertain. Check with the recipient before sending manually. |
| missed / Missed | The sending day was missed. Arrange appropriate contact rather than expecting an outdated automatic reminder. |
| Sending or awaiting verification | Processing or verification is not final yet. Refresh status. |

**Failed, uncertain and missed reminders are not automatically retried.** After fixing a problem, arrange an appropriate manual reminder; saving the settings again is not a resend button. Date changes preserve delivery history and send no automatic cancellation email. Review copied recipient selections whenever you change a due date.

## 9. Company letterhead and common remarks

1. Admin/Manager: open **Company Profile**. Review **Legal name**, **Registration No.**, address/contact details, verified-by details and **Report number format**. Confirm **Company details confirmed as final**, then **Save company profile**. **[CONFIRM: client letterhead details and save]**
2. For the logo, choose a PNG/JPEG up to 2 MB and use **Upload logo**. **Reset to default** restores the default logo. **[CONFIRM: logo upload/reset]** These controls were inspected without changing the letterhead.
3. Open **Service Common Remarks**. Select **Service**; use **Add common remark**, **Edit** or **Remove** as needed. **[CONFIRM: remark save/removal]** The controls were inspected without altering the list. A common remark is a shortcut; ensure the remark describes the actual finding.

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
| Sync needs attention | An inspection or photo failed/conflicted. | Open it, read the error, fix it; use corrected copy for rejected photo evidence. Preserve app data. |
| 1 proposal cannot be shown | A stored proposal has an unreadable format. | Send its reference to support. Other readable proposals remain usable. Do not attempt to approve it blindly. |
| Email failed | Sender authentication or delivery connection failed. | Check history/reason with IT; repair settings/connectivity and arrange manual contact. No automatic retry. |
| Delivery uncertain | It may already have been sent. | Check with the receiver before duplicating it. |
| Forgot password | No self-service reset exists. | Contact the authorized admin/IT recovery contact. Do not delete the account. |
| PDF unavailable | Approval/history checks or corrections prevent download. | Review the Final Report notice; ask support if corrected PDF is needed. |
| Form/visit not cached offline | This device has not prepared that form. | Reconnect and open it before field use; do not invent a replacement visit. |
| Draft save/photo storage error | Local storage could not finish. | Keep the app open, free unrelated storage, retry; do not clear this app's data. |

## 12. Glossary

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
