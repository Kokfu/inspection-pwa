# Docker Persistence Test

This test verifies that container replacement does not destroy data.

1. Start the stack.
2. Create a test database row through an approved API or migration test.
3. Create a test file under the uploads bind mount.
4. Recreate the API and proxy containers.
5. Confirm the upload remains.
6. Recreate the PostgreSQL container without deleting named volumes.
7. Confirm the database row remains.

Never use destructive volume deletion during this test unless explicitly approved.

