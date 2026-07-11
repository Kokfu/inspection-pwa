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

## Phase 2 Browser Variant

Before real phone testing, verify the generic test-record slice in a production build:

1. Open `https://localhost`.
2. Create a Draft.
3. Refresh and confirm the Draft remains.
4. Submit a local record.
5. Confirm it becomes Pending.
6. Stop the API container or disconnect the network.
7. Confirm inputs still accept typing and local save still works.
8. Restart the API container.
9. Press Sync.
10. Confirm the record becomes Synced only after exact UUID confirmation.
