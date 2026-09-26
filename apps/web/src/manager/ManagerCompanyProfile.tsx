import { type FormEvent, useEffect, useState } from "react";
import {
  loadManagerCompanyProfile,
  ManagerApiError,
  saveManagerCompanyProfile,
  type ManagerCompanyProfile as CompanyProfileData
} from "./managerApi";

type Draft = Omit<CompanyProfileData, "logoFile">;

function draftFrom(profile: CompanyProfileData): Draft {
  const { legalName, registrationNo, address, tel, fax, email, complaintHotline, verifiedBy, reportNumberFormat, confirmed } = profile;
  return { legalName, registrationNo, address, tel, fax, email, complaintHotline, verifiedBy: { ...verifiedBy }, reportNumberFormat, confirmed };
}

/**
 * Manager-only settings screen (route `manager-company-profile`, admin-only like Service
 * Catalog) for the single global report letterhead — company name/address/contact/report-number
 * format shown on every PDF's cover page. This is NOT the V1–V7 evidence template (frozen,
 * forward-only per system version); it only edits branding text that layers on top of that
 * frozen structure. The letterhead logo image itself stays file-based for now (no upload here).
 */
export function ManagerCompanyProfile({ onAuthorityFailure }: {
  onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const [profile, setProfile] = useState<CompanyProfileData | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fail = (reason: unknown, fallback: string) => {
    if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
    else setError(reason instanceof Error ? reason.message : fallback);
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    loadManagerCompanyProfile(controller.signal)
      .then((loaded) => { if (!controller.signal.aborted) { setProfile(loaded); setDraft(draftFrom(loaded)); } })
      .catch((reason) => { if (!controller.signal.aborted) fail(reason, "Company profile could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const dirty = !!profile && !!draft && JSON.stringify(draftFrom(profile)) !== JSON.stringify(draft);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const saved = await saveManagerCompanyProfile({
        ...draft,
        legalName: draft.legalName.trim(), registrationNo: draft.registrationNo.trim(), address: draft.address.trim(),
        tel: draft.tel.trim(), fax: draft.fax.trim(), email: draft.email.trim(), complaintHotline: draft.complaintHotline.trim(),
        verifiedBy: { name: draft.verifiedBy.name.trim(), title: draft.verifiedBy.title.trim() },
        reportNumberFormat: draft.reportNumberFormat.trim()
      });
      setProfile(saved); setDraft(draftFrom(saved)); setMessage("Company profile saved. New PDFs will use it immediately.");
    } catch (reason) { fail(reason, "Company profile could not be saved."); }
    finally { setSaving(false); }
  };

  const field = (label: string, value: string, onChange: (value: string) => void, options: { maxLength: number; required?: boolean; type?: string } = { maxLength: 500 }) =>
    <label>{label}<input type={options.type ?? "text"} maxLength={options.maxLength} required={options.required} value={value} onChange={(event) => onChange(event.target.value)} /></label>;

  return <section aria-labelledby="manager-company-profile-title">
    <div className="workspace-heading"><div><p className="eyebrow">Manager workspace</p><h2 id="manager-company-profile-title">Company Profile</h2><p>Edit the company letterhead shown on every generated PDF report — no code change or redeploy needed.</p></div></div>
    {message ? <p role="status" className="form-message">{message}</p> : null}
    {error ? <p role="alert" className="form-message">{error}</p> : null}
    {loading ? <p role="status">Loading company profile…</p> : null}
    {!loading && draft ? <form onSubmit={(event) => void submit(event)}>
      {field("Legal name", draft.legalName, (value) => setDraft({ ...draft, legalName: value }), { maxLength: 500, required: true })}
      {field("Registration No.", draft.registrationNo, (value) => setDraft({ ...draft, registrationNo: value }), { maxLength: 100 })}
      <label>Address<textarea maxLength={500} required value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
      {field("Telephone", draft.tel, (value) => setDraft({ ...draft, tel: value }), { maxLength: 100 })}
      {field("Fax", draft.fax, (value) => setDraft({ ...draft, fax: value }), { maxLength: 100 })}
      {field("Email", draft.email, (value) => setDraft({ ...draft, email: value }), { maxLength: 200, type: "email" })}
      {field("Complaint hotline", draft.complaintHotline, (value) => setDraft({ ...draft, complaintHotline: value }), { maxLength: 100 })}
      {field("Verified-by name", draft.verifiedBy.name, (value) => setDraft({ ...draft, verifiedBy: { ...draft.verifiedBy, name: value } }), { maxLength: 200 })}
      {field("Verified-by title", draft.verifiedBy.title, (value) => setDraft({ ...draft, verifiedBy: { ...draft.verifiedBy, title: value } }), { maxLength: 200 })}
      <label>Report number format<input type="text" maxLength={100} required value={draft.reportNumberFormat} onChange={(event) => setDraft({ ...draft, reportNumberFormat: event.target.value })} /></label>
      <p className="empty-state">Must include the literal tokens <code>{"{YYYY}"}</code> and <code>{"{SEQ4}"}</code>, e.g. <code>MFE/SR/{"{YYYY}"}/{"{SEQ4}"}</code>.</p>
      <label className="manager-show-archived"><input type="checkbox" checked={draft.confirmed} onChange={(event) => setDraft({ ...draft, confirmed: event.target.checked })} /> Company details confirmed as final</label>
      <button type="submit" disabled={saving || !dirty}>{saving ? "Saving…" : "Save company profile"}</button>
    </form> : null}
  </section>;
}
