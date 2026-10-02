import test from "node:test";
import assert from "node:assert/strict";

import {
  CRITICAL_INACTIVITY_THRESHOLD_DAYS,
  DEFAULT_INACTIVITY_THRESHOLD_DAYS,
  findInactiveLeads,
  idleDaysFor,
  isOpenForAlerts,
  parseThresholdDays,
  severityFor,
  summarizeInactiveLeads,
  type InactivityLead,
} from "../lib/inactive-leads.ts";

const NOW = new Date("2026-03-10T09:00:00.000Z");

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function lead(overrides: Partial<InactivityLead> = {}): InactivityLead {
  return {
    id: "lead-1",
    name: "Aisha Okafor",
    company: "PrimeNest Realty",
    status: "contacted",
    value: 4_500_000,
    lastContactAt: daysAgo(2),
    createdAt: daysAgo(40),
    ...overrides,
  };
}

test("idleDaysFor prefers last contact and falls back to created date", () => {
  assert.equal(idleDaysFor({ lastContactAt: daysAgo(5), createdAt: daysAgo(60) }, NOW), 5);
  assert.equal(idleDaysFor({ lastContactAt: null, createdAt: daysAgo(12) }, NOW), 12);
  assert.equal(idleDaysFor({ lastContactAt: null, createdAt: null }, NOW), null);
  assert.equal(idleDaysFor({ lastContactAt: "broken", createdAt: null }, NOW), null);
});

test("only open stages are eligible for alerts", () => {
  assert.equal(isOpenForAlerts({ status: "new" }), true);
  assert.equal(isOpenForAlerts({ status: "qualified" }), true);
  assert.equal(isOpenForAlerts({ status: "proposal" }), true);
  assert.equal(isOpenForAlerts({ status: "won" }), false);
  assert.equal(isOpenForAlerts({ status: "lost" }), false);
});

test("a closed deal is never flagged no matter how long it has been idle", () => {
  const found = findInactiveLeads(
    [lead({ status: "won" }), lead({ id: "lead-2", status: "lost" })],
    { now: NOW },
  );
  assert.deepEqual(found, []);
});

test("a recently contacted lead is not flagged", () => {
  assert.deepEqual(findInactiveLeads([lead()], { now: NOW }), []);
});

test("a lead idle past the threshold is flagged with its real idle days", () => {
  const [found] = findInactiveLeads([lead({ lastContactAt: daysAgo(9) })], { now: NOW });
  assert.equal(found.idleDays, 9);
  assert.equal(found.severity, "warning");
  assert.match(found.reason, /no logged contact in 9 days while still contacted/);
});

test("twice the threshold escalates to critical", () => {
  const [found] = findInactiveLeads([lead({ lastContactAt: daysAgo(20) })], { now: NOW });
  assert.equal(found.severity, "critical");
});

test("the default threshold escalates at fourteen days", () => {
  assert.equal(CRITICAL_INACTIVITY_THRESHOLD_DAYS, 14);
  assert.equal(severityFor(13, DEFAULT_INACTIVITY_THRESHOLD_DAYS), "warning");
  assert.equal(severityFor(14, DEFAULT_INACTIVITY_THRESHOLD_DAYS), "critical");
});

test("a lead that was added but never contacted is flagged from its created date", () => {
  const [found] = findInactiveLeads(
    [lead({ lastContactAt: null, createdAt: daysAgo(11) })],
    { now: NOW },
  );
  assert.equal(found.neverContacted, true);
  assert.equal(found.idleDays, 11);
  assert.match(found.reason, /was added and never contacted/);
});

test("a lead with no usable timestamp is treated as fresh rather than infinitely stale", () => {
  const found = findInactiveLeads([lead({ lastContactAt: null, createdAt: null })], { now: NOW });
  assert.deepEqual(found, []);
});

test("results are ordered by idle days, then by value", () => {
  const found = findInactiveLeads(
    [
      lead({ id: "a", lastContactAt: daysAgo(10), value: 100 }),
      lead({ id: "b", lastContactAt: daysAgo(25), value: 100 }),
      lead({ id: "c", lastContactAt: daysAgo(25), value: 900 }),
    ],
    { now: NOW },
  );
  assert.deepEqual(found.map((item) => item.id), ["c", "b", "a"]);
});

test("a custom threshold is honoured", () => {
  const leads = [lead({ lastContactAt: daysAgo(5) })];
  assert.deepEqual(findInactiveLeads(leads, { now: NOW }), []);
  assert.equal(findInactiveLeads(leads, { now: NOW, thresholdDays: 3 }).length, 1);
});

test("a threshold below one is clamped so alerts stay meaningful", () => {
  const found = findInactiveLeads([lead({ lastContactAt: daysAgo(1) })], {
    now: NOW,
    thresholdDays: 0,
  });
  assert.equal(found.length, 1);
});

test("parseThresholdDays accepts numbers, numeric strings, and rejects nonsense", () => {
  assert.equal(parseThresholdDays(10), 10);
  assert.equal(parseThresholdDays("14"), 14);
  assert.equal(parseThresholdDays(14.4), 14);
  assert.equal(parseThresholdDays(null), DEFAULT_INACTIVITY_THRESHOLD_DAYS);
  assert.equal(parseThresholdDays(undefined), DEFAULT_INACTIVITY_THRESHOLD_DAYS);
  assert.equal(parseThresholdDays(""), DEFAULT_INACTIVITY_THRESHOLD_DAYS);
  assert.equal(parseThresholdDays("abc"), DEFAULT_INACTIVITY_THRESHOLD_DAYS);
  assert.equal(parseThresholdDays(0), 1);
  assert.equal(parseThresholdDays(500), 90);
  assert.equal(parseThresholdDays(-3), 1);
});

test("summarizeInactiveLeads confirms a healthy pipeline when nothing is stale", () => {
  assert.match(summarizeInactiveLeads([]), /No open leads have gone quiet/);
});

test("summarizeInactiveLeads names only the critical leads and totals the value", () => {
  const stale = findInactiveLeads(
    [
      lead({ id: "critical", company: "PrimeNest Realty", lastContactAt: daysAgo(20), value: 2_000_000 }),
      lead({ id: "warning", company: "Lago & Co", lastContactAt: daysAgo(9), value: 500_000 }),
    ],
    { now: NOW },
  );
  const summary = summarizeInactiveLeads(stale);
  assert.match(summary, /^1 open lead has gone quiet for two weeks or more:/);
  assert.match(summary, /PrimeNest Realty/);
  assert.doesNotMatch(summary, /Lago & Co/);
  assert.match(summary, /₦2,500,000 in open value/);
});

test("summarizeInactiveLeads uses the plural correctly", () => {
  const stale = findInactiveLeads(
    [
      lead({ id: "a", lastContactAt: daysAgo(9) }),
      lead({ id: "b", lastContactAt: daysAgo(10) }),
    ],
    { now: NOW },
  );
  assert.match(summarizeInactiveLeads(stale), /^2 open leads have gone quiet:/);
});

test("summarizeInactiveLeads skips the value line when nothing is staked", () => {
  const stale = findInactiveLeads([lead({ lastContactAt: daysAgo(9), value: 0 })], { now: NOW });
  assert.doesNotMatch(summarizeInactiveLeads(stale), /open value/);
});

test("a lead with no company still reads sensibly in the summary", () => {
  const stale = findInactiveLeads(
    [lead({ company: "", lastContactAt: daysAgo(20) })],
    { now: NOW },
  );
  assert.match(stale[0].reason, /Aisha Okafor/);
});