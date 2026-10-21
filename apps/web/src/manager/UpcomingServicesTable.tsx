import { memo, useRef } from "react";
import type { DueStatus } from "../schedule/dueStatus";
import type { ScheduledCustomer } from "./managerApi";
import { UpcomingServiceDatePopover } from "./UpcomingServiceDatePopover";
import { UpcomingServiceRowMenu, type UpcomingServiceAction } from "./UpcomingServiceRowMenu";

export type UpcomingRow = { customer: ScheduledCustomer; status: DueStatus; label: string; dateText: string | null };
export type UpcomingSort = { key: "name" | "due"; dir: "asc" | "desc" };

type RowHandlers = {
  onOpenPicker: (customerId: string, opener: HTMLElement | null) => void;
  onSavePicker: (customerId: string, value: string) => void;
  onCancelPicker: () => void;
  onAction: (customerId: string, action: UpcomingServiceAction, opener: HTMLElement | null) => void;
};

const UpcomingTableRow = memo(function UpcomingTableRow({ row, busy, pickerOpen, handlers }: { row: UpcomingRow; busy: boolean; pickerOpen: boolean; handlers: RowHandlers }) {
  const { customer } = row;
  const rescheduleRef = useRef<HTMLButtonElement>(null);
  return <tr>
    <td data-label="Customer" className="upcoming-customer"><strong>{customer.displayName}</strong><span className="secondary-metadata">{customer.code}</span></td>
    <td data-label="Next due">{row.dateText ?? <span className="secondary-metadata">Not set</span>}</td>
    <td data-label="Status"><span className={`upcoming-status upcoming-status--${row.status}`}>{row.label}</span></td>
    <td data-label="Actions" className="upcoming-actions">
      <button ref={rescheduleRef} type="button" aria-haspopup="dialog" aria-expanded={pickerOpen} aria-label={`${customer.nextServiceDueDate ? "Reschedule" : "Set date"} for ${customer.displayName}`}
        onClick={() => handlers.onOpenPicker(customer.id, rescheduleRef.current)}>{customer.nextServiceDueDate ? "Reschedule" : "Set date"}</button>
      <UpcomingServiceRowMenu customerName={customer.displayName} hasDueDate={customer.nextServiceDueDate !== null} onSelect={(action, opener) => handlers.onAction(customer.id, action, opener)} />
      {pickerOpen && <UpcomingServiceDatePopover customerName={customer.displayName} initial={customer.nextServiceDueDate ?? ""} busy={busy}
        onSave={(value) => handlers.onSavePicker(customer.id, value)} onCancel={handlers.onCancelPicker} />}
    </td>
  </tr>;
});

function SortHeader({ label, sortKey, sort, onSort }: { label: string; sortKey: UpcomingSort["key"]; sort: UpcomingSort; onSort: (key: UpcomingSort["key"]) => void }) {
  const active = sort.key === sortKey;
  return <th scope="col" className={`upcoming-th--${sortKey}`} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
    <button type="button" className="upcoming-sort" onClick={() => onSort(sortKey)}>{label}<span aria-hidden="true">{active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</span></button>
  </th>;
}

/** Semantic table above 700 px; CSS turns each row into a stacked card below it. */
export function UpcomingServicesTable({ rows, sort, onSort, busy, pickerId, handlers }: {
  rows: UpcomingRow[]; sort: UpcomingSort; onSort: (key: UpcomingSort["key"]) => void; busy: boolean; pickerId: string | null; handlers: RowHandlers;
}) {
  return <table className="upcoming-table">
    <caption className="visually-hidden">Customers and their next service due date</caption>
    <thead><tr>
      <SortHeader label="Customer" sortKey="name" sort={sort} onSort={onSort} />
      <SortHeader label="Next due" sortKey="due" sort={sort} onSort={onSort} />
      <th scope="col" className="upcoming-th--plain">Status</th>
      <th scope="col" className="upcoming-th--plain">Actions</th>
    </tr></thead>
    <tbody>{rows.map((row) => <UpcomingTableRow key={row.customer.id} row={row} busy={busy} pickerOpen={pickerId === row.customer.id} handlers={handlers} />)}</tbody>
  </table>;
}
