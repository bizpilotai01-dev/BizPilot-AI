import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { requireWorkspace } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import type { TaskStatus } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  const allowedStatuses: TaskStatus[] = ["pending", "done"];
  if (typeof body.status !== "string" || !allowedStatuses.includes(body.status as TaskStatus)) {
    return NextResponse.json({ error: "Status must be pending or done." }, { status: 400 });
  }

  const { data: workspaceLeads, error: leadError } = await supabaseAdmin!
    .from("leads")
    .select("id")
    .eq("business_id", auth.context.businessId);

  if (leadError) {
    return NextResponse.json({ error: "Workspace leads could not be checked." }, { status: 500 });
  }

  const leadIds = workspaceLeads.map((lead) => lead.id);
  if (!leadIds.length) {
    return NextResponse.json({ error: "Task not found in this workspace." }, { status: 404 });
  }

  const { data: task, error } = await supabaseAdmin!
    .from("tasks")
    .update({ status: body.status })
    .eq("id", id)
    .in("lead_id", leadIds)
    .select("id, lead_id, title, due_date, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Task status could not be updated." }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ error: "Task not found in this workspace." }, { status: 404 });
  }

  const activityWarning = await recordActivity(
    auth.context,
    body.status === "done" ? `Completed follow-up task: ${task.title}.` : `Reopened follow-up task: ${task.title}.`,
    task.lead_id,
  );

  return NextResponse.json({
    item: {
      id: task.id,
      leadId: task.lead_id,
      title: task.title,
      dueDate: task.due_date,
      status: task.status,
    },
    ...(activityWarning ? { warning: activityWarning } : {}),
  });
}
