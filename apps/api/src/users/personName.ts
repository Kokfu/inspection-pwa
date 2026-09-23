/** Resolve a person's report name once, before freezing it on job completion. */
export function personName(username: string, displayName: string | null | undefined): string {
  const name = displayName?.trim() || username.trim();
  if (!name) throw new Error("User has no printable name");
  return name;
}
