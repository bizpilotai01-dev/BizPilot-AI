import { NextResponse } from "next/server";

import { requireWorkspace } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const [leadsResult, tasksResult] = await Promise.all([
    supabaseAdmin!.from("leads").select("status, value").eq("business_id", auth.context.businessId),
    supabaseAdmin!
      .from("tasks")
      .select("status, leads!inner(business_id)")
      .eq("leads.business_id", auth.context.businessId),
  ]);
  const activitiesResult = await supabaseAdmin!
    .from("activities")
    .select("id, actor_name, description, created_at")
    .eq("business_id", auth.context.businessId)
    .order("created_at", { ascending: false })
    .limit(5);

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
    recentActivities,
  });
}
