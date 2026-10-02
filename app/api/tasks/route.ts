import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { requireWorkspace } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin!
    .from("tasks")
    .select("id, lead_id, title, due_date, status, created_at, leads!inner(business_id)")
    .eq("leads.business_id", auth.context.businessId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Tasks could not be loaded." }, { status: 500 });
  }

  return NextResponse.json({
    items: (data ?? []).map((task) => ({
      id: task.id,
      leadId: task.lead_id,
      title: task.title,
      dueDate: task.due_date,
      status: task.status,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();

  if (!body.leadId || !body.title || !body.dueDate) {
    return NextResponse.json(
      { error: "leadId, title, and dueDate are required" },
      { status: 400 },
    );
  }

  const { data: lead, error: leadError } = await supabaseAdmin!
    .from("leads")
    .select("id")
    .eq("id", body.leadId)
    .eq("business_id", auth.context.businessId)
    .maybeSingle();

  if (leadError) {
    return NextResponse.json({ error: "The selected lead could not be verified." }, { status: 500 });
  }
  if (!lead) {
    return NextResponse.json({ error: "Lead not found in this workspace." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin!
    .from("tasks")
    .insert({
      id: crypto.randomUUID(),
      lead_id: body.leadId,
      title: String(body.title).trim(),
      due_date: body.dueDate,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const activityWarning = await recordActivity(auth.context, `Scheduled follow-up task: ${data.title}.`, body.leadId);

  return NextResponse.json({
    item: {
      id: data.id,
      leadId: data.lead_id,
      title: data.title,
      dueDate: data.due_date,
      status: data.status,
    },
    ...(activityWarning ? { warning: activityWarning } : {}),
  }, { status: 201 });
}
