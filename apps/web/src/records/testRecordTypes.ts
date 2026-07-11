import type { TestRecord } from "../db/localDatabase";

export type TestRecordFormValues = {
  title: string;
  notes: string;
  createdAt: string;
};

export type TestRecordPayload = {
  clientUuid: string;
  title: string;
  notes: string;
  createdAt: string;
};

export type TestRecordView = TestRecord;

