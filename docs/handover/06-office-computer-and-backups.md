# 6. The Office Computer and Backups

For the owner and the person who looks after the office computer (the **custodian**). No technical
knowledge is needed for this chapter. The technical steps are in the **Office PC Technical Guide**.

## 6.1 The office computer *is* the system

All company records live on one computer in your office. Phones and other computers reach it through the
internet. If it is off, technicians can keep working on prepared phones, but nobody can send work, and the
office cannot use the system.

## 6.2 Always

- Keep it **switched on, awake and connected to the internet**, including at 09:00 every day (reminder e-mails
  go out then). Sleep and hibernate have been turned off; do not turn them back on.
- Keep **Docker Desktop** running. It is the program that runs the system; its whale icon sits near the clock.
  It starts by itself when Windows is signed in.
- Plug the computer into a **UPS** (battery backup) if power cuts happen in your area.
- Keep at least **20% of the disk free**. Photos add up every day.

## 6.3 After a power cut or a Windows update restart

1. Make sure Windows is **signed in** (unless automatic sign-in was set up on the handover day; see chapter 10).
2. Wait about **3 minutes** for Docker Desktop and the system to start.
3. Open **https://app.mfets.com**. If it shows the sign-in cards, all is well.
4. If not after 10 minutes, call support (chapter 9).

## 6.4 Never

- Never shut the computer down at night, or unplug it "to save power".
- Never quit, uninstall, update or "reset" Docker Desktop. A reset deletes the system's data.
- Never delete, move or rename anything in the folder `C:\InspectionSystem`.
- Never run commands or programs someone sent you unless you have confirmed with your support person.
- Never use this computer for personal browsing, downloads, e-mail or games.
- Never let Windows install a large upgrade (a new Windows version) without telling support first.

## 6.5 Backups: what happens automatically

Every day the computer makes a **complete backup**: all records, all photos, and the company letterhead and
logo. It checks that the backup is readable, makes a copy on a **second place away from the computer** (an
external drive or a cloud folder, chosen on the handover day), and removes backups older than 14 days from the
computer itself.

A backup kept only on the same computer does not help if that computer is stolen, broken or infected. The
second copy is what protects the company.

## 6.6 Backups: your weekly 5-minute check (every Monday)

1. Open the folder `C:\InspectionSystem\runtime\backups` and double-click **backup-log.txt**.
2. Scroll to the bottom. For each day last week that the computer was on, there should be a line ending in
   **Backup finished OK**.
3. If you see **BACKUP FAILED**, read the rest of that line:
   - "Off-PC folder … is not reachable": the backup drive is unplugged or the cloud folder is not syncing. Fix
     that, then tell support so they can run a backup by hand.
   - Anything else: call support and read them the line.
4. If you use two backup drives: swap them, and take the other one home or to a safe place.

## 6.7 Every few months

- Support does a **restore test**: proving that a backup can actually be read back. Write the date in the log in
  chapter 10.
- Check the second backup place still has room, and remove old backups there (keep the last two weeks, plus
  one per month for a year).

## 6.8 If the computer breaks or is stolen

Do not panic and do not buy a new computer before talking to support.

1. Tell technicians to **keep their phones as they are**: do not clear data, do not uninstall. Their unsent
   work waits safely on the phones.
2. Call support. With the latest backup from the second place, the system can be rebuilt on another computer
   (about half a day).
3. Work that was sent to the office **after** the last backup has to be entered again. Work still waiting on
   phones is sent by itself once the system is back.

## 6.9 Updates

Support installs new versions. Before an update, ask technicians to send all their work (top of the screen:
**All submitted changes synced**). Phones then show **Update now** by themselves.
