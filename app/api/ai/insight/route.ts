import { NextResponse } from "next/server";

import { requireWorkspace } from "@/lib/api-auth";
import {
  collectNoteText,
  parseModelJson,
  recommendNextAction,
  summarizeNotes,
  type InsightNote,
  type InsightTask,
} from "@/lib/lead-insight";
import { supabaseAdmin } from "@/lib/supabase";
import type { LeadStatus } from "@/lib/types";

const MODEL_SYSTEM_PROMPT =
  "You are a sales operations assistant for a small business CRM. Using only the supplied notes and lead record, " +
  "reply with strict JSON containing two fields: \"summary\", a plain-language roll-up of what the notes say in at " +
  "most three short sentences, and \"action\", one specific, concrete next step for the owner to take today. " +
  "Never invent facts that are not in the notes. No markdown, no preamble.";

async function refineWithModel(input: {
  leadName: string;
  company: string;
  status: string;
  value: number | null;
  ruleAction: string;
  notes: InsightNote[];
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const noteText = collectNoteText(input.notes).join("\n---\n");
  if (!noteText) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: MODEL_SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Lead: ${input.leadName} at ${input.company}\nStage: ${input.status}\n` +
              `Value: ${Number(input.value ?? 0)}\nCurrent rule-based next step: ${input.ruleAction}\n\nNotes:\n${noteText}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;

    return parseModelJson(content);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  let body: { leadId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
  if (!leadId) {
    return NextResponse.json({ error: "A leadId is required." }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabaseAdmin!
    .from("leads")
    .select("id, name, company, status, value, last_contacted_at, next_action")
    .eq("id", leadId)
    .eq("business_id", auth.context.businessId)
    .maybeSingle();

  if (leadError) {
    return NextResponse.json({ error: "Lead could not be verified." }, { status: 500 });
  }
  if (!lead) {
    return NextResponse.json({ error: "Lead not found in this workspace." }, { status: 404 });
  }

  const [notesResult, tasksResult] = await Promise.all([
    supabaseAdmin!
      .from("notes")
      .select("content, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(25),
    supabaseAdmin!
      .from("tasks")
      .select("title, due_date, status")
      .eq("lead_id", leadId)
      .order("due_date", { ascending: true }),
  ]);

  if (notesResult.error || tasksResult.error) {
    return NextResponse.json({ error: "Lead history could not be loaded." }, { status: 500 });
  }

  const notes: InsightNote[] = (notesResult.data ?? []).map((note) => ({
    content: note.content,
    createdAt: note.created_at,
  }));
  const tasks: InsightTask[] = (tasksResult.data ?? []).map((task) => ({
    title: task.title,
    dueDate: task.due_date,
    status: task.status ?? "pending",
  }));

  const insightLead = {
    name: lead.name,
    company: lead.company ?? "",
    status: (lead.status ?? "new") as LeadStatus,
    value: lead.value,
    lastContactAt: lead.last_contacted_at,
    nextAction: lead.next_action,
  };

  // The rule-based result is always computed first. The model is a refinement
  // layer only, so a missing key, a timeout, or malformed JSON all degrade to
  // a usable answer instead of an error.
  const ruleAction = recommendNextAction(insightLead, { notes, tasks });
  const ruleSummary = summarizeNotes(notes, insightLead);
  const model = await refineWithModel({
    leadName: lead.name,
    company: insightLead.company,
    status: insightLead.status,
    value: lead.value,
    ruleAction: ruleAction.action,
    notes,
  });

  return NextResponse.json({
    summary: model?.summary || ruleSummary,
    action: model?.action
      ? { ...ruleAction, action: model.action, source: "model" as const }
      : ruleAction,
    noteCount: notes.length,
    openTaskCount: tasks.filter((task) => task.status !== "done").length,
  });
}