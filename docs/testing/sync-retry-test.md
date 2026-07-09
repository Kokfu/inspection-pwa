# Sync Retry Test

1. Create a local record while offline.
2. Confirm it is saved in IndexedDB with a stable UUID.
3. Confirm a matching outbox item exists.
4. Restore internet.
5. Trigger sync.
6. Interrupt network during upload.
7. Retry the same outbox item.
8. Confirm PostgreSQL contains exactly one row for the stable UUID.
9. Test partial success with one accepted and one rejected record.
10. Confirm only exact accepted or duplicate IDs are marked synced.

