import { NextResponse } from "next/server";

import { requireWorkspace } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

const bucket = "profile-photos";
const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const maxFileSize = 3 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const formData = await request.formData();
  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a profile photo to upload." }, { status: 400 });
  }
  const extension = allowedTypes.get(file.type);
  if (!extension) {
    return NextResponse.json({ error: "Use a JPG, PNG, or WebP image." }, { status: 400 });
  }
  if (file.size === 0 || file.size > maxFileSize) {
    return NextResponse.json({ error: "Choose an image smaller than 3 MB." }, { status: 400 });
  }

  const { data: profile, error: lookupError } = await supabaseAdmin!
    .from("profiles")
    .select("avatar_path")
    .eq("id", auth.context.user.id)
    .eq("business_id", auth.context.businessId)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Your profile could not be checked." }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "Your workspace profile was not found." }, { status: 404 });

  const path = `${auth.context.businessId}/${auth.context.user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabaseAdmin!.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return NextResponse.json({ error: "Profile photo upload failed." }, { status: 500 });

  const { error: updateError } = await supabaseAdmin!
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", auth.context.user.id)
    .eq("business_id", auth.context.businessId);
  if (updateError) {
    await supabaseAdmin!.storage.from(bucket).remove([path]);
    return NextResponse.json({ error: "Profile photo could not be saved." }, { status: 500 });
  }
  if (profile.avatar_path) {
    const { error: cleanupError } = await supabaseAdmin!.storage.from(bucket).remove([profile.avatar_path]);
    if (cleanupError) {
      const { data: photo, error: signedError } = await supabaseAdmin!.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60);
      if (signedError) return NextResponse.json({ error: "Photo updated but could not be displayed." }, { status: 500 });
      return NextResponse.json({ photoUrl: photo.signedUrl, warning: "Photo updated, but the previous file could not be removed." });
    }
  }

  const { data: photo, error: signedError } = await supabaseAdmin!.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);
  if (signedError) return NextResponse.json({ error: "Photo saved but could not be displayed." }, { status: 500 });

  return NextResponse.json({ photoUrl: photo.signedUrl });
}
