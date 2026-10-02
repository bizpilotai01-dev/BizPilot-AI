export type InsightStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

export interface InsightLead {
  name: string;
  company: string;
  status: InsightStatus;
  value?: number | null;
  lastContactAt?: string | null;
  nextAction?: string | null;
}

export interface InsightNote {
  content: string;
  createdAt: string;
}

export interface InsightTask {
  title: string;
  dueDate?: string | null;
  status: string;
}

export interface NextBestAction {
  action: string;
  reason: string;
  urgency: "overdue" | "today" | "soon" | "on_track";
  source: "rule" | "model";
}

const DAY_MS = 86_400_000;

export interface ModelInsight {
  summary?: string;
  action?: string;
}

// Model replies are untrusted text. Strip code fences, isolate the outermost
// braces, and only accept two string fields so a rambling reply cannot break
// the panel or smuggle in other values.
export function parseModelJson(raw: string): ModelInsight | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const summary = typeof record.summary === "string" ? record.summary.trim() : "";
    const action = typeof record.action === "string" ? record.action.trim() : "";
    return summary || action ? { summary, action } : null;
  } catch {
    return null;
  }
}

// Signals pulled from note text. Ordered by how strongly they change what the
// next step should be, so a note mentioning pricing beats a generic sentiment word.
const OBJECTION_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "pricing pressure", pattern: /\b(price|pricing|cost|budget|expensive|discount|afford)\w*/i },
  { label: "timing concerns", pattern: /\b(timing|later|next quarter|not right now|next month|budget cycle)\b/i },
  { label: "decision making", pattern: /\b(partner|decision maker|board|stakeholder|sign off|sign-off|approve)\w*/i },
  { label: "competitor comparison", pattern: /\b(competitor|alternative|comparing|another (?:vendor|provider|supplier))\b/i },
  { label: "missing scope detail", pattern: /\b(not sure|unclear|need[s]? (?:more )?detail|question about|how does)\b/i },
];

const COMMITMENT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "a meeting was agreed", pattern: /\b(call|meeting|schedule[ds]?|demo|walk ?through)\b/i },
  { label: "a proposal was requested", pattern: /\b(send|share|forward)\b[^.]{0,40}\b(proposal|quote|deck|estimate)\b/i },
  { label: "a reply was promised", pattern: /\b(i(?:'| wi)?ll (?:get back|reply|respond|follow up|let you know)|will send)\b/i },
  { label: "pricing was shared", pattern: /\b(sent|shared|quoted)\b[^.]{0,30}\b(price|pricing|quote|proposal)\b/i },
];

const POSITIVE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "positive momentum", pattern: /\b(great|good|happy|excited|looks good|interested|impressed|ready)\b/i },
];

const NEGATIVE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "declined interest", pattern: /\b(not interested|no thanks|pass on|decline|not a priority|going another route)\b/i },
];

export function daysSince(value?: string | null, now: Date = new Date()) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return Math.floor((now.getTime() - timestamp) / DAY_MS);
}

// Latest-first note text, bounded so a long history cannot dominate the summary
// or blow past the model token budget.
export function collectNoteText(notes: InsightNote[], limit = 12) {
  return notes.slice(0, limit).map((note) => note.content.trim()).filter(Boolean);
}

export function detectSignals(text: string) {
  return {
    objections: OBJECTION_PATTERNS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.label),
    commitments: COMMITMENT_PATTERNS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.label),
    positives: POSITIVE_PATTERNS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.label),
    negatives: NEGATIVE_PATTERNS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.label),
  };
}

function sentence(text: string) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const [first] = trimmed.split(/(?<=[.!?])\s+/);
  return first.length > 220 ? `${first.slice(0, 217)}...` : first;
}

// Deterministic roll-up of the note history. Used when no model key is present
// and as the value shown when the model call fails, so the panel is never empty.
export function summarizeNotes(notes: InsightNote[], lead?: InsightLead | null) {
  if (!notes.length) {
    const company = lead?.company?.trim();
    return company
      ? `No notes recorded yet for ${company}. Log the first call outcome to start building context.`
      : "No notes recorded yet. Log the first call outcome to start building context.";
  }

  const text = collectNoteText(notes).join("\n");
  const signals = detectSignals(text);
  const parts: string[] = [];

  const latest = sentence(notes[0].content);
  if (latest) parts.push(`Latest: ${latest}`);

  if (signals.commitments.length) {
    parts.push(`Customer signals: ${signals.commitments.join(", ")}.`);
  }
  if (signals.objections.length) {
    parts.push(`Blockers to resolve: ${signals.objections.join(", ")}.`);
  }
  if (signals.negatives.length) {
    parts.push(`Risk: ${signals.negatives.join(", ")}.`);
  } else if (signals.positives.length) {
    parts.push(`Sentiment: ${signals.positives.join(", ")}.`);
  }

  const older = notes.slice(1, 3).map((note) => sentence(note.content)).filter(Boolean);
  if (older.length) parts.push(`Also noted: ${older.join(" / ")}`);

  parts.push(`${notes.length} note${notes.length === 1 ? "" : "s"} on record.`);
  return parts.join(" ");
}

function urgencyFromDays(days: number | null, overdueTask: boolean): NextBestAction["urgency"] {
  if (overdueTask) return "overdue";
  if (days === null) return "today";
  if (days >= 14) return "overdue";
  if (days >= 7) return "today";
  if (days >= 3) return "soon";
  return "on_track";
}

function currency(value?: number | null) {
  const amount = Number(value ?? 0);
  if (!amount) return "the opportunity";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

const STAGE_PLAYBOOK: Record<InsightStatus, { action: string; reason: string }> = {
  new: {
    action: "Send a short first-touch note to open the conversation",
    reason: "the lead has not been contacted yet, so nothing else can progress",
  },
  contacted: {
    action: "Send a follow-up that asks one qualifying question",
    reason: "first contact landed, so the next step is discovery rather than a pitch",
  },
  qualified: {
    action: "Book a short discovery or demo call and send the agenda",
    reason: "the lead is qualified and needs a concrete meeting to move forward",
  },
  proposal: {
    action: "Follow up on the proposal and clear the last open question",
    reason: "a proposal is out and is waiting on a decision",
  },
  won: {
    action: "Confirm kickoff details and the first delivery milestone",
    reason: "the deal is closed, so onboarding protects the value that was sold",
  },
  lost: {
    action: "Log the loss reason and set a re-engagement reminder",
    reason: "the lead is closed out, so capture the learning before moving on",
  },
};

// Signals override the generic stage playbook. Order matters: an explicit
// objection or a slipped follow-up outranks whatever the stage would normally say.
export function recommendNextAction(
  lead: InsightLead,
  context: { notes?: InsightNote[]; tasks?: InsightTask[]; now?: Date } = {},
): NextBestAction {
  const now = context.now ?? new Date();
  const notes = context.notes ?? [];
  const tasks = context.tasks ?? [];
  const openTasks = tasks.filter((task) => task.status !== "done");
  const notesText = collectNoteText(notes).join("\n");
  const signals = detectSignals(notesText);
  const idleDays = daysSince(lead.lastContactAt, now);

  const overdueTask = openTasks.find((task) => {
    if (!task.dueDate) return false;
    const due = Date.parse(task.dueDate);
    return !Number.isNaN(due) && due < now.getTime();
  });

  const stage = STAGE_PLAYBOOK[lead.status] ?? STAGE_PLAYBOOK.contacted;
  const company = lead.company?.trim() || lead.name?.trim() || "this lead";

  if (overdueTask) {
    return {
      action: `Complete the overdue task "${overdueTask.title}"`,
      reason: `it was due ${overdueTask.dueDate} and ${company} is still waiting`,
      urgency: "overdue",
      source: "rule",
    };
  }

  if (lead.status === "lost" && signals.negatives.length) {
    return {
      action: `Document why ${company} was lost and set a re-engagement date`,
      reason: `the notes record ${signals.negatives.join(" and ")}, which is worth keeping`,
      urgency: "soon",
      source: "rule",
    };
  }

  if (signals.objections.length) {
    return {
      action: `Send a note that directly addresses ${signals.objections.join(" and ")} for ${company}`,
      reason: "an unresolved blocker in the notes is holding the deal back",
      urgency: "today",
      source: "rule",
    };
  }

  if (signals.commitments.includes("a meeting was agreed") && lead.status !== "proposal") {
    return {
      action: `Confirm the agreed call with ${company} and send the agenda`,
      reason: "the notes record a meeting commitment that has not been converted into a booking",
      urgency: "today",
      source: "rule",
    };
  }

  if (lead.status === "proposal" && signals.commitments.includes("a proposal was requested")) {
    return {
      action: `Confirm ${company} received the requested proposal and ask for a decision date`,
      reason: "the proposal was promised in the notes and the decision is still open",
      urgency: "today",
      source: "rule",
    };
  }

  if (idleDays !== null && idleDays >= 7 && lead.status !== "won" && lead.status !== "lost") {
    return {
      action: `Re-engage ${company}, which has been quiet for ${idleDays} days`,
      reason: `no contact logged since the last update and ${currency(lead.value)} is still open`,
      urgency: idleDays >= 14 ? "overdue" : "today",
      source: "rule",
    };
  }

  if (!lead.lastContactAt && lead.status !== "won" && lead.status !== "lost") {
    return {
      action: stage.action,
      reason: `${stage.reason}, and no contact has ever been logged`,
      urgency: "today",
      source: "rule",
    };
  }

  if (lead.nextAction?.trim()) {
    return {
      action: lead.nextAction.trim(),
      reason: `this is the next action already recorded for ${company}`,
      urgency: urgencyFromDays(idleDays, false),
      source: "rule",
    };
  }

  return {
    action: stage.action,
    reason: stage.reason,
    urgency: urgencyFromDays(idleDays, false),
    source: "rule",
  };
}