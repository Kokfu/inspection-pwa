import type { Pool, PoolClient } from "pg";
import { hashPassword } from "../auth/passwords.js";

/**
 * Shared core of the offline admin recovery commands (`create-admin`, `reset-admin-password`).
 * Operator-only: these run inside the API container and are never reachable over HTTP.
 * The password and its hash are never logged, echoed, returned or written to the audit trail.
 */

export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const ADMIN_PASSWORD_MAX_LENGTH = 1024;
const USERNAME_MAX_LENGTH = 100;
const DISPLAY_NAME_MAX_LENGTH = 160;
const AUDIT_REASON = "offline operator CLI";

export type AdminCliDatabase = Pick<Pool, "connect">;
export type AdminCliKind = "create" | "reset";

export class AdminCliError extends Error {
  constructor(message: string) { super(message); }
}

export type AdminCliOutcome =
  | { ok: true; userId: number; sessionsRevoked: number }
  | { ok: false; message: string };

export function validateAdminUsername(value: unknown): string {
  const username = typeof value === "string" ? value.trim() : "";
  // eslint-disable-next-line no-control-regex
  if (!username || username.length > USERNAME_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(username)) {
    throw new AdminCliError(`Username is required (1–${USERNAME_MAX_LENGTH} characters, no control characters). Pass it as the first argument or set ADMIN_USERNAME.`);
  }
  return username;
}

export function validateAdminPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < ADMIN_PASSWORD_MIN_LENGTH || value.length > ADMIN_PASSWORD_MAX_LENGTH) {
    throw new AdminCliError(`Password must contain ${ADMIN_PASSWORD_MIN_LENGTH}–${ADMIN_PASSWORD_MAX_LENGTH} characters.`);
  }
  return value;
}

function validateDisplayName(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!value.trim() || value.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new AdminCliError(`ADMIN_DISPLAY_NAME must contain 1–${DISPLAY_NAME_MAX_LENGTH} characters when provided.`);
  }
  return value.trim();
}

/** Reads one line from a TTY without echoing it. Rejects on Ctrl+C. */
export function promptHidden(question: string, input: NodeJS.ReadStream = process.stdin, output: NodeJS.WriteStream = process.stderr): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    output.write(question);
    input.setRawMode?.(true);
    input.resume();
    input.setEncoding("utf8");
    const finish = (action: () => void) => {
      input.removeListener("data", onData);
      input.setRawMode?.(false);
      input.pause();
      output.write("\n");
      action();
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") return finish(() => resolve(value));
        if (char === "\u0003") return finish(() => reject(new AdminCliError("Cancelled.")));
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    input.on("data", onData);
  });
}

export type AdminCliEnvironment = {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  isTty: boolean;
  /** Hidden-input prompt; only used when `isTty` is true. */
  prompt?: (question: string) => Promise<string>;
};

/** Username: first CLI argument, else ADMIN_USERNAME. Password: hidden prompt (twice) on a TTY, else ADMIN_PASSWORD. */
export async function resolveAdminCredentials(environment: AdminCliEnvironment): Promise<{ username: string; password: string }> {
  const username = validateAdminUsername(environment.argv[0] ?? environment.env.ADMIN_USERNAME);
  if (!environment.isTty) {
    if (environment.env.ADMIN_PASSWORD === undefined) {
      throw new AdminCliError("ADMIN_PASSWORD is required when input is not a terminal.");
    }
    return { username, password: validateAdminPassword(environment.env.ADMIN_PASSWORD) };
  }
  const prompt = environment.prompt ?? promptHidden;
  const password = validateAdminPassword(await prompt("New password: "));
  if (await prompt("Confirm new password: ") !== password) throw new AdminCliError("Passwords do not match.");
  return { username, password };
}

async function audit(client: PoolClient, action: string, entityId: string, result: "success" | "failure", reason: string) {
  await client.query(
    `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result, reason) VALUES (NULL, $1, 'user', $2, $3, $4)`,
    [action, entityId.slice(0, USERNAME_MAX_LENGTH), result, reason]
  );
}

/** Runs `work` in one transaction: the change, the session revocation and the audit row commit or roll back together. */
async function inTransaction(database: AdminCliDatabase, work: (client: PoolClient) => Promise<AdminCliOutcome>): Promise<AdminCliOutcome> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const outcome = await work(client);
    await client.query("COMMIT");
    return outcome;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

/** Creates a NEW admin. An existing username (of any role) is refused and left untouched. */
export async function createAdminAccount(
  database: AdminCliDatabase,
  input: { username: string; password: string; displayName?: string }
): Promise<AdminCliOutcome> {
  const username = validateAdminUsername(input.username);
  const password = validateAdminPassword(input.password);
  const displayName = validateDisplayName(input.displayName);
  const passwordHash = await hashPassword(password);
  const action = "admin_create_cli";
  return inTransaction(database, async (client) => {
    const existing = (await client.query<{ id: string }>("SELECT id FROM users WHERE username=$1 FOR UPDATE", [username])).rows[0];
    const created = existing ? undefined : (await client.query<{ id: string }>(
      `INSERT INTO users (username, password_hash, role, is_active, updated_at, display_name)
       VALUES ($1, $2, 'admin', true, now(), $3) ON CONFLICT (username) DO NOTHING RETURNING id`,
      [username, passwordHash, displayName]
    )).rows[0];
    if (!created) {
      await audit(client, action, existing?.id ?? username, "failure", `${AUDIT_REASON}: username already exists`);
      return { ok: false, message: `User '${username}' already exists. To change an admin password use reset-admin-password.` };
    }
    await audit(client, action, created.id, "success", AUDIT_REASON);
    return { ok: true, userId: Number(created.id), sessionsRevoked: 0 };
  });
}

/** Sets a new password on an EXISTING admin, reactivates it and revokes all of its sessions. Other roles are refused. */
export async function resetAdminAccountPassword(
  database: AdminCliDatabase,
  input: { username: string; password: string }
): Promise<AdminCliOutcome> {
  const username = validateAdminUsername(input.username);
  const password = validateAdminPassword(input.password);
  const passwordHash = await hashPassword(password);
  const action = "admin_password_reset_cli";
  return inTransaction(database, async (client) => {
    const target = (await client.query<{ id: string; role: string }>("SELECT id, role FROM users WHERE username=$1 FOR UPDATE", [username])).rows[0];
    if (!target) {
      await audit(client, action, username, "failure", `${AUDIT_REASON}: user not found`);
      return { ok: false, message: `No user '${username}' exists. Nothing was changed.` };
    }
    if (target.role !== "admin") {
      await audit(client, action, target.id, "failure", `${AUDIT_REASON}: user is not an admin`);
      return { ok: false, message: `User '${username}' is not an admin. Nothing was changed. Staff passwords are reset from the web app's Technician List.` };
    }
    await client.query("UPDATE users SET password_hash=$2, is_active=true, updated_at=now() WHERE id=$1", [target.id, passwordHash]);
    const revoked = await client.query("UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [target.id]);
    await audit(client, action, target.id, "success", AUDIT_REASON);
    return { ok: true, userId: Number(target.id), sessionsRevoked: revoked.rowCount ?? 0 };
  });
}

/** Whole command: resolve inputs, run, print a result. Returns the process exit code. Never prints the password. */
export async function runAdminCli(
  kind: AdminCliKind,
  database: AdminCliDatabase,
  environment: AdminCliEnvironment = { argv: process.argv.slice(2), env: process.env, isTty: Boolean(process.stdin.isTTY) },
  log: { out: (line: string) => void; err: (line: string) => void } = { out: (line) => console.log(line), err: (line) => console.error(line) }
): Promise<number> {
  try {
    const { username, password } = await resolveAdminCredentials(environment);
    const outcome = kind === "create"
      ? await createAdminAccount(database, { username, password, displayName: environment.env.ADMIN_DISPLAY_NAME })
      : await resetAdminAccountPassword(database, { username, password });
    if (!outcome.ok) { log.err(outcome.message); return 1; }
    log.out(kind === "create"
      ? `Admin user '${username}' has been created.`
      : `Password for admin '${username}' has been reset; the account is active and ${outcome.sessionsRevoked} session(s) were signed out.`);
    return 0;
  } catch (error) {
    if (error instanceof AdminCliError) { log.err(error.message); return 1; }
    // Unexpected failures print only the database error code: never a message that could echo input.
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? ` (code ${error.code})` : "";
    log.err(`The command failed${code}. No changes were saved.`);
    return 1;
  }
}
