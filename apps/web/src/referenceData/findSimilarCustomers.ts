/** Advisory matching only. The server's exact-duplicate rule remains authoritative. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[.,'’]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim().replace(/\s+/g, " ").replace(/(?:\s+|^)(?:sdn\s+)?(?:bhd|berhad)$/, "").trim();
}

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]));
    row = next;
  }
  return row[b.length];
}

export function findSimilarCustomers<T extends { id: string; displayName: string }>(name: string, customers: readonly T[]): T[] {
  const query = normalize(name);
  if (!query) return [];
  return customers.map((customer, index) => {
    const candidate = normalize(customer.displayName);
    let score = Infinity;
    if (candidate && candidate === query) score = 0;
    else if (Math.min(query.length, candidate.length) >= 3 && (candidate.includes(query) || query.includes(candidate))) score = 1;
    else if (Math.min(query.length, candidate.length) >= 5 && Math.abs(query.length - candidate.length) <= 2) {
      const edits = distance(query, candidate);
      if (edits <= (Math.max(query.length, candidate.length) >= 10 ? 2 : 1)) score = 2 + edits;
    }
    return { customer, score, index };
  }).filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => a.score - b.score || a.index - b.index).slice(0, 3).map(({ customer }) => customer);
}
