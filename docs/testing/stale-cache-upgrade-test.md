# Stale Cache Upgrade Test

Purpose: prove that PWA updates do not leave cached HTML pointing to deleted hashed JavaScript or CSS files.

1. Install version A of the PWA on a phone.
2. Confirm it opens and works offline.
3. Deploy version B while retaining version A hashed assets.
4. Reopen the app online and allow the service worker to update.
5. Force-close and reopen offline.
6. Confirm the app starts, JavaScript executes, inputs accept typing, and local saves work.
7. Check server/static logs for missing old chunk requests.
8. Only prune old assets after the retention window and regression test pass.

