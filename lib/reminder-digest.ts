import type { InactiveLead } from "@/lib/inactive-leads";

export type ReminderTask = {
  id: string;
  title: string;
  due_date: string;
  leads:
    | { id: string; name: string; company: string; business_id: string }
    | Array<{ id: string; name: string; company: string; business_id: string }>;
};

export function getTodayInLagos(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function getTomorrow(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function getLead(task: ReminderTask) {
  return Array.isArray(task.leads) ? task.leads[0] : task.leads;
}

function formatTaskList(tasks: ReminderTask[], today: string) {
  return tasks.map((task) => {
    const lead = getLead(task);
    const timing =
      task.due_date < today
        ? `Overdue since ${task.due_date}`
        : task.due_date === today
          ? "Due today"
          : "Due tomorrow";
    return `• ${task.title} — ${lead.name} (${lead.company}), ${timing}`;
  }).join("\n");
}

// WhatsApp template bodies are length-capped, so the quiet-lead list is trimmed
// to the most severe entries.
export function formatInactiveList(alerts: InactiveLead[], limit = 5) {
  return alerts.slice(0, limit).map((alert) => `• ${alert.reason}`).join("\n");
}

export function buildDigest(tasks: ReminderTask[], alerts: InactiveLead[], today: string) {
  const blocks: string[] = [];

  if (tasks.length) {
    blocks.push(
      `Here are your open follow-ups due tomorrow or overdue:\n\n${formatTaskList(tasks, today)}`,
    );
  }
  if (alerts.length) {
    const subject = alerts.length === 1 ? "lead has" : "leads have";
    blocks.push(
      `${alerts.length} open ${subject} gone quiet inside your alert window:\n\n${formatInactiveList(alerts)}`,
    );
  }
  blocks.push("Review your leads and tasks in BizPilot.");

  return blocks.join("\n\n");
}

/**
 * A recipient is only worth emailing or messaging when there is something to
 * tell them. Returns true when the digest would contain real content.
 */
export function hasDigestContent(tasks: ReminderTask[], alerts: InactiveLead[]) {
  return tasks.length > 0 || alerts.length > 0;
}
