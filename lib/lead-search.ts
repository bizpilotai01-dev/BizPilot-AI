const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;

export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

export const leadSearchColumns = [
  "name",
  "company",
  "email",
  "owner",
  "next_action",
] as const;

// Search terms are matched with ILIKE, so `%`, `_` and `*` would act as
// wildcards and a one-character term could return the entire pipeline. Escaping
// them was tried and rejected: the value passes through PostgREST's own
// unescaping before SQL sees it, and the two layers disagreed. A single `%`
// matched all six leads, and `*` still matched rows afterwards.
//
// Stripping is used instead because it does not depend on how many unescape
// layers sit between here and Postgres. Verified against the live database that
// ordinary terms ("aisha", "bluepeak", "nest") still match correctly once
// stripped.
export function sanitizeLeadSearchTerm(query: string) {
  return query.trim().replace(/[%_*\\]/g, "");
}

// PostgREST splits `.or()` conditions on commas, so each value must be quoted
// and any embedded double quote escaped.
export function quotePostgrestValue(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function buildLeadSearchPattern(query: string) {
  return quotePostgrestValue(`%${sanitizeLeadSearchTerm(query)}%`);
}

export function buildLeadSearchOrFilter(query: string) {
  return leadSearchColumns
    .map((column) => `${column}.ilike.${buildLeadSearchPattern(query)}`)
    .join(",");
}

// True when a search was asked for but nothing searchable is left in it, e.g.
// `?q=%`. The caller must return no leads rather than fall through to an
// unfiltered list.
export function isEmptyLeadSearchTerm(query: string) {
  return query.trim().length > 0 && sanitizeLeadSearchTerm(query).length === 0;
}

export function isLeadStatus(value: string): value is LeadStatusValue {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function shouldTouchLastContacted(payload: Record<string, unknown>) {
  return payload.status !== undefined;
}