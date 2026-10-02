import { supabaseAdmin } from "@/lib/supabase";
import type { WorkspaceContext } from "@/lib/api-auth";

export async function recordActivity(
  workspace: WorkspaceContext,
  description: string,
  leadId?: string,
): Promise<string | null> {
  if (!supabaseAdmin) {
    return "The change was saved, but activity history is unavailable because Supabase is not configured.";
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", workspace.user.id)
    .eq("business_id", workspace.businessId)
    .maybeSingle();

  if (profileError) {
    console.error("BizPilot activity author lookup failed.", profileError.message);
    return "The change was saved, but its activity author could not be recorded.";
  }

  const { error } = await supabaseAdmin.from("activities").insert({
    id: crypto.randomUUID(),
    business_id: workspace.businessId,
    lead_id: leadId ?? null,
    actor_id: workspace.user.id,
    actor_name: profile?.full_name || workspace.user.email,
    description,
  });

  if (error) {
    console.error("BizPilot activity record insert failed.", error.message);
    return "The change was saved, but it could not be added to the activity feed.";
  }

  return null;
}
