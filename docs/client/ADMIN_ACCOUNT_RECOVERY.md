# Account Recovery Guide

For the person who looks after the Inspection system (the administrator or the IT contact).
It explains how to get someone back in when a password is forgotten, and how to add another administrator.

**Written from the code and automated tests (9 October 2026). The steps have not yet been tried on the client's own PC.** **[CONFIRM: authorized IT/recovery contact]** — name the person who is allowed to do Section 2 and 3.

---

## Which case are you in?

| Who forgot the password? | What to do | Where |
|---|---|---|
| A **technician** or **supervisor** | Section 1 — set a new password in the app | Any browser, signed in as an administrator |
| An **administrator**, and you remember the username | Section 2 — reset command | The office PC (PowerShell) |
| An **administrator**, and nobody remembers the username | Section 4, then Section 2 | The office PC (PowerShell) |
| You want an **additional administrator** | Section 3 — create command | The office PC (PowerShell) |

Administrator passwords can only be changed on the office PC, never from the app. This is on purpose: if the app could change administrator passwords, anyone who got into one admin account could take over the rest.

---

## 1. Technician or supervisor forgot their password (in the app)

You need to be signed in as an administrator, and the app must be online.

1. Open **Technician List**.
2. Find the person (use **Filter by username** if the list is long).
3. Choose **Set new password** beside their name.
4. Type the new password twice. It must be **at least 12 characters**. **Set password** stays greyed out until both entries match.
5. Choose **Set password**. The app confirms: "New password set for … They were signed out of existing sessions."
6. Tell the person their new password in person or by phone. Do not send it in a group chat.

What to know:

- The person is signed out on every phone and browser, and must sign in again with the new password. Work they already submitted is safe; unsynced work stays on their phone and syncs after they sign back in as the same user.
- It does **not** reactivate someone who was deactivated. If they should be able to log in again, that is a separate step.
- If you are offline, the app cannot save the change. Reconnect and try again.

---

## 2. Administrator forgot their password (office PC)

Do this on the PC that runs the system. The system must be running (Docker Desktop open).

1. Open **PowerShell** (or Windows Terminal) and go to the project folder.
2. Check the system is running. You should see `api` and `postgres` listed as running:

   ```powershell
   docker compose ps
   ```

3. Run the reset command, replacing `admin-username` with the administrator's username:

   ```powershell
   docker compose exec api node dist/cli/resetAdminPassword.js admin-username
   ```

   Do **not** add `-T` to this command. The password prompt needs it left out.

4. When asked, type the new password, then type it again to confirm. **Nothing appears on screen while you type. That is normal.** Use at least 12 characters (up to 1024).
5. A message confirms the password was reset, the account is active, and how many sessions were signed out.
6. Open the app and sign in as that administrator with the new password.

What this command does:

- Changes the password and makes sure the account is **active** (so it also recovers an administrator who was locked out).
- Signs that administrator out everywhere.
- Records the action in the audit log (no password is recorded).
- Refuses, and changes nothing, if the username belongs to a technician or supervisor, or does not exist. Use Section 1 for technicians and supervisors.

---

## 3. Add another administrator (office PC)

Same setup as Section 2 (PowerShell in the project folder, system running). Replace `new-admin-username` with the new person's username:

```powershell
docker compose exec api node dist/cli/createAdmin.js new-admin-username
```

Type the password twice when asked (at least 12 characters, nothing shows while typing).

- It only creates **new** accounts. If the username already exists (as any role), it stops with a message and changes nothing. To change an existing administrator's password use Section 2.
- It is recorded in the audit log.

Tip: keep at least two administrators, so one forgotten password never locks everyone out.

---

## 4. Nobody remembers the administrator username

List the administrator accounts. Use the database user name and database name from the PC's private `.env` file (`POSTGRES_USER` and `POSTGRES_DB`). Replace `<db user>` and `<db name>` with those values:

```powershell
docker compose exec postgres psql -U <db user> -d <db name> -c "SELECT username, is_active FROM users WHERE role='admin';"
```

The result lists each administrator's username and whether the account is active. Then use Section 2 with the username you want to recover. Do not copy the `.env` file or its values into emails or chats.

---

## Password rules and good practice

- 12 to 1024 characters. A short sentence of several words is easy to remember and hard to guess.
- Give each person their own account and password. Do not share one login.
- Never type administrator passwords into chat, email, a screenshot, or a shared notes file.
- After a reset, have the person sign in once straight away to confirm it works.

---

## If something goes wrong

| What you see | What it means / what to do |
|---|---|
| `service "api" is not running` or the command cannot connect | The system is not running. Start Docker Desktop, wait until it says it is running, then try `docker compose ps` again. |
| "User '…' is not an admin. Nothing was changed." | That username is a technician or supervisor. Use Section 1. |
| "No user '…' exists." | Wrong username. Check the spelling, or list administrators (Section 4). |
| "User '…' already exists." | You used the create command for an existing account. Use Section 2 instead. |
| "Passwords do not match." | The two entries differed. Run the command again. |
| "Password must contain 12–1024 characters." | Choose a longer password. |
| "The command failed (code …). No changes were saved." | Nothing was changed, so it is safe to retry. If it repeats, send the code in brackets (not any password) to your support contact. **[CONFIRM: support contact]** |
