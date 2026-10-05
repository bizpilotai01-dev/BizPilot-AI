import { NextResponse } from "next/server";

import { requireWorkspace } from "@/lib/api-auth";
import { isValidReminderPhone, normalizeReminderPhone } from "@/lib/reminder-preferences";
import { supabaseAdmin } from "@/lib/supabase";

function channelConfiguration() {
  return {
    email: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    whatsapp: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_REMINDER_TEMPLATE,
    ),
  };
}

export async function GET(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin!
    .from("profiles")
    .select("phone, reminder_email_enabled, reminder_whatsapp_enabled")
    .eq("id", auth.context.user.id)
    .eq("business_id", auth.context.businessId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Reminder preferences could not be loaded." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Workspace profile not found." }, { status: 404 });

  return NextResponse.json({
    phone: data.phone ?? "",
    emailEnabled: data.reminder_email_enabled,
    whatsappEnabled: data.reminder_whatsapp_enabled,
    configured: channelConfiguration(),
  });
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

  const update: Record<string, unknown> = {};
  if (body.phone !== undefined) {
    if (typeof body.phone !== "string") {
      return NextResponse.json({ error: "Phone must be text." }, { status: 400 });
    }
    const phone = normalizeReminderPhone(body.phone);
    if (phone && !isValidReminderPhone(phone)) {
      return NextResponse.json({ error: "Enter a phone number in international format, e.g. +2348012345678." }, { status: 400 });
    }
    update.phone = phone || null;
  }
  for (const [field, column] of [
    ["emailEnabled", "reminder_email_enabled"],
    ["whatsappEnabled", "reminder_whatsapp_enabled"],
  ] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "boolean") {
        return NextResponse.json({ error: `${field} must be true or false.` }, { status: 400 });
      }
      update[column] = body[field];
    }
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "No reminder preferences were provided." }, { status: 400 });
  }

  const { error } = await supabaseAdmin!
    .from("profiles")
    .update(update)
    .eq("id", auth.context.user.id)
    .eq("business_id", auth.context.businessId);
  if (error) return NextResponse.json({ error: "Reminder preferences could not be saved." }, { status: 500 });

  return NextResponse.json({ message: "Reminder preferences saved." });
}
