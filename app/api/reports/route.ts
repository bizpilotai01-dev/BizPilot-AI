import { NextResponse } from "next/server";

import { requireWorkspace } from "@/lib/api-auth";
import { startOfCurrentWeek } from "@/lib/reporting-window";
import { supabaseAdmin } from "@/lib/supabase";

const statuses = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;

export async function GET(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const range = new URL(request.url).searchParams.get("range") ?? "all";
  if (!["30", "90", "all"].includes(range)) {
    return NextResponse.json({ error: "Range must be 30, 90, or all." }, { status: 400 });
  }

  const startDate =
    range === "all"
      ? null
      : new Date(Date.now() - Number(range) * 86_400_000).toISOString();
  let leadsQuery = supabaseAdmin!
    .from("leads")
    .select("id, status, value, created_at")
    .eq("business_id", auth.context.businessId);
  if (startDate) leadsQuery = leadsQuery.gte("created_at", startDate);

  const [{ data: leads, error: leadsError }, { data: tasks, error: tasksError }] = await Promise.all([
    leadsQuery,
    supabaseAdmin!
      .from("tasks")
      .select("status, leads!inner(business_id, created_at)")
      .eq("leads.business_id", auth.context.businessId),
  ]);

  if (leadsError || tasksError) {
    return NextResponse.json({ error: "Sales reports could not be loaded." }, { status: 500 });
  }

  const rows = leads ?? [];
  // Computed against the unfiltered workspace, so "this week" always means the
  // current week regardless of which reporting range is selected.
  const { data: recentLeads, error: recentLeadsError } = await supabaseAdmin!
    .from("leads")
    .select("id")
    .eq("business_id", auth.context.businessId)
    .gte("created_at", startOfCurrentWeek().toISOString());

  if (recentLeadsError) {
    return NextResponse.json({ error: "Sales reports could not be loaded." }, { status: 500 });
  }
  const newLeadsThisWeek = (recentLeads ?? []).length;
  const taskRows = (tasks ?? []).filter((task) => {
    if (!startDate) return true;
    const lead = Array.isArray(task.leads) ? task.leads[0] : task.leads;
    return lead && new Date(lead.created_at).getTime() >= new Date(startDate).getTime();
  });
  const byStatus = statuses.map((status) => {
    const stageLeads = rows.filter((lead) => lead.status === status);
    return {
      status,
      count: stageLeads.length,
      value: stageLeads.reduce((sum, lead) => sum + Number(lead.value ?? 0), 0),
    };
  });
  const openLeads = rows.filter((lead) => lead.status !== "won" && lead.status !== "lost");
  const wonCount = rows.filter((lead) => lead.status === "won").length;
  const lostCount = rows.filter((lead) => lead.status === "lost").length;
  const closedCount = wonCount + lostCount;

  return NextResponse.json({
    range,
    summary: {
      totalLeads: rows.length,
      newLeadsThisWeek,
      openPipelineValue: openLeads.reduce((sum, lead) => sum + Number(lead.value ?? 0), 0),
      wonValue: rows.filter((lead) => lead.status === "won").reduce((sum, lead) => sum + Number(lead.value ?? 0), 0),
      wonCount,
      conversionRate: closedCount ? Math.round((wonCount / closedCount) * 100) : 0,
      openTasks: taskRows.filter((task) => task.status === "pending").length,
      completedTasks: taskRows.filter((task) => task.status === "done").length,
    },
    stages: byStatus,
  });
}
