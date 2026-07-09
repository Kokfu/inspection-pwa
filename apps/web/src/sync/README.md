# Sync Notes

Phase 2 will add the minimal offline record vertical slice and idempotent sync engine.

The client must save records to IndexedDB before any API request and mark records synced only after the API confirms the exact stable UUID.

