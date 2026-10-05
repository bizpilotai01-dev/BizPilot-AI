import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDigest,
  formatInactiveList,
  getLead,
  getTodayInLagos,
  getTomorrow,
  hasDigestContent,
  type ReminderTask,
} from "../lib/reminder-digest.ts";

import type { InactiveLead } from "../lib/inactive-leads.ts";

const lead = { id: "l1", name: "Aisha Okafor", company: "PrimeNest Realty", business_id: "b1" };
const otherLead = { id: "l2", name: "Tunde Bello", company: "BluePeak Consulting", business_id: "b2" };

function inactiveAlert(overrides: Partial<InactiveLead> = {}): InactiveLead {
  return {
    id: "l1",
    name: "Aisha",
    company: "PrimeNest",
    status: "qualified",
    idleDays: 30,
    neverContacted: false,
    value: 5000,
    severity: "critical",
    reason: "Aisha has had no contact in 30 days",
    ...overrides,
  };
}

function task(overrides: Partial<ReminderTask> = {}): ReminderTask {
  return { id: "t1", title: "Send the quote", due_date: "2026-03-10", leads: lead, ...overrides };
}

test("getTomorrow advances one day", () => {
  assert.equal(getTomorrow("2026-03-10"), "2026-03-11");
  assert.equal(getTomorrow("2026-12-31"), "2027-01-01");
  assert.equal(getTomorrow("2024-02-28"), "2024-02-29");
});

test("getTodayInLagos returns a calendar date in the workspace timezone", () => {
  const today = getTodayInLagos(new Date("2026-03-10T23:30:00Z"));
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  // 23:30 UTC is already the next day in Lagos (UTC+1).
  assert.equal(today, "2026-03-11");
});

test("getLead accepts both the object and array join shapes", () => {
  assert.equal(getLead(task())?.id, "l1");
  assert.equal(getLead(task({ leads: [lead] }))?.id, "l1");
});

test("the digest labels an overdue task with its original date", () => {
  const digest = buildDigest([task({ due_date: "2026-03-08" })], [], "2026-03-10");
  assert.match(digest, /Overdue since 2026-03-08/);
  assert.match(digest, /Send the quote — Aisha Okafor \(PrimeNest Realty\)/);
});

test("the digest distinguishes a task due today from one due tomorrow", () => {
  assert.match(buildDigest([task({ due_date: "2026-03-10" })], [], "2026-03-10"), /Due today/);
  assert.match(buildDigest([task({ due_date: "2026-03-11" })], [], "2026-03-10"), /Due tomorrow/);
  assert.doesNotMatch(buildDigest([task({ due_date: "2026-03-11" })], [], "2026-03-10"), /Overdue/);
});

test("the digest includes the inactive-lead block with correct singular wording", () => {
  const one = [inactiveAlert()];
  const two = [one[0], inactiveAlert({ id: "l2", name: "Tunde", company: "BluePeak", idleDays: 20, reason: "Tunde has had no contact in 20 days" })];
  assert.match(buildDigest([], one, "2026-03-10"), /1 open lead has gone quiet/);
  assert.match(buildDigest([], two, "2026-03-10"), /2 open leads have gone quiet/);
});

test("the digest carries both blocks when there are tasks and alerts", () => {
  const digest = buildDigest(
    [task()],
    [inactiveAlert()],
    "2026-03-10",
  );
  assert.match(digest, /Here are your open follow-ups/);
  assert.match(digest, /gone quiet inside your alert window/);
  assert.match(digest, /Review your leads and tasks in BizPilot\./);
});

test("the digest always ends with the call to action", () => {
  assert.match(buildDigest([], [], "2026-03-10"), /^Review your leads and tasks in BizPilot\.$/);
});

test("the inactive list is capped because WhatsApp bodies are length-limited", () => {
  const alerts = Array.from({ length: 9 }, (_, index) =>
    inactiveAlert({ id: `l${index}`, name: `Lead ${index}`, idleDays: 30 - index, reason: `Lead ${index} went quiet` }),
  );
  const formatted = formatInactiveList(alerts);
  assert.equal(formatted.split("\n").length, 5);
  assert.match(formatted, /Lead 0 went quiet/);
  assert.doesNotMatch(formatted, /Lead 5 went quiet/);
});

test("hasDigestContent decides whether a recipient is worth contacting", () => {
  assert.equal(hasDigestContent([], []), false);
  assert.equal(hasDigestContent([task()], []), true);
  assert.equal(hasDigestContent([], [inactiveAlert()]), true);
});

test("digest content and workspace scoping agree", () => {
  const ownerTasks = [task({ leads: { ...lead, business_id: "b1" } })];
  const strangerTasks = [task({ leads: { ...otherLead, business_id: "b2" } })];
  assert.equal(hasDigestContent(ownerTasks, []), true);
  assert.equal(hasDigestContent(strangerTasks, []), true);
  // Filtering by workspace happens before this check, so one workspace's tasks
  // never appear in another workspace's digest.
  const scoped = ownerTasks.filter((item) => getLead(item)?.business_id === "b2");
  assert.equal(hasDigestContent(scoped, []), false);
});
