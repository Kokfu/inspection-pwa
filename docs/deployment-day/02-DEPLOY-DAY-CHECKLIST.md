# 2. Deploy-day checklist (developer, during the remote session)

Tick as you go. Detailed commands and explanations: [`DEPLOY_TO_CLIENT_PC.md`](../DEPLOY_TO_CLIENT_PC.md).
If anything goes wrong: [03 Emergency runbook](03-EMERGENCY-RUNBOOK.md). Assumes route **A, Cloudflare Tunnel**.

**Stop rule:** each section ends with a ✋ checkpoint. Do not continue past a failed checkpoint. If it cannot be
fixed in 30 minutes, use the abort plan in [03 §1](03-EMERGENCY-RUNBOOK.md#1-abort-or-continue).

---

## A. Before the session (your PC, the day before)

- [ ] Git steps done ([01 §1.5](01-FINAL-REVIEW-AND-PRE-DEPLOY.md#15-git-and-release-steps-you-run-these)): committed, gates green, pushed, `main` fast-forwarded, tag pushed.
- [ ] Tag: `release-__________`  Commit: `________`
- [ ] Client release published and pushed: `.\scripts\dev\Publish-ClientRelease.ps1 -Ref release-YYYYMMDD -Push` ([01 §1.5](01-FINAL-REVIEW-AND-PRE-DEPLOY.md#15-git-and-release-steps-you-run-these)); read-only token for the release repository ready.
- [ ] Client answered the list in [01 §1.6](01-FINAL-REVIEW-AND-PRE-DEPLOY.md#16-ask-the-client-before-the-session-send-this-list).
- [ ] Remote-access tool tested once with the client.

✋ Code is pushed and tagged, `client-release` is on the release repository; you know whose Cloudflare account `mfets.com` is in.

## B. Cut over the hostname from the dev PC (before the session)

Do this right before the session (the public site is down from here until section D). Tell anyone using
`app.mfets.com` for demos that it is going down.

1. **Phones used for testing** (yours and any demo phones): open the app online, make sure the header says
   **All submitted changes synced**. Then uninstall the home-screen app and clear the site's data:
   Chrome → ⋮ → Settings → Site settings → All sites → `app.mfets.com` → **Delete data**.
2. **Dev PC:** stop and remove the tunnel connector so it can never come back:
   ```powershell
   cd C:\PWA_OfflineRecordWebApp
   docker compose --profile tunnel stop cloudflared
   docker compose --profile tunnel rm -f cloudflared
   ```
   Then edit the dev `.env`: blank out `CLOUDFLARE_TUNNEL_TOKEN=` (and from now on start the dev stack without
   `--profile tunnel`).
3. **Cloudflare** (client's account): Zero Trust → Networks → Tunnels.
   - Recommended: on the **old (dev) tunnel**, delete the public hostname `app.mfets.com`, then delete the old
     tunnel. Create a **new** tunnel named after the client (e.g. `mfe-office-pc`) and copy its token into your
     password manager. You add the hostname to it in section C step 5.
   - If the domain is in **your** Cloudflare account, not the client's, stop and agree with the client how it
     moves to their account; the client must own DNS and the tunnel.
4. Confirm the old tunnel shows **no connectors** (or is deleted).

✋ `https://app.mfets.com` no longer reaches the dev PC (it shows a Cloudflare error page). Testing phones are clean.

## C. On the client PC

1. **Windows** (≈10 min)
   - [ ] Power: Sleep **Never**, Hibernate off, "Turn off hard disk" never. Lid/power button: do nothing (laptop).
   - [ ] Windows Update → Advanced → Active hours = working hours; note when it reboots.
   - [ ] Time zone `(UTC+08:00) Kuala Lumpur`, time synced.
   - [ ] **Sign-in after reboot** (R-5): agree (a) Autologon + lock, or (b) a named person signs in. Write it in [handover 10.4](../handover/10-handover-forms.md#104-decisions-made-on-the-day).
   - [ ] BIOS "Restore on AC power loss" = On (ask the client to check if you can't reach BIOS remotely).
   - [ ] Disk: at least 50 GB free on C:.
2. **Docker Desktop** (≈30–45 min, one reboot)
   - [ ] Install, accept WSL 2, reboot, reconnect.
   - [ ] Settings → General: **Start Docker Desktop when you sign in** ON. Software updates: **automatic download OFF** (updates are done deliberately).
   - [ ] Licence: free only for organisations under 250 staff **and** under USD 10 M revenue. Confirm with the client.
   - [ ] `docker --version`, `docker compose version` work; Docker shows **Engine running**.
3. **Code** (≈5 min)
   ```powershell
   git clone --branch client-release --single-branch https://github.com/Kokfu/inspection-pwa-release.git C:\InspectionSystem\app
   cd C:\InspectionSystem\app
   Get-Content RELEASE.txt       # Release and Source commit must match what you wrote in section A
   git status                    # nothing to commit, working tree clean
   Test-Path docs\deployment-day # must be False: developer files are not on this PC
   ```
4. **Folders and `.env`** (≈5 min)
   ```powershell
   .\scripts\Prepare-ClientPC.ps1 -Hostname app.mfets.com
   ```
   Paste the **new** tunnel token when asked (hidden). Then copy `.env` into the client's password manager
   (as a secure note) or an encrypted drive. Do not open `.env` on a shared screen.
5. **Cloudflare public hostname** on the new tunnel: `app.mfets.com` → type **HTTP**, URL **`proxy:80`**.
   Hostname settings: Rocket Loader **off**, Auto Minify **off**, Email Obfuscation **off**, Web Analytics
   **off**; a Cache Rule that **bypasses cache** for `/sw.js`, `/index.html`, `/manifest.webmanifest`, `/api/*`.
6. **Build and start** (≈15–25 min first time)
   ```powershell
   docker compose --profile tunnel config --quiet      # never without --quiet on a shared screen
   docker compose --profile tunnel up -d --build
   docker compose --profile tunnel ps
   docker compose logs api --tail=50
   docker compose logs cloudflared --tail=20
   ```

✋ `ps` shows proxy, api, reminder-worker, cloudflared **running** and postgres **healthy**; the api log shows
migrations finished with no error; cloudflared shows "Registered tunnel connection" (4 lines is normal).

7. **Public check** from your own PC or phone on mobile data:
   - [ ] `https://app.mfets.com` shows the sign-in cards, padlock valid.
   - [ ] `https://app.mfets.com/api/health` returns `{"status":"ok",...}`.
8. **First Manager accounts** (the client types the passwords, or you generate them into their password manager)
   ```powershell
   docker compose exec api node dist/cli/createAdmin.js <manager1-username>
   docker compose exec -e ADMIN_DISPLAY_NAME="<Full Name 2>" api node dist/cli/createAdmin.js <manager2-username>
   ```
   Do **not** add `-T`. Both people sign in once on the **Manager** card.
9. **Starter data:** Manager → Customers is **empty**. If any customer is listed, the PC built an old commit: stop (03 §4).
10. **Company profile:** Manager → Settings → Company profile: check every field, upload the logo, tick
    **Company details confirmed as final**, save.
    - **Report numbers (P-3):** the prefix is the "Report number format" field here (service reports only;
      repair reports are always `MFE/RR/{YYYY}/NNNN`). The **starting number** is not a setting. To continue a
      paper series, run this **before the test visit in §E** (it never moves the counter backwards; the next
      report is `last number + 1`; numbering restarts at 0001 every calendar year):
      ```powershell
      docker compose exec postgres psql -U <db user> -d <db name> -c "INSERT INTO report_number_year_counters(report_year,last_sequence) VALUES (2026, <last paper number>) ON CONFLICT (report_year) DO UPDATE SET last_sequence=GREATEST(report_number_year_counters.last_sequence, EXCLUDED.last_sequence);"
      ```
      For repair reports use the table `repair_report_number_year_counters` the same way. The deploy-day test
      visit then uses one number; tell the client which one.
11. **Staff:** Manager → Technician List → add each Technician (and Admin if used); assign Admins to Technicians.
12. **E-mail reminders (optional):** Settings → Email reminders → client Gmail + app password → send one test to an approved address.

✋ Two Managers can sign in; company profile saved; technician accounts exist.

## D. Backups (before any real work is entered)

1. Plug in / map the off-PC target and run one backup by hand:
   ```powershell
   cd C:\InspectionSystem\app
   .\scripts\Backup-All.ps1 -CopyTo 'E:\InspectionBackups'      # use the client's real off-PC path
   ```
   Must end with **Backup finished OK**. Log: `C:\InspectionSystem\runtime\backups\backup-log.txt`.
2. **Restore drill** (proves the dump is usable; never touches live data):
   ```powershell
   .\scripts\Restore-Database.ps1 -BackupFile (Get-ChildItem C:\InspectionSystem\runtime\backups\postgres\*.dump | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
   docker exec inspection-restore-drill psql -U inspection_app -d inspection -c "SELECT count(*) FROM users;"
   docker rm -f inspection-restore-drill
   ```
   The user count must match what you created.
3. **Schedule it** — exact Task Scheduler steps in [IT guide 3.2](../it-guide/03-backup-and-recovery.md#32-the-daily-scheduled-task-set-up-once).
   Then right-click the task → **Run** and confirm a new "Backup finished OK" line in the log.

✋ One verified backup on the PC **and** on the off-PC target; scheduled task runs successfully.

## E. Acceptance (from a phone on mobile data, not the office Wi-Fi)

- [ ] Sign in as a Technician; picking the Manager card with a Technician account is refused.
- [ ] Install to home screen; open from the icon; header reaches **Offline ready** after **Refresh**.
- [ ] Camera: **Allow** permission, take one photo.
- [ ] Airplane mode: new service visit for a real customer, fill a form, **Save Draft**, **Submit** → "waiting to sync".
- [ ] Force-close, reopen still offline → the work is still there.
- [ ] Airplane off → **All submitted changes synced**. Manager sees exactly **one** visit; approve; download the PDF; letterhead correct.
- [ ] Restart test on the client PC:
  ```powershell
  docker compose restart postgres; docker compose restart api
  ```
  Phone and browser stay signed in; data still there.
- [ ] **Reboot the PC.** Without touching Docker: after sign-in (or Autologon) the site comes back by itself
      within ~3 minutes. Run `docker compose --profile tunnel ps` to confirm.
- [ ] Exposure: `docker compose ps` publishes only proxy 80/443; 5432 and 3000 not on the host.
- [ ] Delete the test visit if the client does not want it (Manager → Operations → Delete is only possible
      before records are accepted; otherwise leave it and tell the client which one is the test).

✋ All boxes ticked → fill the sign-off in [handover 10.3](../handover/10-handover-forms.md#103-acceptance-sign-off).
Ticked rows can also be copied into [`release/LEVEL3_CHECKLIST.md`](../release/LEVEL3_CHECKLIST.md).

## F. Handover talk (≈30 min)

Hand over the printed [Client Handover Pack](../client-pack/README.md) and walk through, in this order:
[1 Welcome](../handover/01-welcome.md) → [2 Accounts](../handover/02-accounts-and-passwords.md) (add, reset,
deactivate, reactivate staff; Managers go through support) → [6 Office computer and backups](../handover/06-office-computer-and-backups.md)
(show the backup log and the off-PC copy) → [7 Keeping data safe](../handover/07-keeping-data-safe.md) →
[8 Known limits](../handover/08-known-limits.md) → fill in [10 Handover forms](../handover/10-handover-forms.md) together.
Give each technician [chapter 3](../handover/03-technician-guide.md) with its printed quick card (3.7) and
[chapter 5](../handover/05-working-without-internet.md). Leave the **Office PC Technical Guide** with whoever supports
the PC (normally you).

## G. After the session

- [ ] Tell the team the address `https://app.mfets.com` is live.
- [ ] Next morning: check `backup-log.txt` shows the scheduled run; Manager → Settings → Email reminders shows no failures.
- [ ] After one week: check free disk space and backup sizes; ask technicians for problems.
- [ ] Your side: keep the dev stack **off** the tunnel; never point a dev `.env` at the production token.
