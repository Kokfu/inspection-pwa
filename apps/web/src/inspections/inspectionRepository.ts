import { localDatabase, type InspectionRecord, type SyncOutboxItem } from "../db/localDatabase";
import { sampleInspectionJob, sampleInspectionTemplate } from "./sampleInspection";
import type { InspectionFormValues, InspectionResponse } from "./inspectionTypes";

function nowIso() {
  return new Date().toISOString();
}

function responsesFrom(
  values: InspectionFormValues,
  existing?: InspectionRecord
): InspectionResponse[] {
  return sampleInspectionTemplate.items.map((item, index) => ({
    templateItemId: item.id,
    label:
      existing?.responses.find((response) => response.templateItemId === item.id)
        ?.label ?? item.label,
    responseType:
      existing?.responses.find((response) => response.templateItemId === item.id)
        ?.responseType ?? item.responseType,
    value: values.responses[item.id]?.value ?? "",
    remarks: values.responses[item.id]?.remarks ?? "",
    sortOrder: index + 1
  }));
}

function createRecord(
  values: InspectionFormValues,
  syncStatus: InspectionRecord["syncStatus"],
  existing?: InspectionRecord
): InspectionRecord {
  const timestamp = nowIso();
  return {
    clientUuid: existing?.clientUuid ?? crypto.randomUUID(),
    jobId: existing?.jobId ?? sampleInspectionJob.id,
    templateId: existing?.templateId ?? sampleInspectionTemplate.id,
    templateVersion: existing?.templateVersion ?? sampleInspectionTemplate.version,
    templateSnapshot:
      existing?.templateSnapshot ?? {
        name: sampleInspectionTemplate.name,
        version: sampleInspectionTemplate.version,
        section: sampleInspectionTemplate.section,
        items: sampleInspectionTemplate.items
      },
    header: {
      title: values.title.trim(),
      locationNotes: values.locationNotes,
      performedAt: values.performedAt
    },
    responses: responsesFrom(values, existing),
    localCreatedAt: existing?.localCreatedAt ?? timestamp,
    localUpdatedAt: timestamp,
    syncStatus,
    lastSyncedAt: existing?.lastSyncedAt
  };
}

function toPayload(record: InspectionRecord) {
  return {
    clientUuid: record.clientUuid,
    jobId: record.jobId,
    templateId: record.templateId,
    templateVersion: record.templateVersion,
    templateSnapshot: record.templateSnapshot,
    header: record.header,
    responses: record.responses.map(({ templateItemId, value, remarks, sortOrder }) => ({
      templateItemId,
      value,
      remarks,
      sortOrder
    }))
  };
}

export async function listInspectionRecords() {
  return localDatabase.inspectionRecords.orderBy("localUpdatedAt").reverse().toArray();
}

export async function saveInspectionDraft(
  values: InspectionFormValues,
  existing?: InspectionRecord
) {
  if (existing && existing.syncStatus !== "Draft") {
    throw new Error("Only Draft inspections can be edited in this phase");
  }

  const record = createRecord(values, "Draft", existing);
  await localDatabase.inspectionRecords.put(record);
  return record;
}

export async function submitLocalInspection(
  values: InspectionFormValues,
  existing?: InspectionRecord
) {
  if (existing && existing.syncStatus !== "Draft") {
    throw new Error("Only Draft inspections can be submitted in this phase");
  }

  const record = createRecord(values, "Pending", existing);
  const outboxItem: SyncOutboxItem = {
    operationId: crypto.randomUUID(),
    entityType: "inspection",
    entityId: record.clientUuid,
    action: "create",
    payload: toPayload(record),
    createdAt: record.localCreatedAt,
    attempts: 0,
    status: "Pending"
  };

  await localDatabase.transaction(
    "rw",
    localDatabase.inspectionRecords,
    localDatabase.syncOutbox,
    async () => {
      await localDatabase.inspectionRecords.put(record);
      const existingOutbox = await localDatabase.syncOutbox
        .where("entityId")
        .equals(record.clientUuid)
        .filter(
          (item) =>
            item.entityType === "inspection" && item.status !== "Completed"
        )
        .first();

      if (existingOutbox) {
        await localDatabase.syncOutbox.update(existingOutbox.operationId, {
          payload: outboxItem.payload,
          status: "Pending",
          lastError: undefined
        });
      } else {
        await localDatabase.syncOutbox.put(outboxItem);
      }
    }
  );
  return record;
}
