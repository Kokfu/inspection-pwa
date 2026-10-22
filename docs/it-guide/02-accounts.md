# 2. Accounts (Manager accounts and recovery)

## 2.1 Role names on screen and in the database

| Sign-in card | Database role (`users.role`) | Created / reset by |
|---|---|---|
| **Manager** | `admin` | Office PC commands below (only way) |
| **Admin** | `supervisor` | A Manager, in the app (Technician List) |
| **Technician** | `inspector` | A Manager, in the app (Technician List) |

The commands `createAdmin.js` and `resetAdminPassword.js` create and reset **Manager** accounts, despite their
names. Usernames are case-sensitive and unique across all roles; passwords are 12–1024 characters. Every run is
recorded in the audit log (`audit_events`) without the password.

Run these in PowerShell in `C:\InspectionSystem\app`, with the stack running. **Do not add `-T`**: the hidden
password prompt needs a terminal. Nothing is shown while typing a password; that is normal.

## 2.2 Create a Manager

```powershell
docker compose exec api node dist/cli/createAdmin.js new-manager-username
# optional display name:
docker compose exec -e ADMIN_DISPLAY_NAME="Full Name" api node dist/cli/createAdmin.js new-manager-username
```

Type the password twice. Expected: `Admin user 'new-manager-username' has been created.` It refuses a username
that already exists (any role) and never changes an existing account. On a new installation this is the first
step: the system ships with no accounts. Let the new Manager type their own password if possible.

## 2.3 Reset a Manager password (also re-activates the account)

```powershell
docker compose exec api node dist/cli/resetAdminPassword.js manager-username
```

Type the new password twice. Expected: `Password for admin 'manager-username' has been reset; the account is
active and N session(s) were signed out.` It refuses Technician/Admin usernames (reset those in the app).

## 2.4 Find Manager usernames

`<db user>` and `<db name>` are `POSTGRES_USER` and `POSTGRES_DB` in `.env` (normally `inspection_app` and
`inspection`):

```powershell
docker compose exec postgres psql -U <db user> -d <db name> -c "SELECT username, is_active FROM users WHERE role='admin';"
```

## 2.5 Retire a Manager who leaves

There is no button or command for this. Take a backup first, and make sure another active Manager can sign in.

1. Reset the leaving Manager's password to a long random value (2.3) and do not record it. This signs them out
   everywhere.
2. Mark the account inactive:
   ```powershell
   docker compose exec postgres psql -U <db user> -d <db name> -c "UPDATE users SET is_active=false, updated_at=now() WHERE username='leaving-manager' AND role='admin';"
   docker compose exec postgres psql -U <db user> -d <db name> -c "UPDATE user_sessions SET revoked_at=now() WHERE revoked_at IS NULL AND user_id=(SELECT id FROM users WHERE username='leaving-manager');"
   ```
3. Never `DELETE` the row: approvals, corrections and reports refer to it.

This SQL route is a manual procedure written from the login code; it is not covered by an automated test. To
undo it, run the reset command (2.3), which re-activates the account.

## 2.6 Technician and Admin accounts

Managed by a Manager in the app (Technician List): add, rename, set new password, deactivate, reactivate,
permanently remove (Technicians only), assign Admins. See the Client Handover Pack, chapter 2.
