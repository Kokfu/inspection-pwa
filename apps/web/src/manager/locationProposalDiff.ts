export type ProposalRow = Readonly<Record<string, string>>;
export type ProposalRowDiff = {
  kind: "Added" | "Removed" | "Changed" | "Unchanged";
  before?: ProposalRow; after?: ProposalRow;
  beforeIndex?: number; afterIndex?: number;
};
const rowKey = (row: ProposalRow) => JSON.stringify(Object.keys(row).sort().map(key => [key, row[key]]));

/** Exact rows anchor the comparison so a removal does not mark every following row as changed.
 * Unmatched runs are paired in order: rows have no persistent identity in the W0 contract. */
export function diffLocationProposalRows(before: readonly ProposalRow[], after: readonly ProposalRow[]): ProposalRowDiff[] {
  const beforeKeys = before.map(rowKey), afterKeys = after.map(rowKey);
  const lengths = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lengths[i][j] = beforeKeys[i] === afterKeys[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const result: ProposalRowDiff[] = [];
  let i = 0, j = 0, startI = 0, startJ = 0;
  function flush() {
    const count = Math.max(i - startI, j - startJ);
    for (let k = 0; k < count; k++) {
      const bi = startI + k, ai = startJ + k;
      const hasBefore = bi < i, hasAfter = ai < j;
      result.push({ kind: hasBefore && hasAfter ? "Changed" : hasBefore ? "Removed" : "Added",
        ...(hasBefore ? { before: before[bi], beforeIndex: bi } : {}),
        ...(hasAfter ? { after: after[ai], afterIndex: ai } : {}) });
    }
  }
  while (i < before.length && j < after.length) {
    if (beforeKeys[i] === afterKeys[j]) {
      flush();
      result.push({ kind: "Unchanged", before: before[i], after: after[j], beforeIndex: i, afterIndex: j });
      i++; j++; startI = i; startJ = j;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++;
    else j++;
  }
  i = before.length; j = after.length; flush();
  return result;
}
