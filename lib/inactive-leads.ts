export type InactivityStatus = "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";

export interface InactivityLead {
  id: string;
  name: string;
  company: string;
  status: InactivityStatus;
  value?: number | null;
  lastContactAt?: string | null;
  createdAt?: string | null;
}

export type InactivitySeverity = "critical" | "warning";

export interface InactiveLead {
  id: string;
  name: string;
  company: string;
  status: InactivityStatus;
  idleDays: number;
  neverContacted: boolean;
  value: number;
  severity: InactivitySeverity;
  reason: string;
}

export const DEFAULT_INACTIVITY_THRESHOLD_DAYS = 7;
export const CRITICAL_INACTIVITY_THRESHOLD_DAYS = 14;

const OPEN_STATUSES: InactivityStatus[] = ["new", "contacted", "qualified", "proposal"];

// Closed deals are excluded on purpose. A won or lost lead sitting untouched for
// months is normal; flagging it would bury the real alerts in noise.
export function isOpenForAlerts(lead: Pick<InactivityLead, "status">) {
  return OPEN_STATUSES.includes(lead.status);
}

export function idleDaysFor(
  lead: Pick<InactivityLead, "lastContactAt" | "createdAt">,
  now: Date = new Date(),
) {
  const reference = lead.lastContactAt || lead.createdAt;
  if (!reference) return null;
  const timestamp = Date.parse(reference);
  if (Number.isNaN(timestamp)) return null;
  return Math.floor((now.getTime() - timestamp) / 86_400_000);
}

export function severityFor(days: number, threshold: number) {
  return days >= threshold * 2 ? "critical" : "warning";
}

function describe(lead: Pick<InactiveLead, "name" | "company" | "status">, idleDays: number, neverContacted: boolean) {
  const subject = lead.company?.trim() || lead.name?.trim() || "this lead";
  if (neverContacted) return `${subject} was added and never contacted.`;
  return `${subject} has had no logged contact in ${idleDays} ${idleDays === 1 ? "day" : "days"} while still ${lead.status}.`;
}

export function findInactiveLeads(
  leads: InactivityLead[],
  options: { thresholdDays?: number; now?: Date } = {},
) {
  const threshold = Math.max(1, Math.floor(options.thresholdDays ?? DEFAULT_INACTIVITY_THRESHOLD_DAYS));
  const now = options.now ?? new Date();

  return leads
    .filter(isOpenForAlerts)
    .map((lead) => {
      const neverContacted = !lead.lastContactAt;
      const idleDays = idleDaysFor(lead, now);

      // A lead with no usable timestamp is treated as fresh rather than as
      // infinitely stale, so bad data cannot flood the alert list.
      if (idleDays === null || idleDays < threshold) return null;

      return {
        id: lead.id,
        name: lead.name,
        company: lead.company,
        status: lead.status,
        idleDays,
        neverContacted,
        value: Number(lead.value ?? 0),
        severity: severityFor(idleDays, threshold),
        reason: describe(lead, idleDays, neverContacted),
      } satisfies InactiveLead;
    })
    .filter((lead): lead is InactiveLead => lead !== null)
    .sort((left, right) => right.idleDays - left.idleDays || right.value - left.value);
}

export function summarizeInactiveLeads(leads: InactiveLead[]) {
  if (!leads.length) {
    return "No open leads have gone quiet. Every open opportunity has had contact within the alert window.";
  }

  const critical = leads.filter((lead) => lead.severity === "critical");
  const value = leads.reduce((sum, lead) => sum + lead.value, 0);
  const lines = [
    critical.length
      ? `${critical.length} open ${critical.length === 1 ? "lead has" : "leads have"} gone quiet for two weeks or more:`
      : `${leads.length} open ${leads.length === 1 ? "lead has" : "leads have"} gone quiet:`,
    ...critical.map((lead) => `• ${lead.reason}`),
  ];

  if (value > 0) {
    const formatted = new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(value);
    lines.push(`${formatted} in open value is sitting on these leads.`);
  }

  lines.push("Open each lead in BizPilot for a recommended next step.");
  return lines.join("\n");
}

export function parseThresholdDays(value: unknown, fallback = DEFAULT_INACTIVITY_THRESHOLD_DAYS) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 1), 90);
}
