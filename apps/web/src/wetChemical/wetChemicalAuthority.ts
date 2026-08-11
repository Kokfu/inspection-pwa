import type { ClientAuthState } from "../auth/authStateTypes";
import type { MasterSystemFormInstanceRecord } from "../co2/co2Types";
import type { ServerMasterSystemInspectionSummary } from "../hoseReel/serverMasterSystemInspectionApi";
import type { ServerWetChemicalDetail } from "./serverWetChemicalApi";

export type WetChemicalAuthorityResolution =
  | { kind: "loading" }
  | { kind: "local"; record: MasterSystemFormInstanceRecord }
  | { kind: "server"; inspection: ServerWetChemicalDetail }
  | { kind: "server-unavailable"; message: string };

type Dependencies = {
  findSummary: (record: MasterSystemFormInstanceRecord) => Promise<ServerMasterSystemInspectionSummary | undefined>;
  loadDetail: (clientUuid: string, expectedJobId?: string) => Promise<ServerWetChemicalDetail>;
};

export async function resolveWetChemicalAuthority(
  authStatus: ClientAuthState["status"],
  requestedClientUuid: string,
  local: MasterSystemFormInstanceRecord | undefined,
  dependencies: Dependencies
): Promise<WetChemicalAuthorityResolution> {
  if (authStatus === "offline-unverified") {
    return local ? { kind: "local", record: local } : { kind: "server-unavailable", message: "This inspection is not available in local device storage." };
  }
  if (authStatus !== "verified") return { kind: "loading" };
  try {
    if (!local) return { kind: "server", inspection: await dependencies.loadDetail(requestedClientUuid) };
    const summary = await dependencies.findSummary(local);
    if (!summary) return { kind: "local", record: local };
    const inspection = await dependencies.loadDetail(summary.clientUuid, local.jobId);
    if (inspection.instanceKey !== local.instanceKey) throw new Error("Accepted Wet Chemical detail does not match configured location");
    return { kind: "server", inspection };
  } catch (error) {
    return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Accepted Wet Chemical detail is unavailable" };
  }
}
