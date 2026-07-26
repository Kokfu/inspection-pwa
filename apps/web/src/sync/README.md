# Sync Notes

Phase 2 will add the minimal offline record vertical slice and idempotent sync engine.

The client must save records to IndexedDB before any API request and mark records synced only after the API confirms the exact stable UUID.

Automatic Sprinkler reuses `masterSystemInspection/create` and the
`masterSystemInspections` Dexie store. Opening or saving a Draft creates no
outbox item; Submit Local writes the Pending record and its single active
outbox operation in one IndexedDB transaction.
