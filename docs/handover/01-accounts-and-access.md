# 1. Accounts and Access

## 1.1 The three account types

| Sign-in card | Database role | Created by | Password reset by |
|---|---|---|---|
| **Manager** | `admin` | The office-PC command `createAdmin.js` (only way) | The office-PC command `resetAdminPassword.js` (only way) |
| **Admin** (review only) | `supervisor` | A Manager, in the app: **Technician List → Add Admin** | A Manager, in the app: **Set new password** |
| **Technician** | `inspector` | A Manager, in the app: **Technician List → Add Technician** | A Manager, in the app: **Set new password** |

Key facts, all enforced in code:

- **There is no self-registration and no "forgot password" link.** Someone with more power
  always has to create or reset an account.
- **A Manager account can never be created, reset or deleted from the web app.** This is
  deliberate: if the web app could change Manager passwords, anyone who got into one Manager
  login could take over every other one. Manager accounts are managed only on the office PC.
- Choosing the wrong sign-in card does not grant extra access. A Technician who picks
  **Manager** is told "This signed-in account does not have Manager access."
- Passwords must be **12 to 1024 characters**. Usernames are 1 to 100 characters. Usernames
  are case-sensitive and must be unique across all three roles.
- Every create, reset and deactivate action is written to the audit log (`audit_events`
  table) without the password.
- Sessions last `SESSION_DURATION_HOURS` (default **12**, set in `.env`). After a password reset
  the person is signed out on every device.

---

## 1.2 Create a new Manager account

This is done on the **office PC** that runs Docker, by the person responsible for IT.
It cannot be done from a phone or from the web app.

**Files involved**

| File | Role |
|---|---|
| `apps/api/src/cli/createAdmin.ts` | Entry point. Runs migrations, then calls the shared logic. Compiled to `dist/cli/createAdmin.js` inside the `api` container. |
| `apps/api/src/cli/adminCli.ts` | The shared logic: validates username and password, hashes the password, inserts the user as role `admin`, writes the audit row. |
| `.env` (project root) | Holds `POSTGRES_USER` / `POSTGRES_DB`. Not needed to create a Manager, only to list them (section 1.5). |

**Steps**

1. Start Docker Desktop and wait until it says the engine is running.
2. Open **PowerShell** and go to the project folder (the folder that contains `docker-compose.yml`).
3. Check the system is up. `api` and `postgres` must be listed as running:

   ```powershell
   docker compose ps
   ```

4. Run the create command. Replace `new-manager-name` with the new username:

   ```powershell
   docker compose exec api node dist/cli/createAdmin.js new-manager-name
   ```

   **Do not add `-T`.** The hidden password prompt needs a terminal.

5. When asked **New password:** type the password, then **Confirm new password:** type it again.
   Nothing appears on screen while you type. That is normal.
6. You should see: `Admin user 'new-manager-name' has been created.`
   (The word "Admin" here is the code's name for a Manager.)
7. Open the app, choose the **Manager** card, and sign in with the new username and password.

**Optional: set the displayed name at creation**

```powershell
docker compose exec -e ADMIN_DISPLAY_NAME="Ahmad bin Ali" api node dist/cli/createAdmin.js new-manager-name
```

**What it will and will not do**

- It only creates **new** accounts. If the username already exists as any role, it stops, changes
  nothing and tells you to use the reset command instead.
- It runs database migrations first, so it is safe on a brand-new installation. On a fresh
  install this is the **first thing you must do**: the system ships with no accounts.
- Without a terminal (scripts), it reads `ADMIN_USERNAME` and `ADMIN_PASSWORD` from the
  environment instead of prompting. Never store those in `.env` or leave them in a shared
  transcript.

**Good practice:** keep at least **two** Manager accounts, owned by two different people, so one
forgotten password never locks everyone out.

---

## 1.3 Forgot a Manager password (reset)

Also done on the office PC. You need to know the Manager's username (if not, see 1.5).

**Files involved**

| File | Role |
|---|---|
| `apps/api/src/cli/resetAdminPassword.ts` | Entry point (`dist/cli/resetAdminPassword.js`). Deliberately does **not** run migrations. |
| `apps/api/src/cli/adminCli.ts` | Shared logic: sets the new hash, forces `is_active = true`, revokes all sessions, writes the audit row. |

**Steps**

1. Same preparation as 1.2 (Docker running, PowerShell in the project folder, `docker compose ps`).
2. Run, replacing `manager-username`:

   ```powershell
   docker compose exec api node dist/cli/resetAdminPassword.js manager-username
   ```

3. Type the new password twice (nothing shows while typing).
4. Expected result: `Password for admin 'manager-username' has been reset; the account is active and N session(s) were signed out.`
5. Sign in on the **Manager** card with the new password.

This command also **re-activates** a Manager account that was deactivated. It refuses, and changes
nothing, if the username is a Technician or Admin, or does not exist.

---

## 1.4 Change a Manager password (you know the old one)

The app has **no "change my password" screen** for anyone. To change a Manager password on purpose,
use the same command as 1.3. You do not need the old password; the command is a reset. The person
is signed out everywhere and signs in again with the new password.

---

## 1.5 Nobody remembers the Manager username

List all Manager accounts straight from the database. `<db user>` and `<db name>` are the
`POSTGRES_USER` and `POSTGRES_DB` values in the PC's private `.env` file:

```powershell
docker compose exec postgres psql -U <db user> -d <db name> -c "SELECT username, is_active FROM users WHERE role='admin';"
```

Then reset one with 1.3. If the list is empty, create a new one with 1.2.

Do not copy the `.env` file, or the values in it, into email or chat.

---

## 1.6 Retire (deactivate) a Manager account

The app has **no button** to delete or deactivate a Manager, and no command either. If a Manager
leaves the company, do this (IT only, take a database backup first, see file 04):

1. Make sure at least one **other** active Manager exists and its password works.
2. Reset the leaving Manager's password to a long random value (1.3) so the old password is dead,
   and do not record the new one. This also signs them out everywhere.
3. Mark the account inactive. Login checks `is_active`, so an inactive account cannot sign in:

   ```powershell
   docker compose exec postgres psql -U <db user> -d <db name> -c "UPDATE users SET is_active=false, updated_at=now() WHERE username='leaving-manager' AND role='admin';"
   docker compose exec postgres psql -U <db user> -d <db name> -c "UPDATE user_sessions SET revoked_at=now() WHERE revoked_at IS NULL AND user_id=(SELECT id FROM users WHERE username='leaving-manager');"
   ```

4. Do **not** `DELETE` the row. Audit entries, approvals, corrections and reports refer to the
   user by ID; deleting would be refused by the database or would orphan history.

This SQL route is a manual procedure, not a tested product feature. It was written from the
login code and table definitions and has not been run on the client PC. **[FILL IN: who is
authorised to run it]**

---

## 1.7 Create, edit and remove Technician and Admin accounts (in the app, as Manager)

You must be signed in with the **Manager** card and be online. Open **Technician List** in the menu.

### Create

1. Under **Add Technician**, fill in **Username**, **Person's name** and **Password** (12+ characters).
2. Choose **Role**: **Technician** or **Admin (review only)**.
3. Press **Add Technician** (or **Add Admin**, the button follows the role). The person appears in the
   list as **Active**.
4. Tell them the username and password in person or by phone, not in a group chat.

### Assign Admins to Technicians

An **Admin** only sees the visits of technicians assigned to them. Under each technician, tick the
**Assigned Admins for …** checkboxes. If an Admin says "I cannot see a visit", this is almost always
the cause.

### Rename

Edit **Person's name** next to the account and press **Save name**.

### Set a new password (forgotten password)

1. **Technician List** → find the person (**Filter by username**) → **Set new password**.
2. Type it twice (12+ characters) → **Set password**.
3. They are signed out of every phone and browser. Work they already submitted is safe. Unsynced work
   stays on their phone and uploads after they sign back in as the **same user**.
4. This does not re-activate a deactivated account.

### Deactivate (stop access, keep history)

Press **Deactivate** and confirm. The person can no longer sign in and all their sessions end. Their
past work stays in the records. The account moves out of the active list.

### Permanently remove (delete)

1. Tick **Show deactivated technicians (N)**.
2. Press **Permanently remove** next to the inactive person.
3. Type the exact username to confirm.

Result: an account that never did any work is deleted for good. An account that has history is
**hidden** instead and stays in the records. Only **Technician** accounts can be permanently removed;
**Admin** accounts can be deactivated but not removed. An account must be deactivated first.

### Quick reference

| Task | Where | Who can do it |
|---|---|---|
| Create Manager | Office PC, `createAdmin.js` | IT with PC access |
| Reset / change Manager password | Office PC, `resetAdminPassword.js` | IT with PC access |
| Retire a Manager | Office PC, SQL (1.6) | IT with PC access |
| Create Technician / Admin | App → Technician List | Manager |
| Reset Technician / Admin password | App → Technician List → Set new password | Manager |
| Deactivate Technician / Admin | App → Technician List → Deactivate | Manager |
| Delete Technician | App → Technician List → Permanently remove | Manager |
| Assign Admin to Technician | App → Technician List → Assigned Admins | Manager |

---

## 1.8 Source files for developers

| Concern | File |
|---|---|
| Manager CLI (create, reset) | `apps/api/src/cli/adminCli.ts`, `createAdmin.ts`, `resetAdminPassword.ts` |
| Tests for the CLI | `apps/api/src/cli/adminCli.integration.test.ts` |
| Staff API (create, rename, password, deactivate, delete, assign) | `apps/api/src/routes/managerTechnicians.ts` |
| Login, sessions | `apps/api/src/routes/auth.ts`, `apps/api/src/auth/` |
| Password hashing | `apps/api/src/auth/passwords.ts` |
| Role guard | `apps/api/src/middleware/requireRole.ts` |
| Staff screen | `apps/web/src/manager/ManagerTechnicians.tsx` |
| Which role sees which menu | `apps/web/src/manager/roleAccess.ts`, `ManagerHome.tsx` (`managerNavLinks`) |
| Role constraint in the database | migrations `002_auth_security_foundation.sql`, `039_supervisor_role.sql` |
