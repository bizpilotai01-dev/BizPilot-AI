import test from "node:test";
import assert from "node:assert/strict";

import {
  collectNoteText,
  daysSince,
  detectSignals,
  parseModelJson,
  recommendNextAction,
  summarizeNotes,
  type InsightLead,
  type InsightNote,
} from "../lib/lead-insight.ts";

const NOW = new Date("2026-03-10T09:00:00.000Z");

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function lead(overrides: Partial<InsightLead> = {}): InsightLead {
  return {
    name: "Aisha Okafor",
    company: "PrimeNest Realty",
    status: "contacted",
    value: 4_500_000,
    lastContactAt: daysAgo(1),
    nextAction: null,
    ...overrides,
  };
}

test("daysSince measures elapsed whole days and rejects unusable values", () => {
  assert.equal(daysSince(daysAgo(0), NOW), 0);
  assert.equal(daysSince(daysAgo(9), NOW), 9);
  assert.equal(daysSince(null, NOW), null);
  assert.equal(daysSince("", NOW), null);
  assert.equal(daysSince("not-a-date", NOW), null);
});

test("collectNoteText keeps the newest notes, trims, and skips blanks", () => {
  const notes: InsightNote[] = [
    { content: "  newest  ", createdAt: daysAgo(0) },
    { content: "", createdAt: daysAgo(1) },
    { content: "older", createdAt: daysAgo(2) },
  ];
  assert.deepEqual(collectNoteText(notes), ["newest", "older"]);
});

test("collectNoteText caps how much history is used", () => {
  const notes = Array.from({ length: 30 }, (_, index) => ({
    content: `note ${index}`,
    createdAt: daysAgo(index),
  }));
  assert.equal(collectNoteText(notes).length, 12);
  assert.equal(collectNoteText(notes)[0], "note 0");
});

test("detectSignals recognises objections, commitments, sentiment, and declines", () => {
  const priced = detectSignals("Their budget is too tight, they need a discount before sign off.");
  assert.ok(priced.objections.includes("pricing pressure"));
  assert.ok(priced.objections.includes("decision making"));

  const promised = detectSignals("We agreed on a call next week and I will send the proposal.");
  assert.ok(promised.commitments.includes("a meeting was agreed"));
  assert.ok(promised.commitments.includes("a reply was promised"));

  assert.ok(detectSignals("They looked really happy and are ready to move.").positives.length);
  assert.ok(detectSignals("They said they are not interested and will pass.").negatives.length);
});

test("detectSignals stays empty on ordinary prose", () => {
  const signals = detectSignals("Left a voicemail and emailed the brochure.");
  assert.deepEqual(signals.objections, []);
  assert.deepEqual(signals.commitments, []);
  assert.deepEqual(signals.positives, []);
  assert.deepEqual(signals.negatives, []);
});

test("summarizeNotes prompts for a first note when history is empty", () => {
  assert.match(summarizeNotes([], lead()), /No notes recorded yet for PrimeNest Realty/);
  assert.match(summarizeNotes([], { ...lead(), company: "" }), /No notes recorded yet/);
});

test("summarizeNotes leads with the newest note and reports signal counts", () => {
  const notes: InsightNote[] = [
    { content: "Call went well. They want pricing before sign off.", createdAt: daysAgo(1) },
    { content: "Sent the brochure.", createdAt: daysAgo(9) },
  ];
  const summary = summarizeNotes(notes, lead());
  assert.match(summary, /^Latest: Call went well\./);
  assert.match(summary, /Blockers to resolve: pricing pressure/);
  assert.match(summary, /2 notes on record/);
});

test("summarizeNotes uses the singular for a single note", () => {
  const summary = summarizeNotes([{ content: "Intro call done.", createdAt: daysAgo(1) }], lead());
  assert.match(summary, /1 note on record/);
});

test("summarizeNotes truncates a long opening sentence", () => {
  const long = `${"x".repeat(400)}. Short tail.`;
  const summary = summarizeNotes([{ content: long, createdAt: daysAgo(1) }], lead());
  assert.match(summary, /\.\.\./);
  assert.ok(summary.length < 400);
});

test("an overdue open task outranks every other signal", () => {
  const result = recommendNextAction(
    lead({ status: "qualified", lastContactAt: daysAgo(30) }),
    {
      now: NOW,
      notes: [{ content: "Pricing is a blocker and they need sign off.", createdAt: daysAgo(2) }],
      tasks: [
        { title: "Send revised quote", dueDate: "2026-03-05", status: "pending" },
        { title: "Send contract", dueDate: "2026-04-01", status: "pending" },
      ],
    },
  );
  assert.match(result.action, /Complete the overdue task "Send revised quote"/);
  assert.equal(result.urgency, "overdue");
  assert.equal(result.source, "rule");
});

test("a completed overdue task no longer drives the recommendation", () => {
  const result = recommendNextAction(lead({ status: "qualified" }), {
    now: NOW,
    tasks: [{ title: "Send revised quote", dueDate: "2026-03-05", status: "done" }],
  });
  assert.doesNotMatch(result.action, /overdue task/);
});

test("an unresolved objection takes priority over the stage playbook", () => {
  const result = recommendNextAction(lead({ status: "qualified" }), {
    now: NOW,
    notes: [{ content: "Their budget is too small for this right now.", createdAt: daysAgo(3) }],
  });
  assert.match(result.action, /directly addresses pricing pressure/);
  assert.equal(result.urgency, "today");
});

test("an agreed meeting that was never booked is surfaced", () => {
  const result = recommendNextAction(lead({ status: "contacted" }), {
    now: NOW,
    notes: [{ content: "We agreed on a call next Tuesday.", createdAt: daysAgo(2) }],
  });
  assert.match(result.action, /Confirm the agreed call/);
});

test("a requested proposal gets chased as a decision, not a generic follow-up", () => {
  const result = recommendNextAction(lead({ status: "proposal" }), {
    now: NOW,
    notes: [{ content: "Please send the proposal and we will review it.", createdAt: daysAgo(2) }],
  });
  assert.match(result.action, /received the requested proposal/);
});

test("a lead with no recent contact is re-engaged with the idle-day count", () => {
  const result = recommendNextAction(lead({ lastContactAt: daysAgo(16) }), { now: NOW });
  assert.match(result.action, /Re-engage PrimeNest Realty, which has been quiet for 16 days/);
  assert.equal(result.urgency, "overdue");
});

test("seven idle days is urgent but not yet overdue", () => {
  const result = recommendNextAction(lead({ lastContactAt: daysAgo(7) }), { now: NOW });
  assert.equal(result.urgency, "today");
});

test("a lead that was never contacted falls back to the stage playbook", () => {
  const result = recommendNextAction(lead({ status: "new", lastContactAt: null }), { now: NOW });
  assert.match(result.action, /first-touch note/);
  assert.match(result.reason, /no contact has ever been logged/);
  assert.equal(result.urgency, "today");
});

test("a recorded next action is preferred once nothing is on fire", () => {
  const result = recommendNextAction(
    lead({ status: "qualified", nextAction: "  Send the ROI one-pager  " }),
    { now: NOW },
  );
  assert.equal(result.action, "Send the ROI one-pager");
  assert.equal(result.source, "rule");
});

test("a lost lead is asked for the loss reason rather than a sales follow-up", () => {
  const result = recommendNextAction(lead({ status: "lost", lastContactAt: daysAgo(20) }), {
    now: NOW,
    notes: [{ content: "They are going another route and declined.", createdAt: daysAgo(15) }],
  });
  assert.match(result.action, /Document why PrimeNest Realty was lost/);
  assert.equal(result.urgency, "soon");
});

test("closed leads are never told to re-engage after a long silence", () => {
  for (const status of ["won", "lost"] as const) {
    const result = recommendNextAction(lead({ status, lastContactAt: daysAgo(90), nextAction: null }), {
      now: NOW,
    });
    assert.doesNotMatch(result.action, /Re-engage/, status);
  }
});

test("a recently active healthy lead gets its stage playbook, not an alert", () => {
  const result = recommendNextAction(lead({ status: "qualified", lastContactAt: daysAgo(1) }), {
    now: NOW,
  });
  assert.match(result.action, /Book a short discovery or demo call/);
  assert.equal(result.urgency, "on_track");
});

test("the won stage points at onboarding rather than more selling", () => {
  const result = recommendNextAction(lead({ status: "won", lastContactAt: daysAgo(2) }), { now: NOW });
  assert.match(result.action, /Confirm kickoff details/);
});

test("parseModelJson reads the two fields it expects from a clean reply", () => {
  assert.deepEqual(parseModelJson('{"summary":"Budget is tight.","action":"Send a smaller package."}'), {
    summary: "Budget is tight.",
    action: "Send a smaller package.",
  });
});

test("parseModelJson tolerates code fences and surrounding prose", () => {
  assert.deepEqual(parseModelJson('```json\n{"summary":"Only a summary"}\n```'), { summary: "Only a summary", action: "" });
  assert.deepEqual(parseModelJson('Here you go: {"action":"Call them"} — hope that helps.'), {
    summary: "",
    action: "Call them",
  });
});

test("parseModelJson rejects replies with nothing usable in them", () => {
  assert.equal(parseModelJson(""), null);
  assert.equal(parseModelJson("I cannot help with that."), null);
  assert.equal(parseModelJson("{ not json"), null);
  assert.equal(parseModelJson('{"summary": 42}'), null);
  assert.equal(parseModelJson('["summary"]'), null);
  assert.equal(parseModelJson("null"), null);
});

test("parseModelJson ignores extra fields a model might add", () => {
  const parsed = parseModelJson('{"summary":"S","action":"A","confidence":0.9,"tags":["x"]}');
  assert.deepEqual(parsed, { summary: "S", action: "A" });
});

test("recommendations degrade safely when a lead is missing optional fields", () => {
  const result = recommendNextAction(
    { name: "", company: "", status: "new", value: null, lastContactAt: null },
    { now: NOW },
  );
  assert.ok(result.action.length > 0);
  assert.ok(result.reason.length > 0);
  assert.equal(result.source, "rule");
});