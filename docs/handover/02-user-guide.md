# 2. User Guide

How to use the Inspection PWA, by role. Screen names in **bold** are the words shown in the app.
Roles: **Manager** (full access), **Admin** (review only), **Technician** (field work). See the
[role table](README.md#the-one-thing-to-understand-first-role-names).

## 2.1 What the system does, in one page

1. A **Manager** sets up **customers**, their **sites**, and which **fire systems** apply
   (Automatic Sprinkler, Hose Reel, Hydrant, Fire Alarm Panel, FM200, CO2, Dry/Wet Riser, Portable
   Fire Extinguisher, Fire Rated Roller Shutter, and others in the **Service Catalog**).
2. A **Technician** goes to site, opens or creates a **service visit**, fills in one form per system
   (Good / Not Good, remarks, photos) and submits. This works with no internet.
3. When the phone is back online, the work uploads automatically. The server confirms each item
   before the phone marks it **Synced**.
4. A **Manager** or **Admin** reviews the accepted work, can make audited corrections, and
   **approves the report**. The approved **Final Report** can be downloaded as a PDF.
5. If a fault is found, a technician later creates a **repair visit**. It records Done Repair /
   Not Done with before-and-after evidence and is approved by a Manager or Admin.
6. The system emails **service reminders** to chosen staff and extra addresses the day before each
   customer is due.

## 2.2 Signing in and out (everyone)

1. Open the company app address **[FILL IN: https://your-domain]**.
2. Choose your card: **Technician**, **Manager** or **Admin**.
3. Enter your own **Username** and **Password** and press **Sign in**. Never share a login.
4. Use **Menu** (phone) or the left-hand menu (larger screens) to move around.
5. **Sign out** (top right). If you are a technician with submitted work that has not uploaded, the
   app lists it and asks "Sign out anyway?". The work stays on the phone and uploads after you sign
   back in as the **same user**. Prefer to wait until it has uploaded.

**Install on a phone** (recommended for technicians): Android Chrome → menu → **Install app** or
**Add to Home screen**. iPhone Safari → Share → **Add to Home Screen**. Installed apps reopen
faster and are less likely to be cleared by the browser. **[FILL IN: confirmed on the client's phones]**

### Menus by role

| Role | Menu |
|---|---|
| Technician | Home, New Service Visit, Repair List, Add Customer, Completed Services, Upcoming Services |
| Manager | Home, Technician List, Services, Operations, Add Customer, Current Services Done, Next Upcoming Service, Service Common Remarks, Service Catalog, Approvals, Settings |
| Admin | Home, Services, Current Services Done, Approvals |

The Manager **Home** screen shows dashboard tiles (clients, inspections, passed, not OK, N/A) and
the same destinations as cards. A red number on **Approvals** is the count of items waiting for a decision.

---

## 2.3 Manager features

### Staff accounts (Technician List)
Create, rename, reset passwords, deactivate and delete Technician and Admin accounts, and assign
Admins to Technicians. Full instructions: [01-accounts-and-access.md](01-accounts-and-access.md#17-create-edit-and-remove-technician-and-admin-accounts-in-the-app-as-manager).

### Customers and sites (Add Customer, Services)
1. **Add Customer**: enter **Customer display name**, **Initial Site**, **Telephone No**, **Contact**,
   **Fax**, **Contract No.**, **Service Frequency** and **Site Address**. Tick the **Initial Assigned
   Services** and press **Create Customer**.
2. **Services** opens **Customer Configuration**. Search by **Customer name or code**. Each card
   shows sites, assigned services and the configuration **Version**.
3. **Manage configuration**: edit **Contact Details**, add sites (**+ Add Site**), tick which systems
   apply and press **Save & Activate**.
4. **Archive** hides a customer from active lists; it can be restored. Sites can also be archived
   and restored (with a name-clash warning if a new site now uses the same name).
5. Saving settings creates a **new configuration version**. Existing visits keep the setup they were
   created with; new visits use the new one.

### Locations, zones and wording
Inside a customer's service you can set **Zones**, **Locations** and **Preset rows** (the default
table rows technicians see) and customise **Form wording** (the ✎ beside a label, then **Save wording**;
**Preview as technician** shows the result). Set locations *before* the next visit is created.

### Service Catalog and Service Common Remarks
- **Service Catalog** lists the available systems. **Retire** stops a system being offered to *new*
  customers; existing assignments stay. Do not retire a system because one customer does not use it.
- **Service Common Remarks** are saved remark phrases per system. Add, edit or remove them. A common
  remark is a shortcut: make sure it describes the actual finding.

### Operations and Current Services Done
- **Operations** lists every visit with Open / Completed / Total counts. Filter by **Technician** or
  **Customer name**. Open a visit to see its systems and **Accepted records**.
- **Delete** (beside a visit) removes an *unfinished* visit. A visit with accepted records shows
  "Cannot delete: accepted records exist." Accepted inspections can never be deleted.
- **Current Services Done**: search a customer; completed visits offer **View Final Report**,
  **Download PDF** and **Archive**; unfinished ones offer **View Progress**.

### Next Upcoming Service and recurrence
- Lists customers with a due date (**Scheduled**) and those without (**Not yet scheduled**).
- Under a customer, **Service routine** sets **Cadence**: **Manual dates**, **Every N weeks**
  (1 to 52, with weekday) or **Monthly on day N**. Press **Save routine**.
- Closing a service visit advances an active routine automatically. A due date does **not** create a
  visit; technicians still create it.
- **Reminder recipients** (per customer) is described in 2.7.

---

## 2.4 Approvals (Manager and Admin)

**Approvals** is one hub with four cards. Each shows a red count of items waiting. Each card opens
its own list with **Pending / Approved / Rejected** tabs (Pending opens first), a **customer filter**
(applies instantly) and a **Search** box (applies when you press Search; the two combine).

| Card | What arrives here | What you do |
|---|---|---|
| **Location proposals** | A technician proposes a new location or a new row layout for a customer's system ("Save as format for next visit", or first-visit Roller Shutter layout) | **Approve**, **Edit before approval** then **Approve with changes**, or **Reject** with a note of 3+ characters. It applies to **future** visits only. |
| **Site requests** | A technician typed a brand-new site while creating a visit | **Approve** (site becomes active) or **Reject** with a reason of 3 to 500 characters |
| **Repair visits** | Submitted repair visits waiting for review | **Approve** (report number is issued) or **Return to technician** with a reason |
| **Service reports** | Completed service visits whose report awaits approval | Open, check, **Approve report** |

Rules that matter:
- Decisions cannot be undone, except an approved service report which a Manager can **Withdraw approval**.
- An **Admin** (review-only) sees only items from the technicians assigned to them.
- Approving a *report* is separate from *accepting an inspection*. Inspections are accepted by the
  server when they sync; the report is approved by a person.
- Location proposals are re-checked against the latest customer setup at approval time. If it says
  **Cannot approve**, read the reason; a fresh request may be needed.

### Reviewing and correcting accepted work
Manager: **Operations** → visit → **Accepted records** → **Review / correct**. Admin:
**Current Services Done** → customer → **View Progress** → **Review / correct**. Change a value, type a
**Reason for these corrections (3–500 characters)**, press **Save corrections**. The original value is
kept in history. **Approve review** marks a record "Reviewed by Admin". A saved correction cancels any
earlier review. Corrections are permanent audit entries.

### Final Report and PDF
**View Final Report** shows the report and its approval line. **Download PDF** works once the report is
approved. A visit that has audited corrections shows corrected values on screen, but the **PDF
download stays unavailable** (known limit, see file 05). Do not hand out an older PDF as if it
included the corrections.

---

## 2.5 Settings (Manager only)

**Settings** is a hub with two cards:

| Card | What it holds |
|---|---|
| **Email reminders** | Sender Gmail, staff reminder addresses, recipient gaps, delivery history (see 2.7) |
| **Company profile** | Legal name, registration number, address, telephone, fax, email, complaint hotline, verified-by name and title, **Report number format** (must contain the literal tokens `{YYYY}` and `{SEQ4}`, for example `MFE/SR/{YYYY}/{SEQ4}`), logo (PNG or JPEG up to 2 MB; **Reset to default** restores the default) |

Saving **Company profile** changes the letterhead on every PDF generated afterwards. PDFs already
generated are not rewritten. Tick **Company details confirmed as final** only when they are.

---

## 2.6 Technician features

### Before leaving for site (online)
1. Sign in online. Open **My Service Jobs** and press **Refresh**.
2. Wait for the header chip **Offline ready**.
3. Check every visit you need says **Ready for offline use**.
4. Open the forms you expect to fill at least once while online.

### Create a service visit
**+ New Service Visit** → choose **Customer** (or **+ Add New Customer**, online only) → **Site** → tick
**Applicable Fire Systems** → optionally **Service Call No**, **Arrival**, **Departure** →
**Create Service Visit**. **Reuse Previous Service Format** copies the last visit's system choice.

- Online: the server creates it and gives the **SV-…** number at once.
- Offline, for customers and sites already on the phone: the phone creates it, the card shows
  "SV number given when synced", and the SV number arrives after sync. Arrival time comes from the
  phone clock.
- Typing a brand-new site needs a connection. It is sent for approval as a **Site request**, and the
  visit continues.

### Fill in an inspection
1. Open a visit → under **Applicable Systems** choose **Start inspection**. Systems with several
   locations (CO2, FM200 and so on) list their locations; open one.
2. Use the labels shown: **Good**, **Not Good**, **Complete Repair**, **No Need Checking / N.A.**
   (detector rows use **Normal / Test / Isolation**). Each row has a **Remark** list.
3. For each finding that needs evidence (**Not Good** or **Complete Repair**), attach **one photo for that row**:
   **Take Photo** or **Choose Existing Photo**. Prefer the camera: a photo picked from the gallery is
   stamped with the time it was picked, not the time it was taken, so it is weaker evidence. Read [Evidence policy](../client/EVIDENCE_POLICY.md).
4. **Save Draft** (drafts also autosave as you type), then **Submit Inspection**. If something is
   missing, a **Complete before submitting** list shows each gap.
5. After submit: "Submitted on this device — waiting to sync." It uploads on its own when the
   connection is good; **Sync Now** forces a check.
6. When the server confirms, the form becomes **Inspection Complete** with a **Pending Review** banner
   until an Admin or Manager approves. Accepted answers cannot be edited.
7. When every required inspection is accepted, **Complete Service** closes the visit.
8. **Completed Services** lists closed visits; **View Report** opens the final report (online).

If evidence is rejected, open the record, read the error, and choose **Start corrected copy**. A
submitted photo cannot be replaced on the same record.

### Add a new location (proposal)
In a visit, **Add a New Location**: choose **System**, type **Location name**, pick an **Existing zone**
or **New zone**, then **Save Draft** or **Submit for Review**. Offline, it is saved on the phone and
shown as "pending sync". It does not change the current visit; it appears from the next visit once approved.
Statuses: **Pending review**, **Approved**, **Approved with changes**, **Rejected**, **Withdrawn**.
Offline you see only local delivery states, never a guess at approval. You can **Withdraw** a pending
request (online), **Discard before sync** an unsent one, and **Revise and resubmit** a rejected or
withdrawn one.

### Repair visits (Repair List)
Use this when returning to fix items found Not Good.

1. Menu → **Repair List**. Tabs: **In Progress** and **Completed**. Press **+ New Repair Visit**.
2. Choose **Customer** (existing customers only) → **Site** → **Service Call No**. Arrival comes from
   the phone clock.
3. **Previous visit** (optional): pick one **approved** visit for the same customer and site that you
   created, either a service visit or an earlier repair visit. With a previous service visit, its fields
   are listed with **Not Good** first and marked. With a previous repair visit, only the fields it
   covered are listed, with **Not Done** first. With none, the list comes from the customer's current setup.
4. Pick **Fields to repair** (at least one) by **System → Unit/Location → Section → Field**. Only
   Good / Not Good / N.A. fields can be chosen, not readings or quantities.
5. The repair form has one card per field:
   - **Before** (read only): the previous result, remark and photo. "No photo recorded at previous
     visit" or "No previous visit" is shown when there is none.
   - **After**: **Done Repair** or **Not Done** (required), a remark (required; for Not Done it is the
     reason) and **one photo** (required).
6. **Submit** (works offline). The visit number is **RV-YYYYMMDD-NN**, given when synced. Status goes to
   **Awaiting approval**.
7. A Manager or Admin **Approves** (report number **MFE/RR/YYYY/NNNN** is issued and the PDF is final) or
   **Returns to technician** with a reason. A returned visit shows **Returned** and you edit the same
   visit directly and resubmit. After approval it is locked.
8. Unstarted repair visits can be deleted. A repair visit never changes the original service visit or its PDF.

### Other technician screens
- **Add Customer**: creates a customer record. Works offline (queued); marked synced only when the
  server confirms the exact record.
- **Upcoming Services**: read-only list of customers you have serviced and when each is next due.

---

## 2.7 Email reminders

The system emails a reminder to selected people the day before a customer is due. **Sender** and
**receivers** are different things.

### Set the sender (Manager: Settings → Email reminders)
1. Use the client's Gmail account **[FILL IN: sender Gmail address]**.
2. In that Google account turn on **2-Step Verification**, then create an **App password** at
   `myaccount.google.com/apppasswords`. Do **not** use the normal Gmail password.
3. Enter the address and the app password under **Email reminders** and press **Save email settings**.
   The screen then shows "Sender configured". The password is never displayed again; leave it blank
   to keep it. Changing the sender needs a new app password.
4. The office network must allow outbound port **587** to Gmail.

### Choose receivers
1. **Email reminders** → **Staff notification addresses**: find the person, type their **Reminder email**,
   press **Save address**.
2. **Next Upcoming Service** → the customer → **Reminder recipients**: tick the staff to notify; under
   **Additional recipients** add **Name** and **Email** for outsiders; press **Save recipients**. The panel
   shows the **Planned send** time. A scheduled customer with nobody selected shows "Reminder blocked:
   add recipients." and appears under **Recipient gaps**.

### When it sends
**09:00 Malaysia time on the day before the due date**, one email per recipient, containing only the
customer name and next service date. The worker checks every 15 minutes and at startup. If the PC was
off at 09:00, it catches up the same day. If it is restarted after midnight, it records **Missed** and
does not send an out-of-date "tomorrow" message.

### Read the delivery history
| Outcome | Meaning |
|---|---|
| sent | Gmail accepted it. Does not prove it was read |
| failed | Sending failed. Check sender, app password, internet |
| Delivery uncertain | May have been sent. Ask the recipient before resending |
| Missed | The sending day passed. Contact the customer manually |
| Sending or awaiting verification | Not final. Press **Refresh status** |

**Failed, uncertain and missed reminders are never retried automatically.** Saving the settings again is
not a resend button.

---

## 2.8 Quick troubleshooting

| What you see | What to do |
|---|---|
| Server unreachable | Continue prepared local work. Reconnect later. Manager asks IT to check the office PC, Docker and network |
| Sync needs attention | Open the item, read the error. Use **Retry Sync** on a proposal. Never clear app data |
| Admin cannot see a visit | The Admin is not assigned to that technician (Technician List → Assigned Admins) |
| PDF unavailable | Report not approved yet, or the visit has corrections (known limit) |
| Form or visit not available offline | Reconnect and open it online first. Do not recreate it |
| Draft save or photo storage error | Keep the app open, free phone storage, retry. Do not clear app data |
| Forgot password | Technician or Admin: Manager sets a new one. Manager: IT uses the office-PC command (file 01) |
| Email failed or uncertain | Check the delivery history and reason; fix sender or network; contact the recipient manually |

When reporting a problem, give: the error text, the visit reference (for example SV-20261008-79 or
RV-…), the **Support build** shown at the top of the screen, and who you are signed in as. Never send
passwords or the email key.
