import test from "node:test";
import assert from "node:assert/strict";

import { startOfCurrentWeek } from "../lib/reporting-window.ts";

test("the week starts on Monday, not on a rolling seven days", () => {
  // Wednesday 2026-03-11.
  assert.equal(startOfCurrentWeek(new Date("2026-03-11T12:00:00Z")).toISOString(), "2026-03-08T23:00:00.000Z");
  // Monday itself stays on that Monday.
  assert.equal(startOfCurrentWeek(new Date("2026-03-09T12:00:00Z")).toISOString(), "2026-03-08T23:00:00.000Z");
  // Sunday belongs to the week that started the previous Monday.
  assert.equal(startOfCurrentWeek(new Date("2026-03-15T12:00:00Z")).toISOString(), "2026-03-08T23:00:00.000Z");
});

test("the boundary is Monday 00:00 in Africa/Lagos", () => {
  // 2026-03-09T00:30 Lagos is Monday, so the week starts the night before in UTC.
  assert.equal(startOfCurrentWeek(new Date("2026-03-08T23:30:00Z")).toISOString(), "2026-03-08T23:00:00.000Z");
  // 2026-03-08T23:30 Lagos is still Sunday, so the previous Monday applies.
  assert.equal(startOfCurrentWeek(new Date("2026-03-08T22:30:00Z")).toISOString(), "2026-03-01T23:00:00.000Z");
});

test("the week rolls over correctly across months and years", () => {
  assert.equal(startOfCurrentWeek(new Date("2026-04-01T12:00:00Z")).toISOString(), "2026-03-29T23:00:00.000Z");
  assert.equal(startOfCurrentWeek(new Date("2027-01-02T12:00:00Z")).toISOString(), "2026-12-27T23:00:00.000Z");
});

test("every day of a week resolves to the same start", () => {
  const starts = new Set();
  for (let day = 9; day <= 15; day += 1) {
    starts.add(startOfCurrentWeek(new Date(`2026-03-${String(day).padStart(2, "0")}T12:00:00Z`)).toISOString());
  }
  assert.equal(starts.size, 1);
});
