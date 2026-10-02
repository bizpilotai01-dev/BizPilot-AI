import { NextResponse } from "next/server";

import { requireWorkspace } from "@/lib/api-auth";
import { parseThresholdDays } from "@/lib/inactive-leads";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin!
    .from("businesses")
    .select("*")
    .eq("id", auth.context.businessId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Business profile could not be loaded." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Business not found." }, { status: 404 });
  }

  return NextResponse.json({ items: [data] });
}

export async function PATCH(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  if (body.inactivityThresholdDays === undefined) {
    return NextResponse.json({ error: "No supported fields to update." }, { status: 400 });
  }
  if (typeof body.inactivityThresholdDays !== "number" || !Number.isInteger(body.inactivityThresholdDays)) {
    return NextResponse.json({ error: "inactivityThresholdDays must be a whole number." }, { status: 400 });
  }

  const thresholdDays = parseThresholdDays(body.inactivityThresholdDays);
  if (thresholdDays !== body.inactivityThresholdDays) {
    return NextResponse.json(
      { error: "inactivityThresholdDays must be between 1 and 90." },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin!
    .from("businesses")
    .update({ inactivity_threshold_days: thresholdDays })
    .eq("id", auth.context.businessId);

  if (error) {
    return NextResponse.json({ error: "The inactivity alert window could not be saved." }, { status: 500 });
  }

  return NextResponse.json({ inactivityThresholdDays: thresholdDays });
}

export async function POST() {
  return NextResponse.json(
    { error: "Create a business workspace through the authenticated onboarding flow." },
    { status: 405 },
  );
}
