import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLeadSearchOrFilter,
  buildLeadSearchPattern,
  isEmptyLeadSearchTerm,
  isLeadStatus,
  quotePostgrestValue,
  sanitizeLeadSearchTerm,
  shouldTouchLastContacted,
} from "../lib/lead-search.ts";

// Verified against the live database: `?q=%` returned all six leads while the
// term was escaped, because PostgREST consumed the backslash meant for SQL and
// the wildcard reached Postgres live. Escaping was replaced with stripping.
test("sanitizeLeadSearchTerm removes every character that acts as a wildcard", () => {
  assert.equal(sanitizeLeadSearchTerm("%"), "");
  assert.equal(sanitizeLeadSearchTerm("_"), "");
  assert.equal(sanitizeLeadSearchTerm("*"), "");
  assert.equal(sanitizeLeadSearchTerm("\\"), "");
  assert.equal(sanitizeLeadSearchTerm("%%"), "");
  assert.equal(sanitizeLeadSearchTerm("**"), "");
  assert.equal(sanitizeLeadSearchTerm("50% deposit"), "50 deposit");
  assert.equal(sanitizeLeadSearchTerm("a_b"), "ab");
  assert.equal(sanitizeLeadSearchTerm("a*b"), "ab");
});

test("sanitizeLeadSearchTerm leaves ordinary search text untouched", () => {
  assert.equal(sanitizeLeadSearchTerm("aisha"), "aisha");
  assert.equal(sanitizeLeadSearchTerm("PrimeNest Realty"), "PrimeNest Realty");
  assert.equal(sanitizeLeadSearchTerm("aisha@primenest.com"), "aisha@primenest.com");
  assert.equal(sanitizeLeadSearchTerm("  bluepeak  "), "bluepeak");
  assert.equal(sanitizeLeadSearchTerm("O'Brien & Sons"), "O'Brien & Sons");
});

test("sanitizeLeadSearchTerm does not decode or otherwise alter text", () => {
  assert.equal(sanitizeLeadSearchTerm("say \"hi\""), 'say "hi"');
  assert.equal(sanitizeLeadSearchTerm("a,b"), "a,b");
  assert.equal(sanitizeLeadSearchTerm("100%"), "100");
});

test("quotePostgrestValue protects commas that would split the or() filter", () => {
  assert.equal(quotePostgrestValue("%aisha%"), '"%aisha%"');
  assert.equal(quotePostgrestValue("PrimeNest, Lagos"), '"PrimeNest, Lagos"');
  assert.equal(quotePostgrestValue('say "hi"'), '"say \\"hi\\""');
});

test("a stripped term can never carry a live wildcard into the pattern", () => {
  for (const term of ["%", "_", "*", "\\", "%%", "___", "**", "50%", "a%a", "a*a"]) {
    const pattern = buildLeadSearchPattern(term);
    assert.equal(pattern.includes("*"), false, term);
    // The only % characters left are the two deliberate wrapping wildcards.
    assert.equal(pattern.match(/%/g)?.length, 2, `${term} -> ${pattern}`);
  }
});

test("isEmptyLeadSearchTerm separates a wildcard-only term from no term at all", () => {
  assert.equal(isEmptyLeadSearchTerm("%"), true);
  assert.equal(isEmptyLeadSearchTerm("  *  "), true);
  assert.equal(isEmptyLeadSearchTerm("%%"), true);
  assert.equal(isEmptyLeadSearchTerm("aisha"), false);
  assert.equal(isEmptyLeadSearchTerm(""), false);
  assert.equal(isEmptyLeadSearchTerm("   "), false);
});

test("buildLeadSearchPattern wraps the sanitised term in literal wildcards", () => {
  assert.equal(buildLeadSearchPattern("aisha"), '"%aisha%"');
  assert.equal(buildLeadSearchPattern("  bluepeak  "), '"%bluepeak%"');
  assert.equal(buildLeadSearchPattern("50% deposit"), '"%50 deposit%"');
});

test("buildLeadSearchOrFilter targets the searchable lead columns", () => {
  assert.equal(
    buildLeadSearchOrFilter("aisha"),
    'name.ilike."%aisha%",company.ilike."%aisha%",email.ilike."%aisha%",owner.ilike."%aisha%",next_action.ilike."%aisha%"',
  );
});

test("buildLeadSearchOrFilter keeps a comma inside one quoted value", () => {
  assert.equal(
    buildLeadSearchOrFilter("PrimeNest, Lagos"),
    'name.ilike."%PrimeNest, Lagos%",company.ilike."%PrimeNest, Lagos%",email.ilike."%PrimeNest, Lagos%",owner.ilike."%PrimeNest, Lagos%",next_action.ilike."%PrimeNest, Lagos%"',
  );
});

test("isLeadStatus accepts only the six pipeline stages", () => {
  for (const status of ["new", "contacted", "qualified", "proposal", "won", "lost"]) {
    assert.equal(isLeadStatus(status), true, status);
  }
  assert.equal(isLeadStatus("archived"), false);
  assert.equal(isLeadStatus("NEW"), false);
  assert.equal(isLeadStatus(""), false);
});

test("shouldTouchLastContacted is true only when status is part of the update", () => {
  assert.equal(shouldTouchLastContacted({ status: "qualified" }), true);
  assert.equal(shouldTouchLastContacted({ name: "Aisha Okafor" }), false);
  assert.equal(shouldTouchLastContacted({ phone: "+234 803 000 1234" }), false);
  assert.equal(shouldTouchLastContacted({ value: 5000 }), false);
  assert.equal(shouldTouchLastContacted({ status: undefined }), false);
  // The route compares this against the stored status, so an unchanged stage is
  // filtered out there rather than here.
  assert.equal(shouldTouchLastContacted({ status: "new" }), true);
});
