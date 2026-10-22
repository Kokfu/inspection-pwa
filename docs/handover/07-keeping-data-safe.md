# 7. Keeping Data Safe

## 7.1 Where your data is

- **On the office computer:** all customers, visits, results, photos, reports, staff accounts and the history of
  who did what. Nothing is kept with the developer or in an outside database.
- **On technicians' phones:** their unsent work and the customer lists they downloaded for offline use.
- **In the backups:** a full copy of everything on the office computer.
- **Cloudflare**, the service that connects the internet to your office computer, only passes the encrypted
  connection through. It does not keep your records.

## 7.2 What the system already does

- Every connection is **encrypted** (the padlock in the browser).
- Nobody can sign up by themselves. Every account is created by a Manager or, for Managers, by support.
- Passwords are stored scrambled; **nobody can read them back**, including the developer.
- After several wrong passwords, sign-in pauses before the next try.
- **Each person sees only what they need:** technicians see their own visits; Admins see their assigned
  technicians; only Managers manage staff, customers and settings.
- **History:** account changes, approvals and corrections are recorded with who and when. Approved inspections
  cannot be deleted, only corrected, and every correction is recorded.
- The office computer accepts no direct connections from the internet; it connects out to Cloudflare instead,
  so no router changes were needed.
- The Gmail app password for reminders is stored scrambled and never shown again.

## 7.3 What the company must do

### Accounts

1. Keep **two Managers**, held by two different trusted people. Never share a Manager login.
2. Give **every** technician and admin their own account.
3. Hand out passwords in person or by phone call, never in a group chat or e-mail.
4. When someone leaves: **Deactivate** their account the same day (chapter 2.4). For a Manager, ask support.
5. Keep important passwords in a **password manager** (for example Bitwarden, 1Password, or the one built into
   Google or Microsoft): the Manager passwords, the Cloudflare login, the domain login (`mfets.com`), the Gmail
   account, the office computer's Windows login, and the system's secret settings file that support gives you.
6. Turn on **two-step verification** for the Cloudflare account, the domain account and the Gmail account.
   Whoever controls Cloudflare controls where the app address points.

### The office computer

7. Keep it where strangers cannot touch it. Lock the screen when leaving it (**Windows key + L**).
8. Keep Windows security updates and antivirus (Windows Security) on.
9. Only give remote access (AnyDesk, TeamViewer and similar) to people you have confirmed, and close it when not
   in use.

### Phones

10. Every phone used for the app must have a **screen lock** (PIN, pattern or fingerprint).
11. Do not let others use a phone that is signed in to the app.
12. **Lost or stolen phone:** tell a Manager at once. The Manager sets a new password for that person, which
    signs the lost phone out. Unsent work on that phone is lost with it.
13. Before giving a phone to someone else or resetting it: check **All submitted changes synced**, then sign out.

### Reports and backups

14. Report PDFs contain customer names, addresses, phone numbers and photos of their premises. Send them only to
    that customer.
15. A backup contains everything. Keep backup drives locked away; never e-mail a backup or leave a backup drive
    in a car.

## 7.4 Personal data (PDPA)

The system holds personal data: staff names; customer contact names, phone numbers, e-mail addresses and
addresses; photos of customer premises; and a history of staff actions. Under Malaysia's Personal Data
Protection Act 2010 (amended in 2024), the company is responsible for it. Points to agree with your adviser
(this is not legal advice):

- Tell customers and staff what is collected and why (for example in the service agreement).
- Decide how long visits, reports and photos are kept. The system keeps them until removed; nothing is deleted
  automatically.
- Decide who may receive report PDFs and reminder e-mails.
- If data may have been exposed (a lost unlocked phone, a leaked password, a stolen backup drive), change the
  affected passwords at once and contact support. Ask your adviser whether you must report it.
