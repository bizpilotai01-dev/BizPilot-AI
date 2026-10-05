import type { InactiveLeadAlert, Task } from "@/lib/types";

export type NotificationKind = "task_due" | "task_overdue" | "inactive_lead";

export interface AppNotification {
  /** Stable across reloads so a dismissed item stays dismissed. */
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  leadId: string;
  /** Higher means more urgent, used for ordering and for the unread dot. */
  priority: number;
}

function todayInLagos(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function buildNotifications(
  tasks: Task[],
  inactive: InactiveLeadAlert[],
  now: Date = new Date(),
): AppNotification[] {
  const today = todayInLagos(now);
  const notifications: AppNotification[] = [];

  for (const task of tasks) {
    if (task.status !== "pending") continue;
    const overdue = task.dueDate < today;
    const dueToday = task.dueDate === today;
    if (!overdue && !dueToday) continue;

    notifications.push({
      id: `task:${task.id}:${task.dueDate}`,
      kind: overdue ? "task_overdue" : "task_due",
      title: overdue ? "Follow-up overdue" : "Follow-up due today",
      detail: task.title,
      leadId: task.leadId,
      // An overdue item outranks one due today, which outranks a quiet lead.
      priority: overdue ? 30 : 20,
    });
  }

  for (const alert of inactive) {
    notifications.push({
      id: `lead:${alert.id}:${alert.idleDays}`,
      kind: "inactive_lead",
      title: alert.severity === "critical" ? "Lead needs attention" : "Lead has gone quiet",
      detail: alert.reason,
      leadId: alert.id,
      priority: alert.severity === "critical" ? 15 : 10,
    });
  }

  return notifications.sort(
    (left, right) => right.priority - left.priority || left.title.localeCompare(right.title),
  );
}

export function unreadCount(
  notifications: AppNotification[],
  dismissed: ReadonlySet<string>,
) {
  return notifications.filter((notification) => !dismissed.has(notification.id)).length;
}

const STORAGE_KEY = "bizpilot.dismissed-notifications";

/**
 * Dismissed items are kept per browser rather than in the database so the
 * notification feed works without a schema change. The stored set is capped so
 * it cannot grow without bound.
 */
export function readDismissed(storage: Pick<Storage, "getItem">): Set<string> {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === "string").slice(-200));
  } catch {
    return new Set();
  }
}

export function writeDismissed(
  storage: Pick<Storage, "setItem">,
  dismissed: ReadonlySet<string>,
) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([...dismissed].slice(-200)));
  } catch {
    // A full or blocked storage must not break the dashboard.
  }
}

const EMPTY_DISMISSED: ReadonlySet<string> = new Set<string>();

let dismissedCache: ReadonlySet<string> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeToDismissed(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Server render has no storage, so nothing is considered dismissed. */
export function getDismissedServerSnapshot(): ReadonlySet<string> {
  return EMPTY_DISMISSED;
}

export function getDismissedSnapshot(): ReadonlySet<string> {
  if (dismissedCache) return dismissedCache;
  dismissedCache =
    typeof window === "undefined" ? EMPTY_DISMISSED : readDismissed(window.localStorage);
  return dismissedCache;
}

export function dismissNotification(id: string) {
  const next = new Set(dismissedCache ?? EMPTY_DISMISSED);
  next.add(id);
  dismissedCache = next;
  if (typeof window !== "undefined") writeDismissed(window.localStorage, next);
  emit();
}

export function restoreNotification(id: string) {
  const next = new Set(dismissedCache ?? EMPTY_DISMISSED);
  next.delete(id);
  dismissedCache = next;
  if (typeof window !== "undefined") writeDismissed(window.localStorage, next);
  emit();
}
