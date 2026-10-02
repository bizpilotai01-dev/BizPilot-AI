import { NextResponse } from "next/server";

import { requireWorkspace } from "@/lib/api-auth";
import { findInactiveLeads, parseThresholdDays } from "@/lib/inactive-leads";
import { supabaseAdmin } from "@/lib/supabase";
import type { LeadStatus } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const [leadsResult, tasksResult, businessResult] = await Promise.all([
    supabaseAdmin!
      .from("leads")
      .select("id, name, company, status, value, last_contacted_at, created_at")
      .eq("business_id", auth.context.businessId),
    supabaseAdmin!
      .from("tasks")
      .select("status, leads!inner(business_id)")
      .eq("leads.business_id", auth.context.businessId),
    supabaseAdmin!
      .from("businesses")
      .select("inactivity_threshold_days")
      .eq("id", auth.context.businessId)
      .maybeSingle(),
  ]);
  const activitiesResult = await supabaseAdmin!
    .from("activities")
    .select("id, actor_name, description, created_at")
    .eq("business_id", auth.context.businessId)
    .order("created_at", { ascending: false })
    .limit(5);

  // The alert window is a per-workspace preference. A missing or malformed value
  // must not break the dashboard, so it falls back to the default.
  const thresholdDays = parseThresholdDays(businessResult.data?.inactivity_threshold_days);

  if (leadsResult.error || tasksResult.error || activitiesResult.error) {
    return NextResponse.json({ error: "Dashboard data could not be loaded." }, { status: 500 });
  }

  const leads = leadsResult.data;
  const tasks = tasksResult.data;
  const totalLeads = leads.length;
  const newLeads = leads.filter((lead) => lead.status === "new").length;
  const qualifiedLeads = leads.filter((lead) => lead.status === "qualified").length;
  const wonLeads = leads.filter((lead) => lead.status === "won").length;
  const openLeads = leads.filter((lead) => lead.status !== "won" && lead.status !== "lost");
  const pipelineValue = openLeads.reduce((sum, lead) => sum + Number(lead.value || 0), 0);
  const followUpsDue = tasks.filter((task) => task.status === "pending").length;
  const lostLeads = leads.filter((lead) => lead.status === "lost").length;
  const closedLeads = wonLeads + lostLeads;
  const inactive = findInactiveLeads(
    (leadsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      company: row.company ?? "",
      status: (row.status ?? "new") as LeadStatus,
      value: row.value,
      lastContactAt: row.last_contacted_at,
      createdAt: row.created_at,
    })),
    { thresholdDays },
  ).slice(0, 8);
  const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const recentActivities = activitiesResult.data.map((activity) => {
    const minutes = Math.round((new Date(activity.created_at).getTime() - Date.now()) / 60_000);
    if (Math.abs(minutes) < 1) {
      return { id: activity.id, user: activity.actor_name, description: activity.description, time: "just now" };
    }
    if (Math.abs(minutes) < 60) {
      return {
        id: activity.id,
        user: activity.actor_name,
        description: activity.description,
        time: relativeTime.format(minutes, "minute"),
      };
    }
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) {
      return {
        id: activity.id,
        user: activity.actor_name,
        description: activity.description,
        time: relativeTime.format(hours, "hour"),
      };
    }
    return {
      id: activity.id,
      user: activity.actor_name,
      description: activity.description,
      time: relativeTime.format(Math.round(hours / 24), "day"),
    };
  });

  return NextResponse.json({
    totalLeads,
    newLeads,
    qualifiedLeads,
    wonLeads,
    pipelineValue,
    followUpsDue,
    conversionRate: closedLeads === 0 ? 0 : Math.round((wonLeads / closedLeads) * 100),
    inactiveThresholdDays: thresholdDays,
    inactiveLeads: inactive.length,
    inactive,
    recentActivities,
  });
}
