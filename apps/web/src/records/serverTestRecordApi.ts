export type ServerTestRecord = {
  clientUuid: string;
  title: string;
  notes: string;
  createdAt: string;
};

type ServerTestRecordResponse = {
  records?: ServerTestRecord[];
};

export async function loadServerTestRecords() {
  const response = await fetch("/api/test-records", {
    credentials: "same-origin",
    cache: "no-store"
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Sign in with an authorized account to load server records");
  }

  if (!response.ok) {
    throw new Error("Server records are currently unavailable");
  }

  const data = (await response.json()) as ServerTestRecordResponse;
  return Array.isArray(data.records) ? data.records : [];
}
