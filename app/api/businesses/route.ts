import { NextResponse } from "next/server";

import { requireWorkspace } from "@/lib/api-auth";
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

export async function POST() {
  return NextResponse.json(
    { error: "Create a business workspace through the authenticated onboarding flow." },
    { status: 405 },
  );
}
