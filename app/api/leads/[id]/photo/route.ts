import { NextResponse } from "next/server";

import { requireWorkspace } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

const bucket = "lead-photos";
const maxFileSize = 3 * 1024 * 1024;
const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

type Params = { params: Promise<{ id: string }> };

async function findLeadPhotoPath(leadId: string, businessId: string) {
  const { data, error } = await supabaseAdmin!
    .from("leads")
    .select("photo_path")
    .eq("id", leadId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: "Lead photo could not be checked." }, { status: 500 }) };
  }
  if (!data) {
    return { error: NextResponse.json({ error: "Lead not found." }, { status: 404 }) };
  }

  return { path: typeof data.photo_path === "string" ? data.photo_path : null };
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const lead = await findLeadPhotoPath(id, auth.context.businessId);
  if (lead.error) return lead.error;

  const formData = await request.formData();
  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
  }

  const extension = allowedTypes.get(file.type);
  if (!extension) {
    return NextResponse.json({ error: "Use a JPG, PNG, or WebP image." }, { status: 400 });
  }
  if (file.size === 0 || file.size > maxFileSize) {
    return NextResponse.json({ error: "Choose an image smaller than 3 MB." }, { status: 400 });
  }

  const path = `${auth.context.businessId}/${id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabaseAdmin!.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: "Photo upload failed. Please try again." }, { status: 500 });
  }

  const { error: updateError } = await supabaseAdmin!
    .from("leads")
    .update({ photo_path: path })
    .eq("id", id)
    .eq("business_id", auth.context.businessId);

  if (updateError) {
    await supabaseAdmin!.storage.from(bucket).remove([path]);
    return NextResponse.json({ error: "Photo could not be saved to this lead." }, { status: 500 });
  }

  const oldPath = lead.path;
  const cleanupWarning = oldPath
    ? (await supabaseAdmin!.storage.from(bucket).remove([oldPath])).error
    : null;

  const { data: signedPhoto, error: signedUrlError } = await supabaseAdmin!.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);
  if (signedUrlError) {
    return NextResponse.json({ error: "Photo was saved but could not be displayed. Reload the page." }, { status: 500 });
  }

  return NextResponse.json({
    photoUrl: signedPhoto.signedUrl,
    ...(cleanupWarning ? { warning: "The new photo was saved, but the previous file could not be removed." } : {}),
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const lead = await findLeadPhotoPath(id, auth.context.businessId);
  if (lead.error) return lead.error;
  if (!lead.path) return NextResponse.json({ error: "This lead has no profile photo." }, { status: 404 });

  const { error: updateError } = await supabaseAdmin!
    .from("leads")
    .update({ photo_path: null })
    .eq("id", id)
    .eq("business_id", auth.context.businessId);
  if (updateError) {
    return NextResponse.json({ error: "Photo could not be removed from this lead." }, { status: 500 });
  }

  const { error: removeError } = await supabaseAdmin!.storage.from(bucket).remove([lead.path]);
  return NextResponse.json({
    photoUrl: null,
    ...(removeError ? { warning: "The photo was unlinked, but its stored file could not be removed." } : {}),
  });
}
