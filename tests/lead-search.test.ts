import test from "node:test";
import assert from "node:assert/strict";

import { buildLeadSearchOrFilter, escapeLikePattern, isLeadStatus, quotePostgrestValue, shouldTouchLastContacted } from "../lib/lead-search.ts";

test("escapeLikePattern neutralises LIKE wildcards so a search cannot match everything", () => {
  assert.equal(escapeLikePattern("%"), "\\%");
  assert.equal(escapeLikePattern("_"), "\\_");
  assert.equal(escapeLikePattern("a%b_c"), "a\\%b\\_c");
  assert.equal(escapeLikePattern("\\"), "\\\\");
});

test("escapeLikePattern leaves ordinary search text untouched", () => {
  assert.equal(escapeLikePattern("PrimeNest Realty"), "PrimeNest Realty");
  assert.equal(escapeLikePattern("aisha@primenest.com"), "aisha@primenest.com");
  assert.equal(escapeLikePattern(""), "");
});

test("escapeLikePattern preserves characters that are meaningful to users but not to LIKE", () => {
  assert.equal(escapeLikePattern("O'Brien & Sons"), "O'Brien & Sons");
  assert.equal(escapeLikePattern("50% deposit"), "50\\% deposit");
});

test("quotePostgrestValue protects commas that would otherwise split the or() filter", () => {
  assert.equal(quotePostgrestValue("%aisha%"), '"%aisha%"');
  assert.equal(quotePostgrestValue("PrimeNest, Lagos"), '"PrimeNest, Lagos"');
  assert.equal(quotePostgrestValue('say "hi"'), '"say \\"hi\\""');
});

test("buildLeadSearchOrFilter targets the searchable lead columns and escapes wildcards", () => {
  assert.equal(
    buildLeadSearchOrFilter("aisha"),
    'name.ilike."%aisha%",company.ilike."%aisha%",email.ilike."%aisha%",owner.ilike."%aisha%",next_action.ilike."%aisha%"',
  );
  assert.equal(
    buildLeadSearchOrFilter("PrimeNest, Lagos"),
    'name.ilike."%PrimeNest, Lagos%",company.ilike."%PrimeNest, Lagos%",email.ilike."%PrimeNest, Lagos%",owner.ilike."%PrimeNest, Lagos%",next_action.ilike."%PrimeNest, Lagos%"',
  );
  assert.match(buildLeadSearchOrFilter("50% deposit"), /%50\\% deposit%/);
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
});