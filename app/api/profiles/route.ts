import { NextResponse } from "next/server";

import { requireWorkspace } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin!
    .from("profiles")
    .select("id, full_name, email, role, business_id, created_at, avatar_path")
    .eq("business_id", auth.context.businessId);

  if (error) {
    return NextResponse.json({ error: "Workspace profiles could not be loaded." }, { status: 500 });
  }

  const items = await Promise.all((data ?? []).map(async (profile) => {
    let photoUrl: string | null = null;
    if (profile.avatar_path) {
      const { data: photo, error: photoError } = await supabaseAdmin!.storage
        .from("profile-photos")
        .createSignedUrl(profile.avatar_path, 60 * 60);
      if (photoError) return { error: true as const };
      photoUrl = photo.signedUrl;
    }
    return {
      id: profile.id,
      name: profile.full_name,
      email: profile.email,
      role: profile.role,
      businessId: profile.business_id,
      createdAt: profile.created_at,
      photoUrl,
      isCurrentUser: profile.id === auth.context.user.id,
    };
  }));

  if (items.some((profile) => "error" in profile)) {
    return NextResponse.json({ error: "Team profile photos could not be loaded." }, { status: 500 });
  }
  return NextResponse.json({ items });
}

export async function POST() {
  return NextResponse.json(
    { error: "Additional team members must be invited through Supabase Auth before profile creation." },
    { status: 405 },
  );
}
