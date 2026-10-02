import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();

  const businessName = String(body.businessName ?? "").trim();
  const fullName = String(body.fullName ?? "").trim();
  const industry = String(body.industry ?? "General Business").trim();

  if (!businessName || !fullName) {
    return NextResponse.json(
      {
        error: "businessName and fullName are required",
      },
      { status: 400 },
    );
  }

  const { data: existingProfile, error: lookupError } = await supabaseAdmin!
    .from("profiles")
    .select("id, full_name, email, business_id, role, created_at")
    .eq("id", auth.context.id)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: "Your account profile could not be checked." }, { status: 500 });
  }
  if (existingProfile) {
    return NextResponse.json({ error: "Your account already has a business workspace." }, { status: 409 });
  }

  const { data: legacyProfile, error: emailLookupError } = await supabaseAdmin!
    .from("profiles")
    .select("id, full_name, email, business_id, role, created_at")
    .eq("email", auth.context.email)
    .maybeSingle();

  if (emailLookupError) {
    return NextResponse.json({ error: "Your account profile could not be checked." }, { status: 500 });
  }

  if (legacyProfile) {
    if (legacyProfile.role !== "owner") {
      return NextResponse.json(
        { error: "This email already belongs to a team member. Ask the workspace owner to invite your Supabase account." },
        { status: 409 },
      );
    }

    const { data: linkedProfile, error: linkError } = await supabaseAdmin!
      .from("profiles")
      .update({ id: auth.context.id })
      .eq("id", legacyProfile.id)
      .select()
      .single();

    if (linkError) {
      return NextResponse.json({ error: "The existing workspace could not be linked to your account." }, { status: 409 });
    }

    if (legacyProfile.business_id) {
      const { error: ownerError } = await supabaseAdmin!
        .from("businesses")
        .update({ owner_id: auth.context.id })
        .eq("id", legacyProfile.business_id);

      if (ownerError) {
        return NextResponse.json({ error: "Your account was linked, but the workspace owner could not be updated." }, { status: 500 });
      }
    }

    const { data: linkedBusiness, error: businessLookupError } = await supabaseAdmin!
      .from("businesses")
      .select("id, name, industry, owner_id, created_at")
      .eq("id", legacyProfile.business_id)
      .maybeSingle();

    if (businessLookupError || !linkedBusiness) {
      return NextResponse.json({ error: "The linked business workspace could not be loaded." }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: "Your existing business workspace is linked to your account.",
        business: {
          id: linkedBusiness.id,
          name: linkedBusiness.name,
          industry: linkedBusiness.industry,
          ownerId: linkedBusiness.owner_id,
          createdAt: linkedBusiness.created_at,
        },
        profile: {
          id: linkedProfile.id,
          name: linkedProfile.full_name,
          email: linkedProfile.email,
          role: linkedProfile.role,
          businessId: linkedProfile.business_id,
          createdAt: linkedProfile.created_at,
        },
      },
      { status: 200 },
    );
  }

  const businessId = crypto.randomUUID();
  const { data: businessData, error: businessError } = await supabaseAdmin!
    .from("businesses")
    .insert({
      id: businessId,
      name: businessName,
      industry,
      owner_id: auth.context.id,
    })
    .select()
    .single();

  if (businessError) {
    return NextResponse.json({ error: businessError.message }, { status: 400 });
  }

  const { data: profileData, error: profileError } = await supabaseAdmin!
    .from("profiles")
    .insert({
      id: auth.context.id,
      full_name: fullName,
      email: auth.context.email,
      business_id: businessId,
      role: "owner",
    })
    .select()
    .single();

  if (profileError) {
    await supabaseAdmin!.from("businesses").delete().eq("id", businessId);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json(
    {
      message: "Business and owner profile created successfully",
      business: {
        id: businessData.id,
        name: businessData.name,
        industry: businessData.industry,
        ownerId: businessData.owner_id,
        createdAt: businessData.created_at,
      },
      profile: {
        id: profileData.id,
        name: profileData.full_name,
        email: profileData.email,
        role: profileData.role,
        businessId: profileData.business_id,
        createdAt: profileData.created_at,
      },
    },
    { status: 201 },
  );
}
