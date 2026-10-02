import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { requireWorkspace } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import type { LeadStatus } from "@/lib/types";

const allowedStatuses: LeadStatus[] = ["new", "contacted", "qualified", "proposal", "won", "lost"];

type Params = { params: Promise<{ id: string }> };

function serialize(data: Record<string, unknown>) {
  return {
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
    photoUrl: data.photoUrl ?? data.photo_url ?? null,
  };
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const { data, error } = await supabaseAdmin!
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("business_id", auth.context.businessId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Lead could not be loaded." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const item = serialize(data as unknown as Record<string, unknown>);
  if (typeof data.photo_path === "string" && data.photo_path) {
    const { data: signedPhoto, error: photoError } = await supabaseAdmin!.storage
      .from("lead-photos")
      .createSignedUrl(data.photo_path, 60 * 60);
    if (photoError) {
      return NextResponse.json({ error: "Lead photo could not be loaded." }, { status: 500 });
    }
    item.photoUrl = signedPhoto.signedUrl;
  }

  return NextResponse.json({ item });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json();

  const updatePayload: Record<string, unknown> = {};

  for (const field of ["name", "company", "email", "phone"] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || !body[field].trim()) {
        return NextResponse.json({ error: `${field} must be non-empty text` }, { status: 400 });
      }
      updatePayload[field] = body[field].trim();
    }
  }

  if (body.status !== undefined) {
    if (!allowedStatuses.includes(body.status as LeadStatus)) {
      return NextResponse.json(
        { error: `Status must be one of: ${allowedStatuses.join(", ")}` },
        { status: 400 },
      );
    }
    updatePayload.status = body.status;
  }

  if (body.nextAction !== undefined) {
    if (typeof body.nextAction !== "string") {
      return NextResponse.json({ error: "Next action must be text" }, { status: 400 });
    }
    updatePayload.next_action = body.nextAction;
  }

  if (body.owner !== undefined) {
    if (typeof body.owner !== "string") {
      return NextResponse.json({ error: "Owner must be text" }, { status: 400 });
    }
    updatePayload.owner = body.owner;
  }

  if (body.value !== undefined) {
    const numericValue = Number(body.value);
    if (Number.isNaN(numericValue) || numericValue < 0) {
      return NextResponse.json({ error: "Value must be a positive number" }, { status: 400 });
    }
    updatePayload.value = numericValue;
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: "No supported fields to update" }, { status: 400 });
  }

  updatePayload.last_contacted_at = new Date().toISOString();

  const { data: currentLead, error: currentLeadError } = await supabaseAdmin!
    .from("leads")
    .select("name, company, status")
    .eq("id", id)
    .eq("business_id", auth.context.businessId)
    .maybeSingle();

  if (currentLeadError) {
    return NextResponse.json({ error: "Lead could not be checked before updating." }, { status: 500 });
  }
  if (!currentLead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin!
    .from("leads")
    .update(updatePayload)
    .eq("id", id)
    .eq("business_id", auth.context.businessId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const description =
    body.status && body.status !== currentLead.status
      ? `Moved ${currentLead.name} from ${currentLead.status} to ${body.status}.`
      : `Updated lead details for ${currentLead.name}.`;
  const activityWarning = await recordActivity(auth.context, description, id);

  return NextResponse.json({
    item: serialize(data as unknown as Record<string, unknown>),
    ...(activityWarning ? { warning: activityWarning } : {}),
  });
}