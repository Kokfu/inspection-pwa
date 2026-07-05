# Inspection PWA — Agent Instructions

## Project Purpose

Build an offline-first field-inspection PWA hosted on the client’s Windows desktop PC through Docker Compose.

The client will own the production domain. External users will access the system over HTTPS through the client’s public IP, router port forwarding, and reverse proxy.

## Non-Negotiable Architecture

* Client Windows PC runs Docker Compose.
* Central server data stays on the client PC.
* PostgreSQL is the central production database.
* Uploaded files and photos must persist outside container lifecycle.
* Phone and browser local data is stored in IndexedDB.
* Service Worker Cache Storage is for app-shell files only.
* IndexedDB is for business records, drafts, sync queue items, offline reference data, and future attachment Blobs.

## Offline Contract

* Offline must limit synchronisation, not data entry.
* Never disable form inputs, local save actions, camera capture, or draft saving when offline.
* Every user record must be stored in IndexedDB before an API call.
* Every local record must have a stable UUID from `crypto.randomUUID()`.
* Unsynced records must survive page refresh, browser restart, PWA force-close, network loss, and API failure.
* Mark a record Synced only after the API confirms that exact UUID.
* API writes must be idempotent and safe to retry.

## Development Rules

* Read the relevant `.agents/skills/*/SKILL.md` before changing code in that area.
* Inspect existing code before changing it.
* Do not make broad unrelated refactors.
* Do not commit credentials, tokens, certificates, database passwords, production domains, public IPs, private keys, or `.env` files.
* Use `.env.example` for placeholders only.
* Use production builds for real PWA/offline testing; do not treat development-server behaviour as proof of offline support.
* All backend routes require authentication before production release.
* Destructive operations require explicit confirmation and audit logging.

## Required Verification

Before declaring a relevant task complete:

1. Run lint, type checks, and tests relevant to changed files.
2. Verify Docker Compose starts successfully.
3. Verify persistent data survives container restart.
4. Verify offline typing and local save on a real phone or browser test.
5. Verify reconnect and idempotent sync.
6. Document changed files, data-model changes, API changes, tests run, known limitations, and rollback steps.

## Core Rules
* Offline must limit synchronisation, not data entry.
* Never disable form inputs, local save actions, camera capture, or draft saving because internet is unavailable.
* Save business data into IndexedDB before attempting API synchronisation.
* Use stable client-generated UUIDs for locally created records.
* Mark records Synced only after the server confirms the exact UUID.
* API write operations must be idempotent.
* PostgreSQL will be the central production database.
* Docker containers must not contain the only copy of database files, uploads, logs, or backups.
* Never commit .env, passwords, API keys, tokens, certificates, private keys, public IPs, or client-specific production settings.