const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;

export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

export const leadSearchColumns = [
  "name",
  "company",
  "email",
  "owner",
  "next_action",
] as const;

export function escapeLikePattern(value: string) {
  return value.replace(/[%_\\]/g, "\\$&");
}

// PostgREST splits `.or()` conditions on commas, so each value must be quoted
// and any embedded double quote escaped. Percent and underscore are escaped for
// LIKE so a search term cannot become a wildcard.
export function quotePostgrestValue(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function buildLeadSearchPattern(query: string) {
  return quotePostgrestValue(`%${escapeLikePattern(query.trim())}%`);
}

export function buildLeadSearchOrFilter(query: string) {
  return leadSearchColumns
    .map((column) => `${column}.ilike.${buildLeadSearchPattern(query)}`)
    .join(",");
}

export function isLeadStatus(value: string): value is LeadStatusValue {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function shouldTouchLastContacted(payload: Record<string, unknown>) {
  return payload.status !== undefined;
}