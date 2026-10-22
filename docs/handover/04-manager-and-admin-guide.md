# 4. Manager and Admin Guide

Managers and Admins work in an office browser (a phone also works). These screens need an internet
connection.

## 4.1 Menus

| Role | Menu |
|---|---|
| Manager | Home, Technician List, Add Customer, Services, Service Catalog, Operations, Current Services Done, Next Upcoming Service, Service Common Remarks, Approvals, Photo KPI, Settings |
| Admin | Home, Services, Current Services Done, Approvals, Photo KPI |

**Home** shows summary tiles (clients, inspections this month, passed, not OK, N/A), a trend chart, reminders
of overdue services, and a card for each screen. The red number on **Approvals** is how many items are waiting
for a decision.

## 4.2 Customers and their services (Manager)

1. **Add Customer**: fill in **Customer display name**, **Initial Site**, **Telephone No**, **Contact**,
   **Fax**, **Contract No.**, **Service Frequency** and **Site Address**, tick the **Initial Assigned Services**
   and tap **Create Customer**. If a very similar name already exists, the app warns you so you do not create
   the same customer twice.
2. **Services** lists every customer with their sites and services. Search by customer name or code.
3. **Manage configuration**: edit contact details, add sites (**+ Add Site**), tick which fire systems apply,
   then **Save & Activate**.
4. Inside a customer's service you can set **Zones**, **Locations** and **Preset rows** (the rows technicians
   see in the form), and adjust **Form wording** (the ✎ beside a label → **Save wording**;
   **Preview as technician** shows the result). Do this **before** the next visit is created.
5. **Archive** hides a customer or a site from the active lists. It can be restored later.

Changes apply to **new** visits. Visits already created keep the setup they started with.

**Before go-live**, all current customers, sites and their fire systems must be entered here. There is no
import from a spreadsheet, so plan the time for it.

## 4.3 Service Catalog and Service Common Remarks (Manager)

- **Service Catalog** lists the fire systems the company offers. **Retire** stops a system being offered to
  *new* customers; existing customers keep it.
- **Service Common Remarks** are ready-made remark phrases for each system, which technicians pick from a list.
  Add, edit or remove them. Make sure each one describes a real finding.

## 4.4 Approvals (Manager and Admin)

**Approvals** has five cards. Each list has **Pending / Approved / Rejected** tabs (Pending first), a customer
filter and a search box.

| Card | What arrives | What you do |
|---|---|---|
| **Location Proposals** | A technician suggests a new location or a new row layout for a customer | **Approve**, **Edit before approval** → **Approve with changes**, or **Reject** with a short note. Applies to **future** visits. |
| **Site Requests** | A technician typed a new site while creating a visit | **Approve** (the site becomes active) or **Reject** with a reason |
| **Repair Visits** | Submitted repair visits | **Approve** (a repair report number is issued) or **Return to technician** with a reason |
| **Service Reports** | Finished service visits waiting for report approval | Open, check, **Approve report** |
| **Remark Requests** | A technician typed a new remark and asked for it to become a common remark | Approve (it becomes available to everyone for that section) or reject. The visit's own report uses the typed remark either way. |

Good to know:

- Decisions cannot be undone, except that a Manager can **Withdraw approval** of a service report.
- An Admin only sees items from the technicians assigned to them (chapter 2.2).
- If a proposal says **Cannot approve**, read the reason. The customer's setup changed since the request; use
  **Edit before approval** or ask for a new request.

## 4.5 Checking and correcting work

- **Operations** lists every visit with Open / Completed / Total counts. Sort by tapping a column heading.
  Filter by **Technician** or customer. Open a visit to see its systems and **Accepted records**.
- **Delete** removes an *unfinished* visit. A visit with accepted records cannot be deleted.
- **Current Services Done**: search a customer; finished visits offer **View Final Report** and
  **Download PDF**; unfinished ones offer **View Progress**.
- **Correcting a record:** Manager: **Operations** → visit → **Accepted records** → **Review / correct**.
  Admin: **Current Services Done** → customer → **View Progress** → **Review / correct**. Change the value, give
  a **Reason for these corrections**, tap **Save corrections**. The original value is kept in the history.
  **Approve review** marks the record as reviewed; a later correction needs a new review.

## 4.6 Reports and PDFs

- **View Final Report** shows the report on screen. **Download PDF** works once the report is approved.
- The PDF carries the company letterhead, a report number (for example **MFE/SR/2026/0001**), the summary of
  testing, every system's results, remarks and photos.
- A visit with corrections shows the corrected values on screen, but its PDF button stays off (chapter 8). Do
  not send an older PDF as if it included the corrections.
- Approving freezes the report. Check it before you approve.

## 4.7 Photo KPI (Manager and Admin)

Shows how photos in approved work were taken: with the in-app camera, from the gallery, or unknown, per
technician and month by month. Camera photos carry a trustworthy date and time; many gallery photos from one
technician is worth a conversation.

## 4.8 Settings (Manager)

**Settings** has two cards:

- **Company Profile**: legal name, registration number, address, telephone, fax, e-mail, complaint hotline,
  the "verified by" name and title, the report number format, and the **logo** (PNG or JPEG up to 2 MB).
  Saving changes the letterhead on every PDF made **afterwards**; PDFs made earlier do not change. Tick
  **Company details confirmed as final** once everything is correct.
- **Email Reminders**: see 4.9.

## 4.9 Next service dates and e-mail reminders (Manager)

### Next Upcoming Service

- Lists customers with a next service date (**Scheduled**) and those without (**Not yet scheduled**), as a list
  or a calendar.
- **Service routine** (row menu) sets how often a customer is due: **Manual dates**, **Every N weeks** or
  **Monthly on day N**. When a visit is completed, the next date moves on by itself.
- A due date does **not** create a visit. Technicians still create the visit.

### Set up the sender (once)

1. Use the company's Gmail account. In that Google account turn on **2-Step Verification**, then create an
   **App password** (Google account → Security → App passwords). Do not use the normal Gmail password.
2. **Settings** → **Email Reminders**: enter the Gmail address and the app password → **Save email settings**.
   The screen shows "Sender configured". The password is never shown again.

### Choose who receives reminders

1. **Email Reminders** → **Staff notification addresses**: enter each staff member's reminder e-mail →
   **Save address**.
2. **Next Upcoming Service** → the customer's row menu → **Reminder recipients**: tick the staff to notify, add
   outside people under **Additional recipients**, → **Save recipients**. A scheduled customer with nobody
   selected shows "Reminder blocked: add recipients".

### When reminders are sent

At **09:00 the day before** the due date, one e-mail per person, with the customer name and the service date.
The office computer must be on. If it was off at 09:00 it catches up later that day; if it stays off past
midnight, that reminder is recorded as **Missed**.

### Check the delivery history weekly

| Status | Meaning | What to do |
|---|---|---|
| sent | Gmail accepted it | Nothing |
| failed | It could not be sent | Check the Gmail app password and internet; contact the person yourself |
| Delivery uncertain | It may or may not have gone | Ask the person before sending anything again |
| Missed | The sending day passed (computer was off) | Contact the customer yourself |

Failed, uncertain and missed reminders are **not** retried automatically.
