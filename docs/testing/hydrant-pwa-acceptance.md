# Hydrant PWA acceptance

Use the existing demo inspector account and open `DEMO-JOB-HYDRANT-001`.

1. Open Hydrant, select a Hydrant Type, complete both configured rows, optionally add one technician row, and enter comments.
2. Save Draft, disconnect the device, change a value, force-close the PWA/browser, and reopen it while still offline. Confirm every value and row remains.
3. Submit Local and confirm **Pending Sync**.
4. Reconnect and sync. Confirm the record becomes **Synced/Accepted**.
5. Open the accepted detail and confirm the Hydrant Type, submitted row order and values, and comments match; the accepted view must be read-only.
