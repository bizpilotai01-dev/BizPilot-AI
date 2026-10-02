import { NextResponse } from "next/server";

import { findInactiveLeads, parseThresholdDays, type InactiveLead } from "@/lib/inactive-leads";
import { supabaseAdmin } from "@/lib/supabase";
import type { LeadStatus } from "@/lib/types";

type ReminderTask = {
  id: string;
  title: string;
  due_date: string;
  leads: { id: string; name: string; company: string; business_id: string } | Array<{ id: string; name: string; company: string; business_id: string }>;
};


function getTodayInLagos() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function getTomorrow(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function getLead(task: ReminderTask) {
  return Array.isArray(task.leads) ? task.leads[0] : task.leads;
}

function formatTaskList(tasks: ReminderTask[], today: string) {
  return tasks.map((task) => {
    const lead = getLead(task);
    const timing = task.due_date < today
      ? `Overdue since ${task.due_date}`
      : task.due_date === today
        ? "Due today"
        : "Due tomorrow";
    return `• ${task.title} — ${lead.name} (${lead.company}), ${timing}`;
  }).join("\n");
}

// WhatsApp template bodies are length-capped, so the list is ordered by
// severity and the quiet-lead digest is appended only if there is room.
function formatInactiveList(alerts: InactiveLead[], limit = 5) {
  return alerts.slice(0, limit).map((alert) => `• ${alert.reason}`).join("\n");
}

function buildDigest(tasks: ReminderTask[], alerts: InactiveLead[], today: string) {
  const blocks: string[] = [];

  if (tasks.length) {
    blocks.push(`Here are your open follow-ups due tomorrow or overdue:\n\n${formatTaskList(tasks, today)}`);
  }
  if (alerts.length) {
    const subject = alerts.length === 1 ? "lead has" : "leads have";
    blocks.push(
      `${alerts.length} open ${subject} gone quiet inside your alert window:\n\n${formatInactiveList(alerts)}`,
    );
  }
  blocks.push("Review your leads and tasks in BizPilot.");

  return blocks.join("\n\n");
}

async function sendEmail(to: string, digest: string, hasTasks: boolean) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      subject: hasTasks ? "BizPilot follow-up reminders" : "BizPilot inactive lead alerts",
      text: digest,
    }),
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
}

async function sendWhatsApp(to: string, digest: string) {
  const template = process.env.WHATSAPP_REMINDER_TEMPLATE;
  if (!template) throw new Error("Set an approved WhatsApp reminder template before enabling WhatsApp reminders.");

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
          components: [{
            type: "body",
            parameters: [{ type: "text", text: digest.slice(0, 900) }],
          }],
        },
      }),
    },
  );
  if (!response.ok) throw new Error(`WhatsApp provider returned HTTP ${response.status}.`);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Reminder delivery is not configured." }, { status: 503 });
  }

  const today = getTodayInLagos();
  const tomorrow = getTomorrow(today);
  const [
    { data: tasks, error: tasksError },
    { data: profiles, error: profilesError },
    { data: businesses, error: businessesError },
    { data: openLeads, error: leadsError },
  ] = await Promise.all([
    supabaseAdmin
      .from("tasks")
      .select("id, title, due_date, leads!inner(id, name, company, business_id)")
      .eq("status", "pending")
      .lte("due_date", tomorrow),
    supabaseAdmin
      .from("profiles")
      .select("id, business_id, email, phone, reminder_email_enabled, reminder_whatsapp_enabled")
      .not("business_id", "is", null),
    supabaseAdmin.from("businesses").select("id, inactivity_threshold_days"),
    supabaseAdmin
      .from("leads")
      .select("id, business_id, name, company, status, value, last_contacted_at, created_at"),
  ]);
  if (tasksError || profilesError || businessesError || leadsError) {
    return NextResponse.json({ error: "Due tasks or reminder recipients could not be loaded." }, { status: 500 });
  }

  const dueTasks = (tasks ?? []) as ReminderTask[];

  // Alert windows are per-workspace, so each workspace is filtered separately.
  const alertsByBusiness = new Map<string, InactiveLead[]>();
  for (const row of openLeads ?? []) {
    if (!row.business_id) continue;
    const thresholdDays = parseThresholdDays(
      businesses?.find((business) => business.id === row.business_id)?.inactivity_threshold_days,
    );
    const found = findInactiveLeads(
      [
        {
          id: row.id,
          name: row.name,
          company: row.company ?? "",
          status: (row.status ?? "new") as LeadStatus,
          value: row.value,
          lastContactAt: row.last_contacted_at,
          createdAt: row.created_at,
        },
      ],
      { thresholdDays },
    );
    if (!found.length) continue;
    alertsByBusiness.set(row.business_id, [...(alertsByBusiness.get(row.business_id) ?? []), ...found]);
  }
  for (const [businessId, alerts] of alertsByBusiness) {
    alerts.sort((left, right) => right.idleDays - left.idleDays || right.value - left.value);
    alertsByBusiness.set(businessId, alerts);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const profile of profiles ?? []) {
    const profileTasks = dueTasks.filter((task) => getLead(task)?.business_id === profile.business_id);
    const profileAlerts = profile.business_id ? alertsByBusiness.get(profile.business_id) ?? [] : [];
    // A recipient with neither due tasks nor stale leads has nothing to be told.
    if (!profileTasks.length && !profileAlerts.length) continue;

    const digest = buildDigest(profileTasks, profileAlerts, today);

    for (const channel of ["email", "whatsapp"] as const) {
      const enabled = channel === "email" ? profile.reminder_email_enabled : profile.reminder_whatsapp_enabled;
      const recipient = channel === "email" ? profile.email : profile.phone;
      if (!enabled) continue;
      if (!recipient) {
        failed += 1;
        continue;
      }

      const { data: existing, error: lookupError } = await supabaseAdmin
        .from("reminder_deliveries")
        .select("id, status, created_at")
        .eq("profile_id", profile.id)
        .eq("channel", channel)
        .eq("reminder_date", today)
        .maybeSingle();
      if (lookupError) {
        failed += 1;
        continue;
      }
      const processingAge = existing?.status === "processing"
        ? Date.now() - new Date(existing.created_at).getTime()
        : 0;
      if (existing?.status === "sent" || (existing?.status === "processing" && processingAge < 15 * 60_000)) {
        skipped += 1;
        continue;
      }

      const { data: delivery, error: insertError } = await supabaseAdmin
        .from("reminder_deliveries")
        .upsert({
          ...(existing?.id ? { id: existing.id } : {}),
          profile_id: profile.id,
          channel,
          reminder_date: today,
          status: "processing",
          error: null,
        }, { onConflict: "profile_id,channel,reminder_date" })
        .select("id")
        .single();
      if (insertError || !delivery) {
        failed += 1;
        continue;
      }

      try {
        if (channel === "email") {
          if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
            throw new Error("Resend email settings are not configured.");
          }
          await sendEmail(recipient, digest, profileTasks.length > 0);
        } else {
          if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
            throw new Error("Meta WhatsApp settings are not configured.");
          }
          await sendWhatsApp(recipient, digest);
        }
        const { error: updateError } = await supabaseAdmin
          .from("reminder_deliveries")
          .update({ status: "sent" })
          .eq("id", delivery.id);
        if (updateError) throw new Error("Reminder sent, but delivery status could not be saved.");
        sent += 1;
      } catch (deliveryError) {
        const { error: statusError } = await supabaseAdmin
          .from("reminder_deliveries")
          .update({ status: "failed", error: deliveryError instanceof Error ? deliveryError.message : "Delivery failed." })
          .eq("id", delivery.id);
        if (statusError) {
          return NextResponse.json({ error: "Delivery failed and its retry status could not be recorded." }, { status: 500 });
        }
        failed += 1;
      }
    }
  }

  return NextResponse.json({
    date: today,
    dueTaskCount: dueTasks.length,
    inactiveLeadCount: [...alertsByBusiness.values()].reduce((sum, alerts) => sum + alerts.length, 0),
    sent,
    failed,
    skipped,
  });
}
