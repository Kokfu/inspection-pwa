import { useEffect, useId, useState } from "react";
import type { LocationProposal, SiteProposal } from "./managerApi";

type Request = SiteProposal | LocationProposal;
type Customer = Pick<Request, "customerId" | "customerDisplayName">;

export function proposalMatches(item: Request, customerId: string, text: string): boolean {
  if (customerId && item.customerId !== customerId) return false;
  const query = text.trim().toLocaleLowerCase();
  const fields = [item.customerDisplayName, item.submittedBy, item.jobReference];
  if ("payload" in item) {
    fields.push(item.systemDisplayName);
    if (item.payload.kind === "add-location") fields.push(item.payload.displayName, item.payload.newZone?.displayName ?? null);
    else for (const row of item.payload.rows) {
      for (const key of ["locationText", "location", "zoneText", "alarmZone", "assetReference"]) fields.push(row[key]);
    }
  } else fields.push(item.proposedDisplayName, item.proposedAddress);
  return !query || fields.some(value => value?.toLocaleLowerCase().includes(query));
}

export function proposalCustomers(items: readonly Customer[]): Customer[] {
  return [...new Map(items.map(item => [item.customerId, { customerId: item.customerId, customerDisplayName: item.customerDisplayName }])).values()]
    .sort((a, b) => a.customerDisplayName.localeCompare(b.customerDisplayName) || a.customerId.localeCompare(b.customerId));
}

export function useProposalFilters<T extends Request>(items: readonly T[] | undefined, tab: string) {
  const [customer, setCustomer] = useState<Customer>();
  const [input, setInput] = useState("");
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const customers = proposalCustomers(items ?? []);
  useEffect(() => {
    // Loading or failed lists cannot establish whether the customer is absent.
    if (items && customer && !items.some(item => item.customerId === customer.customerId)) {
      setNotice(`Customer filter cleared: no ${tab} requests for ${customer.customerDisplayName}.`);
      setCustomer(undefined);
    }
  }, [items, customer, tab]);
  const active = Boolean(customer || text);
  const visible = items?.filter(item => proposalMatches(item, customer?.customerId ?? "", text));
  return {
    visible, active,
    bar: <ProposalFilterBar customers={customers} customerId={customer?.customerId ?? ""} input={input}
      onCustomer={id => { setCustomer(customers.find(item => item.customerId === id)); setNotice(""); }}
      onInput={setInput} onSearch={() => { setText(input.trim()); setNotice(""); }}
      onClear={() => { setInput(""); setText(""); setNotice(""); }} />,
    result: (active || notice) && items ? <p role="status" className="proposal-filter-result">
      {notice}{notice && active ? " " : ""}{active ? `Showing ${visible?.length} of ${items.length} requests` : ""}
    </p> : null
  };
}

function ProposalFilterBar({ customers, customerId, input, onCustomer, onInput, onSearch, onClear }: {
  customers: Customer[]; customerId: string; input: string;
  onCustomer: (id: string) => void; onInput: (text: string) => void; onSearch: () => void; onClear: () => void;
}) {
  const id = useId();
  return <div className="proposal-filters">
    <div><label htmlFor={`${id}-customer`}>Customer</label><select id={`${id}-customer`} name="proposalCustomer" value={customerId} onChange={event => onCustomer(event.target.value)}>
      <option value="">All customers</option>{customers.map(customer => <option key={customer.customerId} value={customer.customerId}>{customer.customerDisplayName}</option>)}
    </select></div>
    <form className="manager-search-form" role="search" aria-label="Find requests" onSubmit={event => { event.preventDefault(); onSearch(); }}>
      <label htmlFor={id}>Search requests</label>
      <div className="manager-search-row"><input id={id} name="proposalSearch" type="search" autoComplete="off" maxLength={200} value={input} onChange={event => onInput(event.target.value)} />
        <button type="submit">Search</button><button type="button" className="secondary-command" onClick={onClear}>Clear</button></div>
    </form>
  </div>;
}
