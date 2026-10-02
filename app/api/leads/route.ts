import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { requireWorkspace } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { buildLeadSearchOrFilter, isLeadStatus } from "@/lib/lead-search";
import type { LeadStatus } from "@/lib/types";

const allowedStatuses: LeadStatus[] = ["new", "contacted", "qualified", "proposal", "won", "lost"];

export async function GET(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  const statusParam = (params.get("status") ?? "").trim();

  if (statusParam && !isLeadStatus(statusParam)) {
    return NextResponse.json(
      { error: `Status must be one of: ${allowedStatuses.join(", ")}` },
      { status: 400 },
    );
  }

  let queryBuilder = supabaseAdmin!
    .from("leads")
    .select("*")
    .eq("business_id", auth.context.businessId)
    .order("created_at", { ascending: false });

  if (statusParam) {
    queryBuilder = queryBuilder.eq("status", statusParam);
  }

  if (query) {
    queryBuilder = queryBuilder.or(buildLeadSearchOrFilter(query));
  }

  const { data, error } = await queryBuilder;

  if (error) {
    return NextResponse.json({ error: "Leads could not be loaded." }, { status: 500 });
  }

  const leads = await Promise.all(
    (data ?? []).map(async (lead) => {
      let photoUrl: string | null = null;
      if (lead.photo_path) {
        const { data: photo, error: photoError } = await supabaseAdmin!.storage
          .from("lead-photos")
          .createSignedUrl(lead.photo_path, 60 * 60);
        if (photoError) {
          return { error: true as const };
        }
        photoUrl = photo.signedUrl;
      }

      return {
        id: lead.id,
        name: lead.name,
        company: lead.company ?? "",
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        status: lead.status,
        value: Number(lead.value ?? 0),
        owner: lead.owner ?? "",
        nextAction: lead.next_action ?? "",
        lastContactAt: lead.last_contacted_at ?? "",
        tags: lead.tags ?? [],
        photoUrl,
      };
    }),
  );

  if (leads.some((lead) => "error" in lead)) {
    return NextResponse.json({ error: "Lead photos could not be loaded." }, { status: 500 });
  }

  return NextResponse.json({ items: leads });
}

export async function POST(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();

  if (!body.name || !body.company || !body.email) {
    return NextResponse.json(
      { error: "Name, company, and email are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin!
    .from("leads")
    .insert({
      id: crypto.randomUUID(),
      business_id: auth.context.businessId,
      name: String(body.name).trim(),
      company: String(body.company).trim(),
      email: String(body.email).trim(),
      phone: String(body.phone ?? "").trim(),
      status: body.status ?? "new",
      value: Number(body.value ?? 0),
      owner: body.owner ?? auth.context.user.email,
      next_action: body.nextAction ?? "Schedule first follow-up",
      last_contacted_at: new Date().toISOString(),
      tags: Array.isArray(body.tags) ? body.tags : [],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const activityWarning = await recordActivity(
    auth.context,
    `Added ${data.name} (${data.company}) to the sales pipeline.`,
    data.id,
  );

  return NextResponse.json(
    {
      item: {
        id: data.id,
        name: data.name,
        company: data.company,
        email: data.email,
        phone: data.phone,
        status: data.status,
        value: Number(data.value ?? 0),
        owner: data.owner,
        nextAction: data.next_action,
        lastContactAt: data.last_contacted_at,
        tags: data.tags ?? [],
      },
      ...(activityWarning ? { warning: activityWarning } : {}),
    },
    { status: 201 },
  );
}
