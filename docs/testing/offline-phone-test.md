# Offline Phone Test

Run this only against a production build served over HTTPS.

1. Open the HTTPS origin on a physical phone.
2. Confirm the page loads and the service worker is installed.
3. Confirm the app reports the shell is ready for offline use.
4. Add the app to the home screen.
5. Disable Wi-Fi and mobile data.
6. Force-close the PWA.
7. Reopen it from the home screen.
8. Confirm the app opens.
9. Confirm all editable controls accept input.
10. Save locally.
11. Force-close and reopen again.
12. Confirm local data remains.
13. Restore internet.
14. Sync and confirm exactly one server record for each local UUID.

