import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { requireWorkspace } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const { id: leadId } = await params;
  const { data: lead, error: leadError } = await supabaseAdmin!
    .from("leads")
    .select("id, name")
    .eq("id", leadId)
    .eq("business_id", auth.context.businessId)
    .maybeSingle();

  if (leadError) {
    return NextResponse.json({ error: "Lead could not be verified." }, { status: 500 });
  }
  if (!lead) {
    return NextResponse.json({ error: "Lead not found in this workspace." }, { status: 404 });
  }

  const { data: notes, error: notesError } = await supabaseAdmin!
    .from("notes")
    .select("id, lead_id, content, created_by, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (notesError) {
    return NextResponse.json({ error: "Lead notes could not be loaded." }, { status: 500 });
  }

  const profileIds = [...new Set((notes ?? []).flatMap((note) => note.created_by ? [note.created_by] : []))];
  const profileNames = new Map<string, string>();

  if (profileIds.length) {
    const { data: profiles, error: profilesError } = await supabaseAdmin!
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds)
      .eq("business_id", auth.context.businessId);

    if (profilesError) {
      return NextResponse.json({ error: "Note authors could not be loaded." }, { status: 500 });
    }

    for (const profile of profiles ?? []) {
      profileNames.set(profile.id, profile.full_name || auth.context.user.email);
    }
  }

  return NextResponse.json({
    items: (notes ?? []).map((note) => ({
      id: note.id,
      leadId: note.lead_id,
      content: note.content,
      author: note.created_by ? profileNames.get(note.created_by) ?? "Workspace member" : "Workspace member",
      createdAt: note.created_at,
    })),
  });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const { id: leadId } = await params;
  let body: { content?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Write a note before saving." }, { status: 400 });
  }
  if (content.length > 5000) {
    return NextResponse.json({ error: "Notes must be 5,000 characters or fewer." }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabaseAdmin!
    .from("leads")
    .select("id, name")
    .eq("id", leadId)
    .eq("business_id", auth.context.businessId)
    .maybeSingle();

  if (leadError) {
    return NextResponse.json({ error: "Lead could not be verified." }, { status: 500 });
  }
  if (!lead) {
    return NextResponse.json({ error: "Lead not found in this workspace." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin!
    .from("notes")
    .insert({
      id: crypto.randomUUID(),
      lead_id: leadId,
      content,
      created_by: auth.context.user.id,
    })
    .select("id, lead_id, content, created_by, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "The note could not be saved." }, { status: 500 });
  }

  const { data: profile, error: profileError } = await supabaseAdmin!
    .from("profiles")
    .select("full_name")
    .eq("id", auth.context.user.id)
    .eq("business_id", auth.context.businessId)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: "The note was saved, but its author could not be loaded." }, { status: 500 });
  }

  const activityWarning = await recordActivity(
    auth.context,
    `Added a note to ${lead.name}’s history.`,
    leadId,
  );

  return NextResponse.json(
    {
      item: {
        id: data.id,
        leadId: data.lead_id,
        content: data.content,
        author: profile?.full_name || auth.context.user.email,
        createdAt: data.created_at,
      },
      ...(activityWarning ? { warning: activityWarning } : {}),
    },
    { status: 201 },
  );
}
