import { createRoot } from "react-dom/client";
import type { AuthUser } from "../src/auth/authApi";
import { AwaitingRepairVisits, CustomerRepairVisits, useRepairVisitList } from "../src/manager/repairVisits/RepairVisitEntries";
import { RepairVisitReview } from "../src/manager/repairVisits/RepairVisitReview";
import "../src/styles/app.css";

const params = new URLSearchParams(location.search);
const role = (params.get("role") ?? "admin") as AuthUser["role"];
const visitId = params.get("visit") ?? "";
const log = (name: string, value?: string) => {
  const target = document.getElementById("events")!;
  const item = document.createElement("li");
  item.textContent = value === undefined ? name : `${name}:${value}`;
  target.append(item);
};

function Review() {
  return <RepairVisitReview visitId={visitId} role={role} onBack={() => log("back")} onDecided={event => log("decided", event)} onAuthorityFailure={() => log("authority")} />;
}

const names = {
  customers: new Map([["11111111-1111-4111-8111-111111111111", "Sample Customer Sdn Bhd"]]),
  sites: new Map([["22222222-2222-4222-8222-222222222222", "Head Office"]]),
  technicians: new Map([[7, "Tech Demo"]])
};

function Entries() {
  const { state, reload } = useRepairVisitList(role, () => log("authority"));
  return (
    <main>
      <CustomerRepairVisits customerId="11111111-1111-4111-8111-111111111111" state={state} onRetry={reload} names={names} onOpen={id => log("open", id)} />
      <AwaitingRepairVisits state={state} onRetry={reload} names={names} onOpen={id => log("open", id)} />
    </main>
  );
}

createRoot(document.getElementById("view")!).render(params.get("mode") === "entries" ? <Entries /> : <main><Review /></main>);
