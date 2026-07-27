import { useState } from "react";
import type {
  ServerAutomaticSprinklerDetail,
  ServerInspectionAttachment
} from "./serverAutomaticSprinklerApi";
import { serverAttachmentContentUrl } from "./serverAutomaticSprinklerApi";
import type {
  SprinklerMeasurementResponse,
  SprinklerRowResponse
} from "./automaticSprinklerTypes";

type Props = {
  inspection: ServerAutomaticSprinklerDetail;
  onBack: () => void;
};

const resultLabel = (value: string | null | undefined) =>
  value === "good" ? "Good" : value === "poor" ? "Poor" : "Not recorded";

function ServerPhoto({
  attachment
}: {
  attachment: ServerInspectionAttachment;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentUrl = serverAttachmentContentUrl(attachment.photoUuid);
  const source = attachment.captureSource === "camera"
    ? "Camera"
    : attachment.captureSource === "gallery"
      ? "Gallery"
      : "Photo";
  return <div className="photo-evidence-field">
    <button
      type="button"
      className="photo-thumbnail"
      onClick={() => setExpanded(true)}
      aria-label={`View ${source} photo`}
    >
      <img src={contentUrl} alt={`${source} inspection evidence`} />
    </button>
    <p className="secondary-metadata">
      {source} attachment Â· {new Date(attachment.capturedAt).toLocaleString()}
    </p>
    {expanded ? <div className="photo-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Inspection photo">
      <section className="photo-dialog photo-full-view">
        <img src={contentUrl} alt={`${source} inspection evidence full size`} />
        <button type="button" onClick={() => setExpanded(false)}>Close</button>
      </section>
    </div> : null}
  </div>;
}

export function ServerAutomaticSprinklerView({ inspection, onBack }: Props) {
  const { displayControls: controls, responses } = inspection;
  const attachmentsByPath = new Map(
    inspection.attachments.map((attachment) => [attachment.fieldPath, attachment])
  );

  function checklistRow(
    section: "waterTank" | "pumpHouse" | "mainAlarmValve",
    key: string
  ) {
    const definition = controls.checklist[section].find((item) => item.key === key);
    const response = (responses[section] as Record<string, SprinklerRowResponse>)[key];
    if (!definition || !response) return null;
    return <section className="hose-check-row" key={key}>
      <strong>{definition.label}</strong>
      <span>{resultLabel(response.result)}</span>
      <p>{response.remarks || "No remarks"}</p>
    </section>;
  }

  function measurementRow(key: string) {
    const definition = controls.measurements.find((item) => item.key === key);
    const response = (
      responses.measurements as unknown as
        Record<string, SprinklerMeasurementResponse<string>>
    )[key];
    if (!definition || !response) return null;
    return <section className="measurement-card" key={key}>
      <strong>{definition.label}</strong>
      {definition.values.map((value) => {
        const fieldPath = `measurements.${key}.${value.key}`;
        const attachment = attachmentsByPath.get(fieldPath);
        return <div className="psi-value-with-evidence" key={value.key}>
          <div>
            <span className="status-caption">{value.label}</span>
            <strong>{response.values[value.key] ?? "Not recorded"} {value.unit}</strong>
          </div>
          {attachment ? <ServerPhoto attachment={attachment} /> : null}
        </div>;
      })}
      <span>{resultLabel(response.result)}</span>
      <p>{response.remarks || "No remarks"}</p>
    </section>;
  }

  function sectionRows(section: "waterTank" | "pumpHouse" | "mainAlarmValve") {
    return controls.layout[section].map((row) =>
      row.kind === "measurement"
        ? measurementRow(row.key)
        : checklistRow(section, row.key)
    );
  }

  return <section className="hose-reel-form sprinkler-form" aria-labelledby="server-sprinkler-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context">
      <div>
        <p className="eyebrow">{inspection.jobReference}</p>
        <h2 id="server-sprinkler-title">{inspection.jobTitle}</h2>
        <p>{inspection.customerName}</p>
        <p className="secondary-metadata">Inspection UUID: {inspection.clientUuid}</p>
      </div>
      <div>
        <span className="status-caption">{inspection.systemLabel}</span>
        <strong className="inspection-status status-synced">Completed</strong>
      </div>
    </header>
    <p className="success-message">
      Submitted {new Date(inspection.performedAt).toLocaleString()} Â· Synced by {inspection.syncedByUsername}
    </p>
    <section aria-labelledby="server-water-tank-title">
      <h3 id="server-water-tank-title">Water Tank</h3>
      {sectionRows("waterTank")}
    </section>
    <section aria-labelledby="server-pump-house-title">
      <h3 id="server-pump-house-title">Pump House</h3>
      {sectionRows("pumpHouse")}
    </section>
    <section aria-labelledby="server-main-valve-title">
      <h3 id="server-main-valve-title">Main Alarm Valve</h3>
      {sectionRows("mainAlarmValve")}
    </section>
    <section>
      <h3>Comments</h3>
      <p>{responses.comments || "No comments"}</p>
    </section>
  </section>;
}
