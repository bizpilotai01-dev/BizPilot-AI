import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNotifications,
  readDismissed,
  unreadCount,
  writeDismissed,
  type AppNotification,
} from "../lib/notifications.ts";
import type { InactiveLeadAlert, Task } from "../lib/types.ts";

const now = new Date("2026-03-11T12:00:00Z"); // Wednesday, Lagos.

function task(overrides: Partial<Task> = {}): Task {
  return { id: "t1", leadId: "l1", title: "Send the quote", dueDate: "2026-03-11", status: "pending", ...overrides };
}

function alert(overrides: Partial<InactiveLeadAlert> = {}): InactiveLeadAlert {
  return {
    id: "l9",
    name: "Aisha Okafor",
    company: "PrimeNest Realty",
    status: "qualified",
    idleDays: 30,
    neverContacted: false,
    value: 5000,
    severity: "critical",
    reason: "Aisha Okafor has had no contact in 30 days",
    ...overrides,
  };
}

test("overdue and due-today tasks become notifications, later ones do not", () => {
  const notifications = buildNotifications(
    [
      task({ id: "overdue", dueDate: "2026-03-09" }),
      task({ id: "today", dueDate: "2026-03-11" }),
      task({ id: "future", dueDate: "2026-03-20" }),
    ],
    [],
    now,
  );
  assert.deepEqual(
    notifications.map((n) => n.id),
    ["task:overdue:2026-03-09", "task:today:2026-03-11"],
  );
  assert.equal(notifications[0].kind, "task_overdue");
  assert.equal(notifications[1].kind, "task_due");
});

test("completed tasks never generate a notification", () => {
  assert.equal(buildNotifications([task({ status: "done" })], [], now).length, 0);
});

test("the due date is judged in the workspace timezone, not UTC", () => {
  // 2026-03-10T23:30Z is already 2026-03-11 in Lagos, so a task due that day
  // counts as due today rather than overdue.
  const lateEvening = new Date("2026-03-10T23:30:00Z");
  const [notification] = buildNotifications([task({ dueDate: "2026-03-11" })], [], lateEvening);
  assert.equal(notification.kind, "task_due");
});

test("inactive leads are included with their reason and severity", () => {
  const notifications = buildNotifications([], [alert(), alert({ id: "l8", severity: "warning", idleDays: 12 })], now);
  assert.equal(notifications.length, 2);
  assert.match(notifications[0].detail, /no contact in 30 days/);
  assert.equal(notifications[0].kind, "inactive_lead");
  assert.equal(notifications[0].leadId, "l9");
});

test("more urgent items are ordered first", () => {
  const notifications = buildNotifications(
    [task({ id: "today", dueDate: "2026-03-11" })],
    [alert({ severity: "critical" })],
    now,
  );
  const order = notifications.map((n) => n.kind);
  assert.deepEqual(order, ["task_due", "inactive_lead"]);
});

test("an empty workspace produces no notifications", () => {
  assert.deepEqual(buildNotifications([], [], now), []);
});

test("notification ids are stable so a dismissed item stays dismissed", () => {
  const first = buildNotifications([task()], [alert()], now);
  const second = buildNotifications([task()], [alert()], new Date("2026-03-11T18:00:00Z"));
  assert.deepEqual(first.map((n) => n.id), second.map((n) => n.id));
});

test("unreadCount ignores dismissed items", () => {
  const notifications: AppNotification[] = buildNotifications(
    [task({ id: "a" }), task({ id: "b", dueDate: "2026-03-12" })],
    [alert()],
    now,
  );
  assert.equal(notifications.length, 2);
  assert.equal(unreadCount(notifications, new Set()), 2);
  assert.equal(unreadCount(notifications, new Set([notifications[0].id])), 1);
  assert.equal(unreadCount(notifications, new Set(notifications.map((n) => n.id))), 0);
});

function fakeStorage(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set("bizpilot.dismissed-notifications", initial);
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    raw: store,
  };
}

test("dismissed ids round-trip through storage", () => {
  const storage = fakeStorage();
  assert.equal(readDismissed(storage).size, 0);
  writeDismissed(storage, new Set(["task:a:2026-03-11"]));
  assert.deepEqual([...readDismissed(storage)], ["task:a:2026-03-11"]);
});

test("unreadable or malformed storage degrades to nothing dismissed", () => {
  assert.equal(readDismissed(fakeStorage("not json")).size, 0);
  assert.equal(readDismissed(fakeStorage('{"a":1}')).size, 0);
  assert.equal(readDismissed(fakeStorage('["keep", 5, null]')).size, 1);
});

test("the stored set is capped so it cannot grow without bound", () => {
  const storage = fakeStorage();
  const many = new Set(Array.from({ length: 500 }, (_, i) => `id-${i}`));
  writeDismissed(storage, many);
  assert.equal(readDismissed(storage).size, 200);
});

test("storage failures do not throw", () => {
  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readDismissed(blocked).size, 0);
  writeDismissed(blocked, new Set(["x"]));
});
