# PWA Release Testing Skill

## Purpose

A visible offline page is not proof that the PWA works offline.

The release is accepted only when the installed PWA can open, run JavaScript, accept input, save local records, and recover after reconnecting.

## Pre-Deployment Checks

1. Build the frontend using the production command.
2. Confirm the generated frontend build contains:

   * `index.html`
   * Service Worker
   * web manifest
   * generated JavaScript chunks
   * generated CSS files
   * icons
3. Confirm the application is deployed with HTTPS.
4. Confirm the Service Worker scope covers the full application path.
5. Confirm the deployment publishes all new hashed assets before HTML references them.
6. Do not delete previous hashed JavaScript assets immediately after deployment.
7. Display a visible build version in the app.

## Required Phone Test

### Online bootstrap

1. Open the deployed URL on a physical phone.
2. Confirm HTTPS is valid.
3. Confirm the app displays an Offline Ready indicator.
4. Refresh or close and reopen once after service worker installation.
5. Add the application to the home screen.

### Offline functionality

1. Disable Wi-Fi and mobile data.
2. Force-close the PWA.
3. Launch it from the home screen.
4. Confirm the page opens.
5. Confirm every input can accept typing.
6. Confirm dropdowns and date controls work.
7. Confirm local validation works.
8. Save a draft.
9. Submit a record locally.
10. Confirm the record is marked Pending Sync.
11. Force-close and reopen.
12. Confirm the draft and pending record remain.

### Reconnect test

1. Restore internet.
2. Open the PWA or press Sync.
3. Confirm the record uploads.
4. Confirm the record becomes Synced.
5. Confirm exactly one matching record exists on the server.

## Debugging Rule

If the page is visible offline but inputs do not work, investigate:

* whether the service worker controls the page;
* whether cached HTML references existing cached JavaScript chunks;
* browser console errors while offline;
* React mount errors;
* startup API calls that fail offline;
* stale local database schema errors;
* disabled inputs based on online state;
* overlays or CSS pointer-event blocking.

Do not declare the release successful until typing and IndexedDB saving work offline on a real phone.
