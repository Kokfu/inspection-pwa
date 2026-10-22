# 8. Known Limits and Future Improvements

## 8.1 Known limits

This is how the system works today. None of these loses data, but staff should know them.

1. **No "forgot password" link and no "change my password" screen.** Managers set Technician and Admin
   passwords; support sets Manager passwords.
2. **Manager accounts are handled by support** on the office computer, not in the app.
3. **A visit with corrections cannot download a PDF yet.** The report on screen shows the corrections.
4. **Failed, uncertain and missed reminder e-mails are not retried automatically.** Check the delivery history
   weekly.
5. **The office computer is a single point of failure.** If it is off, nobody can send work and the office cannot
   use the system. Phones keep their work safely until it is back.
6. New customers, new sites, reports, PDFs and all Manager and Admin screens need the internet.
7. Approved inspections cannot be deleted, only corrected, with a record of the change.
8. Clearing the app's data or uninstalling it before everything is sent deletes the unsent work.
9. There is no spreadsheet import; customers are entered on the **Add Customer** screen.
10. The very first opening of the app on a slow connection takes a little longer; after that it opens from the
    phone.
11. iPhones have not been tested for working without signal. Android phones have.
12. Cloudflare's free plan has no uptime guarantee. Very rarely the address may not open for a while even though
    the office computer is fine.
13. Reports show the **arrival time** only, as requested; there is no departure time.

## 8.2 Possible future improvements

Not part of this handover; listed so they can be discussed later:

1. A **"change my password"** screen, and a protected screen for managing Manager accounts.
2. **PDF download for visits with corrections.**
3. **Automatic retry** or a one-click resend for failed reminder e-mails.
4. **Spreadsheet import** of customers and sites.
5. A **second computer or a cloud server** as a standby, if downtime of the office computer becomes a problem.
6. Reading already-approved visits on the phone without signal.
7. **iPhone testing** and any fixes it needs.
