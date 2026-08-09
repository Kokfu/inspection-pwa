# Stale Cache Upgrade Test

Purpose: prove that PWA updates do not leave cached HTML pointing to deleted hashed JavaScript or CSS files.

1. Install version A of the PWA on a phone.
2. Confirm it opens and works offline.
3. Record version A's release ID and one `/assets/*.js` URL from its HTML or
   service-worker manifest.
4. Deploy version B. Confirm `release-order` contains exactly A and B when the
   configured window is two.
5. Request B's current JavaScript asset and A's recorded JavaScript asset;
   confirm both return `200`, a JavaScript content type, and an immutable cache
   header.
6. Request a random nonexistent `/assets/index-<hash>.js`; confirm it returns
   `404` and its body is not `index.html`.
7. Reopen the app online and allow the service worker to update without console
   errors. Reload once and confirm the application starts normally.
8. Force-close and reopen offline.
9. Confirm the app starts, JavaScript executes, inputs accept typing, and local saves work.
10. Recreate the proxy container and repeat the A/B/missing asset requests to
    prove the Windows bind mount survived replacement.
11. Publish a third distinct test build and confirm cleanup retains only the
    configured release count. Roll back or redeploy the intended production
    build after this cleanup test.
12. Check server/static logs for unexpected missing old chunk requests.
