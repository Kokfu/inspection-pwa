import { useEffect, useState } from "react";
import type { InspectionRecord } from "../db/localDatabase";
import { sampleInspectionJob, sampleInspectionTemplateSnapshot } from "./sampleInspection";
import { snapshotItems, type InspectionFormValues, type InspectionTemplateSnapshot } from "./inspectionTypes";

type InspectionFormProps = {
  draft?: InspectionRecord;
  onSaveDraft: (values: InspectionFormValues) => Promise<void>;
  onSubmitLocal: (values: InspectionFormValues) => Promise<void>;
};

function initialValues(snapshot: InspectionTemplateSnapshot): InspectionFormValues {
  return {
    title: "",
    locationNotes: "",
    performedAt: new Date().toISOString().slice(0, 16),
    responses: Object.fromEntries(snapshotItems(snapshot).map((item) => [item.itemId, { value: "", remarks: "" }]))
  };
}

function valuesFromDraft(draft: InspectionRecord): InspectionFormValues {
  return {
    title: draft.header.title,
    locationNotes: draft.header.locationNotes,
    performedAt: draft.header.performedAt,
    responses: Object.fromEntries(
      draft.responses.map((response) => [
        response.templateItemId,
        { value: response.value, remarks: response.remarks }
      ])
    )
  };
}

export function InspectionForm({
  draft,
  onSaveDraft,
  onSubmitLocal
}: InspectionFormProps) {
  const templateSnapshot = draft?.templateSnapshot ?? sampleInspectionTemplateSnapshot;
  const [values, setValues] = useState<InspectionFormValues>(() => initialValues(templateSnapshot));
  const [message, setMessage] = useState("");

  useEffect(() => {
    setValues(draft ? valuesFromDraft(draft) : initialValues(sampleInspectionTemplateSnapshot));
    setMessage(draft ? "Editing saved Draft" : "");
  }, [draft]);

  function updateResponse(itemId: string, field: "value" | "remarks", value: string) {
    setValues((current) => ({
      ...current,
      responses: {
        ...current.responses,
        [itemId]: { ...current.responses[itemId], [field]: value }
      }
    }));
  }

  async function saveDraft() {
    await onSaveDraft(values);
    setMessage("Inspection draft saved on this device");
  }

  async function submitLocal() {
    if (!values.title.trim()) {
      setMessage("Inspection title is required before local submission");
      return;
    }
    if (snapshotItems(templateSnapshot).some((item) => item.required && !values.responses[item.itemId]?.value.trim())) {
      setMessage("Complete each required sample checklist response before local submission");
      return;
    }
    await onSubmitLocal(values);
    setMessage("Inspection is pending sync");
  }

  return (
    <section className="inspection-form" aria-labelledby="inspection-form-title">
      <p className="eyebrow">Sample only</p>
      <h2 id="inspection-form-title">Inspection Workspace</h2>
      <p>{sampleInspectionJob.reference}: {sampleInspectionJob.title}</p>
      {draft ? <p className="form-message">Editing Draft {draft.clientUuid}</p> : null}
      <label>
        <span>Inspection Title</span>
        <input value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} />
      </label>
      <label>
        <span>Location / Job Notes</span>
        <textarea value={values.locationNotes} onChange={(event) => setValues({ ...values, locationNotes: event.target.value })} />
      </label>
      <label>
        <span>Performed At</span>
        <input type="datetime-local" value={values.performedAt} onChange={(event) => setValues({ ...values, performedAt: event.target.value })} />
      </label>
      {templateSnapshot.sections.slice().sort((left, right) => left.sortOrder - right.sortOrder).map((section) => (
      <fieldset key={section.sectionId}>
        <legend>{section.sectionName}</legend>
        {section.items.slice().sort((left, right) => left.sortOrder - right.sortOrder).map((item) => (
          <div className="checklist-row" key={item.itemId}>
            <label>
              <span>{item.label}{item.required ? " (required)" : ""}</span>
              {item.responseType === "status" ? (
                <select value={values.responses[item.itemId]?.value ?? ""} onChange={(event) => updateResponse(item.itemId, "value", event.target.value)}>
                  <option value="">Select status</option>
                  {item.options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
                </select>
              ) : (
                <input type={item.responseType === "number" ? "number" : "text"} value={values.responses[item.itemId]?.value ?? ""} onChange={(event) => updateResponse(item.itemId, "value", event.target.value)} />
              )}
            </label>
            <label>
              <span>Remarks</span>
              <input value={values.responses[item.itemId]?.remarks ?? ""} onChange={(event) => updateResponse(item.itemId, "remarks", event.target.value)} />
            </label>
          </div>
        ))}
      </fieldset>
      ))}
      <div className="form-actions">
        <button type="button" onClick={saveDraft}>Save Draft</button>
        <button type="button" onClick={submitLocal}>Submit Local</button>
      </div>
      {message ? <p className="form-message">{message}</p> : null}
    </section>
  );
}
