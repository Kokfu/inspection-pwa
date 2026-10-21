import { useEffect, useRef, useState, type FormEvent } from "react";
import { deviceDatabase } from "../db/localDatabase";
import { loadManagerCustomer, ManagerApiError, type ManagerCustomer } from "./managerApi";
import "./managerCustomerRecords.css";

const fields = ["displayName", "contactPerson", "contactPhone", "fax", "contractNumber", "serviceFrequency"] as const;
type Details = Record<typeof fields[number], string | null>;
const detailsOf = (customer: ManagerCustomer): Details => Object.fromEntries(fields.map((key) => [key, customer.customer[key] ?? null])) as Details;
const normalized = (details: Details): Details => Object.fromEntries(fields.map((key) => [key, details[key]?.trim().replace(/\s+/g, " ") || null])) as Details;
const validDetails = (value: unknown): value is Details => typeof value === "object" && value !== null && fields.every((key) => typeof (value as Details)[key] === "string" || (value as Details)[key] === null);

// Detail writes cannot change visit aggregates, which are returned only by
// the list endpoint. Replace the authoritative detail while keeping those cells.
export function updateManagerCustomerList(customers: ManagerCustomer[], customer: ManagerCustomer): ManagerCustomer[] {
  return customers.map((value) => value.customer.id === customer.customer.id ? { ...value, ...customer } : value);
}

/** Customers a manager has not yet verified. A missing flag is treated as confirmed. */
export const isUnconfirmed = (customer: ManagerCustomer) => customer.customer.confirmed === false;

export function customerMatches(customer: ManagerCustomer, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return [customer.customer.displayName, customer.customer.code, customer.customer.contactPerson, customer.customer.contactPhone,
    ...customer.sites.flatMap((site) => [site.displayName, site.address])].some((value) => value?.toLocaleLowerCase().includes(needle));
}

export function ManagerCustomerTable({ customers, onManage, onArchive, archivingId }: { customers: ManagerCustomer[]; onManage: (customer: ManagerCustomer) => void; onArchive?: (customer: ManagerCustomer) => void; archivingId?: string | null }) {
  return <table className="customer-records-table"><caption className="sr-only">Customers</caption>
    <thead><tr>{["Customer", "Contact", "Sites", "Last visit", "Open", "Status"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{customers.map((row) => {
      const summary = (row as ManagerCustomer & { tableSummary?: { lastVisit: string | null; openCount: number } }).tableSummary;
      const validSummary = summary && (summary.lastVisit === null || (typeof summary.lastVisit === "string" && /^\d{4}-\d{2}-\d{2}$/.test(summary.lastVisit)))
        && Number.isSafeInteger(summary.openCount) && summary.openCount >= 0;
      return <tr key={row.customer.id} onClick={() => onManage(row)}>
        <td data-label="Customer"><button className="secondary-command" type="button" onClick={(event) => { event.stopPropagation(); onManage(row); }}>{row.customer.displayName}</button><small>{row.customer.code}</small></td>
        <td data-label="Contact"><span>{row.customer.contactPerson || "—"}<br />{row.customer.contactPhone || "—"}</span></td>
        <td data-label="Sites">{row.sites.map((site) => site.displayName).join(", ") || "No active sites"}</td>
        <td data-label="Last visit">{validSummary ? summary.lastVisit ?? "No visits" : "Unavailable"}</td>
        <td data-label="Open">{validSummary ? summary.openCount : "Unavailable"}</td>
        <td data-label="Status"><span>Active{isUnconfirmed(row) ? <span className="status-badge status-badge--waiting customer-unconfirmed-badge">Unconfirmed</span> : null}{onArchive ? <button type="button" className="secondary-command" disabled={archivingId === row.customer.id} onClick={(event) => { event.stopPropagation(); onArchive(row); }}>Archive</button> : null}</span></td>
      </tr>;
    })}</tbody>
  </table>;
}

export function ManagerCustomerDetailsEditor({ customer, onSaved, onAuthorityFailure }: {
  customer: ManagerCustomer; onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const [details, setDetails] = useState(() => detailsOf(customer));
  const [expected, setExpected] = useState(() => detailsOf(customer));
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const draftKey = useRef("");
  const actorId = useRef<number | undefined>(undefined);
  const latestDetails = useRef(details);
  const editVersion = useRef(0);
  const changeField = (key: typeof fields[number], value: string) => {
    latestDetails.current = { ...latestDetails.current, [key]: value };
    editVersion.current++;
    setDetails(latestDetails.current);
  };
  useEffect(() => {
    const current = ++generation.current;
    latestDetails.current = detailsOf(customer);
    setReady(false); setDetails(latestDetails.current); setExpected(detailsOf(customer)); setMessage("");
    void (async () => {
      const identity = await deviceDatabase.authState.get("device-auth");
      if (identity?.role !== "admin" || !identity.userId || identity.explicitLogout) throw new Error("A verified manager identity is required to save a local edit.");
      const key = `manager-customer-details:${identity.userId}:${customer.customer.id}`;
      const draft = await deviceDatabase.drafts.get(key);
      if (generation.current !== current) return;
      draftKey.current = key;
      actorId.current = identity.userId;
      if (draft) {
        const payload = draft.payload as { changes?: unknown; expected?: unknown };
        if (!payload || !validDetails(payload.changes) || !validDetails(payload.expected)) throw new Error("The saved edit cannot be read. Discard it before editing again.");
        latestDetails.current = payload.changes;
        setDetails(payload.changes); setExpected(payload.expected); setMessage("Saved on this device. Review and Save changes to retry.");
      }
      setReady(true);
    })().catch((error: unknown) => { if (generation.current === current) setMessage(error instanceof Error ? error.message : "Local edit could not be loaded."); });
    return () => { generation.current++; };
  }, [customer.customer.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (saving || !ready) return;
    const current = generation.current; const isCurrent = () => generation.current === current;
    const changes = normalized(details);
    const submittedVersion = editVersion.current;
    let savedLocally = false;
    // Recheck after each IndexedDB await: typing during cleanup must not be
    // erased by an earlier delete, or omitted from the recoverable draft.
    const settleDraft = async (baseline: Details, allowClear: boolean) => {
      while (isCurrent()) {
        const version = editVersion.current;
        if (allowClear && version === submittedVersion) await deviceDatabase.drafts.delete(draftKey.current);
        else await deviceDatabase.drafts.put({ id: draftKey.current, entityType: "managerCustomerDetails",
          payload: { changes: normalized(latestDetails.current), expected: baseline }, updatedAt: new Date().toISOString() });
        if (version === editVersion.current) return;
      }
    };
    let confirmed: Details | undefined;
    setSaving(true); setMessage("");
    try {
      const identity = await deviceDatabase.authState.get("device-auth");
      if (identity?.userId !== actorId.current || identity?.role !== "admin" || identity.explicitLogout) throw new ManagerApiError("The signed-in account changed. Reopen this customer before saving.", "authorization");
      await deviceDatabase.drafts.put({ id: draftKey.current, entityType: "managerCustomerDetails", payload: { changes, expected }, updatedAt: new Date().toISOString() });
      savedLocally = true;
      if (!isCurrent()) return;
      setMessage("Saved on this device. Sending changes…");
      const response = await fetch(`/api/manager/customers/${encodeURIComponent(customer.customer.id)}`, {
        method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "x-expected-user-id": String(actorId.current) }, body: JSON.stringify({ changes, expected })
      });
      if (!isCurrent()) return;
      if (response.status === 401 || response.status === 403) throw new ManagerApiError("Manager access is required.", "authorization");
      let body: { customer?: ManagerCustomer; message?: unknown };
      try {
        const value: unknown = await response.json();
        if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
        body = value;
      } catch { throw new ManagerApiError("Customer save confirmation is invalid.", "unavailable"); }
      if (!response.ok) throw new ManagerApiError(typeof body.message === "string" ? body.message : "Changes could not be applied. Refresh and review the customer before retrying.",
        [400, 404, 409, 422].includes(response.status) ? "domain" : "unavailable");
      if (!body.customer || body.customer.customer?.id !== customer.customer.id || !fields.every((key) => body.customer!.customer[key] === changes[key])) {
        throw new ManagerApiError("Customer save confirmation is invalid.", "unavailable");
      }
      // Reuse the existing full customer validator for the authoritative refresh.
      const refreshed = await loadManagerCustomer(customer.customer.id);
      if (!isCurrent()) return;
      if (!fields.every((key) => refreshed.customer[key] === changes[key])) throw new ManagerApiError("Customer details changed during the refresh. Review before retrying.", "unavailable");
      confirmed = detailsOf(refreshed);
      await settleDraft(confirmed, true);
      if (!isCurrent()) return;
      const newerEdits = editVersion.current !== submittedVersion;
      if (!newerEdits) { latestDetails.current = confirmed; setDetails(confirmed); }
      setExpected(confirmed); onSaved(refreshed);
      setMessage(newerEdits ? "Submitted changes saved. Newer edits remain saved on this device; Save changes to send them." : "Changes saved.");
    } catch (error) {
      if (!isCurrent()) return;
      if (savedLocally) {
        try { await settleDraft(confirmed ?? expected, false); }
        catch {
          setMessage("Local recovery save failed. Keep this screen open and retry.");
          if (error instanceof ManagerApiError && error.kind !== "domain") onAuthorityFailure(error);
          return;
        }
        if (!isCurrent()) return;
      }
      setMessage(`${error instanceof Error ? error.message : "Server unavailable."} ${savedLocally ? "Your edit remains saved on this device; retry Save changes when ready." : "Local save failed. Keep this screen open and retry."}`);
      if (savedLocally || error instanceof ManagerApiError) {
        const failure = error instanceof ManagerApiError ? error : new ManagerApiError("Customer authority could not be refreshed. Your edit remains saved on this device.", "unavailable");
        if (failure.kind !== "domain") onAuthorityFailure(failure);
      }
    } finally { if (isCurrent()) setSaving(false); }
  };
  const discard = async () => {
    if (saving) return;
    try {
      if (draftKey.current) await deviceDatabase.drafts.delete(draftKey.current);
      latestDetails.current = detailsOf(customer); editVersion.current++;
      setDetails(latestDetails.current); setExpected(detailsOf(customer)); setReady(Boolean(draftKey.current)); setMessage("Changes discarded.");
    } catch { setMessage("The saved edit could not be discarded. Try again."); }
  };
  const labels = { displayName: "Customer name", contactPerson: "Contact person", contactPhone: "Phone", fax: "Fax", contractNumber: "Contract number", serviceFrequency: "Service frequency" };
  return <section className="report-summary setup-card customer-form-card" aria-label="Customer details">
    <p className="form-message">Edits apply to all visits, past and future.</p>
    <form onSubmit={(event) => void submit(event)}>
      {fields.map((key) => <label key={key}>{labels[key]}{key === "serviceFrequency"
        ? <select value={details[key] ?? ""} onChange={(event) => changeField(key, event.target.value)}><option value="">Not set</option>{["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY"].map((value) => <option key={value}>{value}</option>)}</select>
        : <input required={key === "displayName"} maxLength={key === "contactPhone" || key === "fax" ? 40 : 160} value={details[key] ?? ""} onChange={(event) => changeField(key, event.target.value)} />}</label>)}
      {message ? <p role="status">{message}</p> : null}
      <div className="inline-actions"><button type="button" className="secondary-command" disabled={saving} onClick={() => void discard()}>Discard</button><button disabled={saving || !ready}>{saving ? "Saving…" : "Save changes"}</button></div>
    </form>
  </section>;
}
