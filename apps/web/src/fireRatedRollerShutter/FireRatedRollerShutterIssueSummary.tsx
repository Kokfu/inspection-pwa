import { groupSubmitIssues } from "./fireRatedRollerShutterSetup";
import type { FireRatedRollerShutterResponses } from "./fireRatedRollerShutterTypes";

/** Plain messages shown before "Show all": enough to read at a glance, not a screenful. */
const flatPreviewLimit = 8;

/** The body of the "Cannot submit yet" box. With zone headings it is one short line per zone ("Zone 2: 8 things to fix")
 *  with the detail behind a control; a one-zone form shows its first messages and the rest behind "Show all". */
export function FireRatedRollerShutterIssueSummary({ responses, issues }: { responses: FireRatedRollerShutterResponses; issues: readonly string[] }) {
  const { general, zones } = groupSubmitIssues(responses, issues);
  const things = (count: number) => `${count} thing${count === 1 ? "" : "s"} to fix`;
  return <>
    <p>{zones.length > 0 ? `${things(issues.length)} in ${zones.length} zone${zones.length === 1 ? "" : "s"}.` : `${things(issues.length)}.`}</p>
    {zones.length > 0 ? <>
      {general.length > 0 ? <ul>{general.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : null}
      {zones.map(({ zone, issues: zoneIssues }) => <details key={zone}>
        <summary>{zone}: {things(zoneIssues.length)}</summary>
        <ul>{zoneIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
      </details>)}
    </> : <>
      <ul>{general.slice(0, flatPreviewLimit).map((issue, index) => <li key={index}>{issue}</li>)}</ul>
      {general.length > flatPreviewLimit ? <details>
        <summary>Show all {general.length}</summary>
        <ul>{general.slice(flatPreviewLimit).map((issue, index) => <li key={index}>{issue}</li>)}</ul>
      </details> : null}
    </>}
  </>;
}
